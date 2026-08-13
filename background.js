importScripts('models.js');

const SLOTS = ['slot1', 'slot2', 'slot3'];

async function getKeys() {
    return chrome.storage.local.get(['geminiApiKey', 'openaiApiKey']);
}

// Resolves the model assigned to a slot. If nothing has been picked yet,
// the first model the provider APIs currently return is used.
async function resolveSlotModel(slot) {
    const keys = await getKeys();
    const stored = (await chrome.storage.local.get(slot))[slot];
    if (stored && stored.id && stored.provider) return stored;

    const { models, errors } = await fetchAvailableModels(keys);
    if (!models.length) {
        throw new Error(errors.length ? errors.join(' | ') : 'No API key set. Open the settings and save a key.');
    }
    const fallback = models[0];
    await chrome.storage.local.set({ [slot]: fallback });
    return fallback;
}

const solveQuestion = async (slot) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await chrome.tabs.sendMessage(tab.id, { action: "show_processing" });
    } catch (e) {
        console.log("Content script not ready, injecting...", e);
        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] });
            setTimeout(() => chrome.tabs.sendMessage(tab.id, { action: "show_processing" }), 100);
        } catch (injectionError) {
            console.error("Failed to inject", injectionError);
            return;
        }
    }

    try {
        const model = await resolveSlotModel(slot);
        const keys = await getKeys();
        const apiKey = model.provider === 'openai' ? keys.openaiApiKey : keys.geminiApiKey;

        if (!apiKey) {
            chrome.tabs.sendMessage(tab.id, { action: "error", message: `Set the ${model.provider === 'openai' ? 'OpenAI' : 'Gemini'} API key first.` });
            return;
        }

        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
        const base64Image = dataUrl.split(',')[1];

        console.log(`Querying ${model.provider}/${model.id}...`);
        const finalAnswer = model.provider === 'openai'
            ? await analyzeImageOpenAI(apiKey, base64Image, model.id)
            : await analyzeImage(apiKey, base64Image, model.id);

        console.log(`Final Decision: ${finalAnswer} via ${model.provider}/${model.id}`);
        updateIcon(finalAnswer);
    } catch (error) {
        console.error("Error processing:", error);
        chrome.tabs.sendMessage(tab.id, { action: "error", message: error.message });
        chrome.action.setIcon({ imageData: drawIcon('#FF0000') });
        setTimeout(() => chrome.action.setIcon({ imageData: drawIcon('#FFFFFF') }), 1000);
    }
};

function drawIcon(textColor) {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = textColor;
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Y', 64, 64);

    return ctx.getImageData(0, 0, 128, 128);
}

function updateIcon(color) {
    const c = color.toLowerCase().trim();
    let hex = '#FFFFFF';

    if (c.includes('red') || c.includes('triangle')) {
        hex = '#FF3355';
    } else if (c.includes('blue') || c.includes('diamond')) {
        hex = '#45A3E5';
    } else if (c.includes('yellow') || c.includes('circle')) {
        hex = '#FFD700';
    } else if (c.includes('green') || c.includes('square')) {
        hex = '#66BF39';
    }

    chrome.action.setIcon({ imageData: drawIcon(hex) });
    setTimeout(() => {
        chrome.action.setIcon({ imageData: drawIcon('#000000') });
    }, 1000);
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "solve-slot-1") await solveQuestion(SLOTS[0]);
    else if (command === "solve-slot-2") await solveQuestion(SLOTS[1]);
    else if (command === "solve-slot-3") await solveQuestion(SLOTS[2]);
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setIcon({ imageData: drawIcon('#000000') });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "manual_solve") {
        solveQuestion(request.slot || SLOTS[0]);
    } else if (request.action === "list_models") {
        getKeys()
            .then(fetchAvailableModels)
            .then(sendResponse)
            .catch((e) => sendResponse({ models: [], errors: [e.message] }));
        return true;
    }
});

const PROMPT = `
    You are a Kahoot helper. Look at the image which shows a Kahoot question and answer options.
    The answer options correspond to these colors/shapes:
    - Red (Triangle)
    - Blue (Diamond)
    - Yellow (Circle)
    - Green (Square)

    Think step by step to identify the correct answer:
    1. Read the question text.
    2. Identify the answer options.
    3. Determine which option is correct based on your knowledge.
    4. If there is a checkmark indicating a previous correct answer, use that.

    Output valid JSON ONLY in this format:
    {
      "reasoning": "Your step-by-step reasoning here",
      "answer": "red"
    }
  `;

async function analyzeImage(apiKey, base64Image, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: PROMPT },
                    { inline_data: { mime_type: "image/png", data: base64Image } }
                ]
            }]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${model} Error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const text = result.candidates[0].content.parts[0].text;
    return parseResponse(text);
}

function parseResponse(text) {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(cleaned);
        console.log("AI Reasoning:", json.reasoning);
        return json.answer.trim().toLowerCase();
    } catch (e) {
        console.warn("Failed to parse JSON, falling back to raw text:", text);
        return text.trim().toLowerCase();
    }
}

async function analyzeImageOpenAI(apiKey, base64Image, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: PROMPT },
                        { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
                    ]
                }
            ],
            max_completion_tokens: 300
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI Error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const text = result.choices[0].message.content;
    return parseResponse(text);
}

importScripts('models.js');

const SLOTS = ['slot1', 'slot2', 'slot3'];

async function getKeys() {
    return chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'openaiBaseUrl']);
}

// The content script is absent on restricted pages; a failed notify must not
// mask the underlying result or error.
async function notifyTab(tabId, message) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
        console.log('Could not reach content script:', e.message);
    }
}

// Only use an explicit user selection; never silently choose a paid model.
async function resolveSlotModel(slot) {
    if (!SLOTS.includes(slot)) throw new Error('Invalid model slot.');
    const stored = (await chrome.storage.local.get(slot))[slot];
    if (stored?.id && ['openai', 'gemini'].includes(stored.provider)) return stored;
    throw new Error('Select a model for this slot in settings first.');
}

// On pages loaded before the extension, the content script has to be injected
// on demand before it can receive any message.
async function startProcessingIndicator(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, { action: "show_processing" });
    } catch (e) {
        console.log("Content script not ready, injecting...", e.message);
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
        await notifyTab(tabId, { action: "show_processing" });
    }
}

// Guards against a held-down shortcut firing several paid API calls at once.
let solveInFlight = false;

const solveQuestion = async (slot) => {
    if (solveInFlight) {
        console.log('A solve is already running, ignoring this trigger.');
        return;
    }

    solveInFlight = true;
    let tab;
    try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        await startProcessingIndicator(tab.id);

        const model = await resolveSlotModel(slot);
        const keys = await getKeys();
        const apiKey = model.provider === 'openai' ? keys.openaiApiKey : keys.geminiApiKey;

        if (!apiKey) {
            await notifyTab(tab.id, { action: "error", message: `Set the ${model.provider === 'openai' ? 'OpenAI' : 'Gemini'} API key first.` });
            return;
        }

        const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
        if (activeTab?.id !== tab.id) throw new Error('The active tab changed. Please try again.');
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        const base64Image = dataUrl.split(',')[1];

        console.log(`Querying ${model.provider}/${model.id}...`);
        const finalAnswer = model.provider === 'openai'
            ? await analyzeImageOpenAI(apiKey, base64Image, model.id, keys.openaiBaseUrl)
            : await analyzeImage(apiKey, base64Image, model.id);

        console.log(`Final Decision: ${finalAnswer} via ${model.provider}/${model.id}`);
        await notifyTab(tab.id, { action: "highlight_answer", answer: finalAnswer });
        updateIcon(finalAnswer);
    } catch (error) {
        console.error("Error processing:", error);
        if (tab) await notifyTab(tab.id, { action: "error", message: error.message });
        chrome.action.setIcon({ imageData: drawIcon('#FF0000') });
        setTimeout(() => chrome.action.setIcon({ imageData: drawIcon('#000000') }), 1000);
    } finally {
        solveInFlight = false;
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

    Identify the correct answer without outputting reasoning:
    1. Read the question text.
    2. Identify the answer options.
    3. Determine which option is correct based on your knowledge.
    4. If there is a checkmark indicating a previous correct answer, use that.

    Output valid JSON ONLY in this format:
    {
      "answer": "red"
    }
  `;

async function analyzeImage(apiKey, base64Image, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await apiFetch(url, {
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
    const text = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
    if (!text) throw new Error('Gemini returned no answer (possibly blocked or truncated).');
    return parseResponse(text);
}

function parseResponse(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('The AI returned no answer.');
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let answer;
    try {
        answer = JSON.parse(cleaned).answer;
    } catch {
        answer = cleaned;
    }
    const aliases = { triangle: 'red', diamond: 'blue', circle: 'yellow', square: 'green' };
    if (typeof answer !== 'string') throw new Error('The AI returned an invalid answer.');
    answer = answer.trim().toLowerCase();
    answer = aliases[answer] || answer;
    if (!['red', 'blue', 'yellow', 'green'].includes(answer)) {
        throw new Error('The AI returned an invalid or incomplete answer. Please try again.');
    }
    return answer;
}

async function analyzeImageOpenAI(apiKey, base64Image, model, baseUrl) {
    const response = await apiFetch(`${normalizeOpenAIBaseUrl(baseUrl)}/chat/completions`, {
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
            ]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI Error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    if (result.choices?.[0]?.finish_reason === 'length') throw new Error('The model response was truncated. Try another model.');
    const text = result.choices?.[0]?.message?.content;
    return parseResponse(text);
}

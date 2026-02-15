const solveQuestion = async (modelType) => {
    console.log(`Solving question with ${modelType}...`);

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
            alert("Refresh required.");
            return;
        }
    }

    const data = await chrome.storage.local.get(['geminiApiKey', 'openaiApiKey']);

    let apiKey = data.geminiApiKey;
    if (modelType === 'gpt-5.2') {
        apiKey = data.openaiApiKey;
    }

    if (!apiKey) {
        chrome.tabs.sendMessage(tab.id, { action: "error", message: `Set ${modelType === 'gpt-5.2' ? 'OpenAI' : 'Gemini'} API Key first.` });
        return;
    }

    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
        const base64Image = dataUrl.split(',')[1];

        // Determine specific model ID
        let finalAnswer;
        if (modelType === 'gpt-5.2') {
            console.log(`Querying OpenAI ${modelType}...`);
            finalAnswer = await analyzeImageOpenAI(apiKey, base64Image, 'gpt-5.2');
        } else {
            const modelId = modelType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
            console.log(`Querying Gemini ${modelId}...`);
            finalAnswer = await analyzeImage(apiKey, base64Image, modelId);
        }
        const method = modelType; // Aligning with the new snippet's variable name
        console.log(`Final Decision: ${finalAnswer} via ${method}`);

        // 1. Send result to content script (DISABLED per user request)
        // chrome.tabs.sendMessage(tab.id, { action: "highlight_answer", answer: finalAnswer, source: method });

        // 2. Set Extension Icon Color
        updateIcon(finalAnswer);
    } catch (error) {
        console.error("Error processing:", error);
        chrome.tabs.sendMessage(tab.id, { action: "error", message: error.message });
        // Error state: pure red 'Y'
        chrome.action.setIcon({ imageData: drawIcon('#FF0000') });
        setTimeout(() => chrome.action.setIcon({ imageData: drawIcon('#FFFFFF') }), 1000);
    }
};

function drawIcon(textColor) {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // Fill background (Dark Gray like original icon)
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 128, 128);

    // Draw 'Y' with requested color
    ctx.fillStyle = textColor;
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Y', 64, 64);

    return ctx.getImageData(0, 0, 128, 128);
}

function updateIcon(color) {
    const c = color.toLowerCase().trim();
    let hex = '#FFFFFF'; // Default White

    if (c.includes('red') || c.includes('triangle')) {
        hex = '#FF3355'; // Kahoot Red
    } else if (c.includes('blue') || c.includes('diamond')) {
        hex = '#45A3E5'; // Kahoot Blue
    } else if (c.includes('yellow') || c.includes('circle')) {
        hex = '#FFD700'; // Gold (High contrast Yellow)
    } else if (c.includes('green') || c.includes('square')) {
        hex = '#66BF39'; // Kahoot Green
    }

    // Set colored icon
    chrome.action.setIcon({ imageData: drawIcon(hex) });

    // Revert to Black 'Y' after 1 second
    setTimeout(() => {
        chrome.action.setIcon({ imageData: drawIcon('#000000') });
    }, 1000);
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "solve-question") {
        await solveQuestion('flash');
    } else if (command === "solve-question-pro") {
        await solveQuestion('pro');
    } else if (command === "solve-question-gpt") {
        await solveQuestion('gpt-5.2');
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setIcon({ imageData: drawIcon('#000000') });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "manual_solve") {
        solveQuestion(request.model || 'flash');
    }
});

async function analyzeImage(apiKey, base64Image, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `
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

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/jpeg", data: base64Image } }
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
    const url = 'https://api.openai.com/v1/chat/completions';

    const prompt = `
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

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4-turbo", // Using a valid model as fallback/default if "gpt-5.2" isn't real yet, or pass 'model' if user insists
            // Actually, user requested "gpt-5.2", I will try to pass that, but fallback to gpt-4o/turbo if needed for real usage.
            // For now, I will blindly pass what was requested or a known working vision model alias.
            // Let's stick to the prompt's instruction: "gpt-5.2".
            model: model,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                "url": `data:image/jpeg;base64,${base64Image}`
                            }
                        }
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

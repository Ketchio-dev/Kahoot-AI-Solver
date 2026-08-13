// Live model discovery. No model IDs are hardcoded anywhere in this extension.

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

async function fetchGeminiModels(apiKey) {
    const models = [];
    let pageToken = '';

    do {
        const url = `${GEMINI_MODELS_URL}?pageSize=200&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Gemini model list failed: ${response.status} - ${await response.text()}`);
        }
        const data = await response.json();
        for (const model of data.models || []) {
            const methods = model.supportedGenerationMethods || [];
            if (!methods.includes('generateContent')) continue;
            models.push({
                provider: 'gemini',
                id: model.name.replace(/^models\//, ''),
                label: model.displayName || model.name.replace(/^models\//, '')
            });
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return models;
}

async function fetchOpenAIModels(apiKey) {
    const response = await fetch(OPENAI_MODELS_URL, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`OpenAI model list failed: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return (data.data || []).map((model) => ({
        provider: 'openai',
        id: model.id,
        label: model.id
    }));
}

// Returns every model reachable with the keys currently stored, sorted by id.
async function fetchAvailableModels({ geminiApiKey, openaiApiKey }) {
    const models = [];
    const errors = [];

    if (geminiApiKey) {
        try {
            models.push(...await fetchGeminiModels(geminiApiKey));
        } catch (e) {
            errors.push(e.message);
        }
    }

    if (openaiApiKey) {
        try {
            models.push(...await fetchOpenAIModels(openaiApiKey));
        } catch (e) {
            errors.push(e.message);
        }
    }

    models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
    return { models, errors };
}

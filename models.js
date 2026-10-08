// Live model discovery. No model IDs are hardcoded anywhere in this extension.

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function normalizeOpenAIBaseUrl(value) {
    const url = new URL(value || DEFAULT_OPENAI_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('API URL must be an HTTP(S) address without credentials, query or fragment.');
    }
    return url.href.replace(/\/$/, '');
}

async function apiFetch(url, options = {}) {
    // Fail before Chrome can terminate an MV3 worker waiting 30s for fetch.
    try {
        return await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
    } catch (error) {
        if (error.name === 'TimeoutError') {
            throw new Error('The API did not respond within 25 seconds. Try again or choose another model.');
        }
        throw error;
    }
}

async function fetchGeminiModels(apiKey) {
    const models = [];
    let pageToken = '';

    do {
        const url = `${GEMINI_MODELS_URL}?pageSize=200&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const response = await apiFetch(url);
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

// The OpenAI model list carries no modality metadata, so models that cannot
// possibly accept an image on /v1/chat/completions are filtered out by id.
const OPENAI_NON_CHAT_PATTERNS = [
    /whisper/, /^tts-/, /^dall-e/, /embedding/, /moderation/, /^omni-moderation/,
    /^text-(davinci|curie|babbage|ada)/, /^davinci/, /^babbage/, /^codex-mini/,
    /audio/, /realtime/, /transcribe/, /^sora/, /image/, /^gpt-3\.5/
];

function isLikelyVisionChatModel(id) {
    return !OPENAI_NON_CHAT_PATTERNS.some((pattern) => pattern.test(id));
}

async function fetchOpenAIModels(apiKey, baseUrl) {
    const response = await apiFetch(`${normalizeOpenAIBaseUrl(baseUrl)}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`OpenAI model list failed: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    return (data.data || [])
        .filter((model) => model.capabilities?.vision === true ||
            (model.capabilities?.vision !== false && isLikelyVisionChatModel(model.id)))
        .map((model) => ({
            provider: 'openai',
            id: model.id,
            label: model.id
        }));
}

// Returns every model reachable with the keys currently stored, sorted by id.
async function fetchAvailableModels({ geminiApiKey, openaiApiKey, openaiBaseUrl }) {
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
            models.push(...await fetchOpenAIModels(openaiApiKey, openaiBaseUrl));
        } catch (e) {
            errors.push(e.message);
        }
    }

    models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
    return { models, errors };
}

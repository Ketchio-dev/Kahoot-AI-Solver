// Live model discovery. Model selection is stored per shortcut slot.

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function normalizeOpenAIBaseUrl(value) {
    const url = new URL(value || DEFAULT_OPENAI_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('API URL must be an HTTP(S) address without credentials, query or fragment.');
    }
    return url.href.replace(/\/$/, '');
}

async function apiFetch(url, options = {}, operation = 'API request') {
    // Keep both the request and response body within the worker's time budget.
    const signal = AbortSignal.timeout(25000);
    try {
        const response = await fetch(url, { ...options, redirect: 'error', signal });
        if (!response.ok) {
            const hints = {
                400: 'Check the API URL and use a model that accepts images.',
                401: 'Check your API key.',
                403: 'Check key permissions and model access.',
                404: 'Check the API URL and model availability.',
                429: 'Check your API quota, rate limit or billing.'
            };
            const hint = hints[response.status] || 'Try again or check the provider status.';
            throw new Error(`${operation} failed (HTTP ${response.status}). ${hint}`);
        }
        return await response.json();
    } catch (error) {
        if (signal.aborted || error.name === 'TimeoutError') {
            throw new Error(`${operation} did not respond within 25 seconds. Try again or choose another model.`);
        }
        if (error.name === 'SyntaxError') {
            throw new Error(`${operation} returned an invalid response. Check the API URL.`);
        }
        if (error.name === 'TypeError') {
            throw new Error(`${operation} could not connect. Check the API URL, network and extension site access.`);
        }
        throw error;
    }
}

async function fetchGeminiModels(apiKey) {
    const models = [];
    let pageToken = '';

    do {
        const url = `${GEMINI_MODELS_URL}?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const data = await apiFetch(url, { headers: { 'x-goog-api-key': apiKey } }, 'Gemini model list');
        for (const model of data.models || []) {
            const methods = model.supportedGenerationMethods || [];
            if (typeof model.name !== 'string' || !methods.includes('generateContent')) continue;
            models.push({
                provider: 'gemini',
                id: model.name.replace(/^models\//, ''),
                label: model.displayName || model.name.replace(/^models\//, ''),
                verifiedVision: false
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
    /audio/, /realtime/, /transcribe/, /^sora/, /^gpt-image/, /^gpt-3\.5/
];

function isLikelyVisionChatModel(id) {
    return !OPENAI_NON_CHAT_PATTERNS.some((pattern) => pattern.test(id));
}

async function fetchOpenAIModels(apiKey, baseUrl) {
    const url = normalizeOpenAIBaseUrl(baseUrl);
    const official = url === DEFAULT_OPENAI_BASE_URL;
    const data = await apiFetch(`${url}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    }, 'OpenAI model list');
    const models = [];
    for (const model of data.data || []) {
        if (typeof model.id !== 'string' || !model.id || model.capabilities?.vision === false) continue;
        const verifiedVision = model.capabilities?.vision === true;
        if (!verifiedVision && official && !isLikelyVisionChatModel(model.id)) continue;
        models.push({ provider: 'openai', id: model.id, label: model.id, verifiedVision });
    }
    return models;
}

// Returns every model reachable with the keys currently stored, sorted by id.
async function fetchAvailableModels({ geminiApiKey, openaiApiKey, openaiBaseUrl }) {
    const discovery = [];
    if (geminiApiKey) discovery.push(fetchGeminiModels(geminiApiKey));
    if (openaiApiKey) discovery.push(fetchOpenAIModels(openaiApiKey, openaiBaseUrl));

    const models = [];
    const errors = [];
    for (const result of await Promise.allSettled(discovery)) {
        if (result.status === 'fulfilled') models.push(...result.value);
        else errors.push(result.reason.message);
    }
    models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
    return { models, errors };
}

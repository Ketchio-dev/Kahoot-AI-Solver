const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function context(overrides = {}) {
  const chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    tabs: { query: async () => [{ id: 1, windowId: 7 }], sendMessage: async () => {}, captureVisibleTab: async () => 'data:image/png;base64,image' },
    action: { setIcon: () => {} },
    commands: { onCommand: { addListener: () => {} } },
    runtime: { onInstalled: { addListener(fn) { this.listener = fn; } }, onMessage: { addListener: () => {} } }
  };
  const ctx = vm.createContext({ chrome, console, URL, AbortSignal, setTimeout: () => {}, clearTimeout: () => {}, importScripts: () => {}, ...overrides });
  vm.runInContext(fs.readFileSync('models.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), ctx);
  if (!overrides.OffscreenCanvas) vm.runInContext('drawIcon = () => ({})', ctx);
  return ctx;
}

test('popup persists settings before a permission prompt can destroy it', async () => {
  let loaded;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, addEventListener(event, fn) { this[event] = fn; } });
    return elements.get(id);
  };
  let saved;
  const order = [];
  const ctx = vm.createContext({
    URL, console, setTimeout: () => {},
    DEFAULT_OPENAI_BASE_URL: 'https://api.openai.com/v1',
    normalizeOpenAIBaseUrl: value => value,
    document: { getElementById: element, addEventListener: (_, fn) => { loaded = fn; } },
    chrome: {
      storage: { local: { get: () => {}, set: async data => { saved = data; order.push('save'); } } },
      runtime: { sendMessage: () => {} },
      permissions: { request: () => { order.push('prompt'); return new Promise(() => {}); } }
    }
  });
  vm.runInContext(fs.readFileSync('popup.js', 'utf8'), ctx);
  loaded();
  element('openaiBaseUrl').value = 'http://127.0.0.1:8080/v1';
  element('openaiApiKey').value = 'test-key';
  element('saveBtn').click();
  assert.deepEqual(order, ['save', 'prompt']);
  assert.equal(saved.openaiBaseUrl, 'http://127.0.0.1:8080/v1');
  assert.equal(saved.openaiApiKey, 'test-key');
});

test('popup uses truthful product branding and toggles accessible settings in both directions', () => {
  const html = fs.readFileSync('popup.html', 'utf8');
  assert.match(html, /<title>Kahoot AI Solver — Settings<\/title>/);
  assert.match(html, /<h2>Kahoot AI Solver<\/h2>/);
  assert.match(html, /src="icon128\.png"/);
  assert.doesNotMatch(html, /Youtube|Ad Blocker|PROTECTION ACTIVE|Ads Blocked|BLOCKING LEVEL|fake-view|real-view/i);
  assert.match(html, /aria-controls="settings-view"/);
  let loaded;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', style: {}, attributes: {}, textContent: '',
      addEventListener(event, fn) { this[event] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; }
    });
    return elements.get(id);
  };
  element('settings-view').style.display = 'none';
  const ctx = vm.createContext({
    document: { getElementById: element, addEventListener: (_, fn) => { loaded = fn; } },
    chrome: { storage: { local: { get: () => {} } } }
  });
  vm.runInContext(fs.readFileSync('popup.js', 'utf8'), ctx);
  loaded();
  const toggle = element('toggleViewBtn');
  toggle.click();
  assert.equal(element('settings-view').style.display, 'block');
  assert.equal(element('home-view').style.display, 'none');
  assert.equal(toggle.textContent, 'Back');
  assert.equal(toggle.attributes['aria-label'], 'Back to home');
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  toggle.click();
  assert.equal(element('settings-view').style.display, 'none');
  assert.equal(element('home-view').style.display, 'block');
  assert.equal(toggle.textContent, 'Settings');
  assert.equal(toggle.attributes['aria-label'], 'Open AI settings');
  assert.equal(toggle.attributes['aria-expanded'], 'false');
});

test('structured answers validate multiple, typed, ordered, numeric and unknown results', () => {
  const ctx = context();
  for (const result of [
    { type: 'multiple', colors: ['red', 'green'] },
    { type: 'text', text: 'Paris' },
    { type: 'order', items: ['2', '4', '6'] },
    { type: 'number', value: 42 },
    { type: 'unknown', message: 'Question not visible' }
  ]) {
    assert.equal(JSON.stringify(vm.runInContext(`parseResponse(${JSON.stringify(JSON.stringify(result))})`, ctx)), JSON.stringify(result));
  }
  for (const result of [{ type: 'multiple', colors: ['purple'] }, { type: 'multiple', colors: ['red', 'red'] }, { type: 'text', text: '' }, { type: 'order', items: ['one'] }, { type: 'number', value: '42' }]) {
    assert.throws(() => vm.runInContext(`parseResponse(${JSON.stringify(JSON.stringify(result))})`, ctx));
  }
});

test('media context is attached only to the current prompt and validates length', () => {
  const ctx = context();
  assert.ok(vm.runInContext('buildPrompt("Narrator said Paris")', ctx).includes('Narrator said Paris'));
  assert.ok(!vm.runInContext('buildPrompt()', ctx).includes('Narrator said Paris'));
  assert.throws(() => vm.runInContext('buildPrompt("x".repeat(6001))', ctx));
});

test('unset slots require user selection without fetching or assigning a model', async () => {
  const ctx = context({ fetch: () => { throw new Error('Unexpected model request'); } });
  await assert.rejects(vm.runInContext('resolveSlotModel("slot1")', ctx), /Select a model/);
  await assert.rejects(vm.runInContext('resolveSlotModel("unknown")', ctx), /Invalid model slot/);
});

test('answer parsing rejects prose instead of choosing the first color mentioned', () => {
  const ctx = context();
  assert.equal(vm.runInContext('parseResponse(\'```json\\n{"answer":"Blue"}\\n```\')', ctx), 'blue');
  assert.equal(vm.runInContext('parseResponse("triangle")', ctx), 'red');
  for (const value of ['Red is wrong. Blue is correct.', '', '{"answer":42}', '{"answer":"purple"}']) {
    assert.throws(() => vm.runInContext(`parseResponse(${JSON.stringify(value)})`, ctx));
  }
});

test('API fetch times out before the MV3 worker fetch deadline and preserves other errors', async () => {
  const networkError = new Error('Network unavailable');
  let timeout;
  let failWithTimeout = true;
  const ctx = context({
    AbortSignal: { timeout: milliseconds => { timeout = milliseconds; return { timeout: milliseconds }; } },
    fetch: async (_, options) => {
      assert.equal(options.signal.timeout, 25000);
      if (failWithTimeout) {
        const error = new Error('Aborted');
        error.name = 'TimeoutError';
        throw error;
      }
      throw networkError;
    }
  });
  await assert.rejects(vm.runInContext('apiFetch("https://example.test")', ctx), /did not respond within 25 seconds/);
  assert.equal(timeout, 25000);
  failWithTimeout = false;
  await assert.rejects(vm.runInContext('apiFetch("https://example.test")', ctx), error => error === networkError);
});

test('custom endpoint uses vision capability metadata and bearer authentication', async () => {
  let request;
  const ctx = context({ fetch: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: [
      { id: 'text-model', capabilities: { vision: false } },
      { id: 'vision-model', capabilities: { vision: true } }
    ] }) };
  } });
  const models = await vm.runInContext('fetchOpenAIModels("test-key", "http://127.0.0.1:8080/v1/")', ctx);
  assert.equal(request.url, 'http://127.0.0.1:8080/v1/models');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(models.length, 1);
  assert.equal(models[0].id, 'vision-model');
  assert.throws(() => vm.runInContext('normalizeOpenAIBaseUrl("file:///tmp")', ctx));
});

test('concurrent shortcuts only issue one solve and capture the originating window', async () => {
  const ctx = context();
  let release;
  let queries = 0;
  let captures = 0;
  ctx.chrome.tabs.query = async () => {
    queries++;
    if (queries === 1) return new Promise(resolve => { release = resolve; });
    return [{ id: 1, windowId: 7 }];
  };
  ctx.chrome.tabs.captureVisibleTab = async windowId => {
    assert.equal(windowId, 7);
    captures++;
    return 'data:image/png;base64,image';
  };
  vm.runInContext('resolveSlotModel = async () => ({provider:"openai",id:"vision"}); getKeys = async () => ({openaiApiKey:"test"}); analyzeImageOpenAI = async () => "blue";', ctx);
  const first = vm.runInContext('solveQuestion("slot1")', ctx);
  const second = vm.runInContext('solveQuestion("slot1")', ctx);
  release([{ id: 1, windowId: 7 }]);
  await Promise.all([first, second]);
  assert.equal(captures, 1);
  assert.equal(vm.runInContext('solveInFlight', ctx), false);
});

test('install and success/error feedback resets restore the packaged product icons', async () => {
  const icons = [];
  const timers = [];
  const messages = [];
  const fills = [];
  const ctx = context({
    console: { ...console, log: () => {}, error: () => {} },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    OffscreenCanvas: class {
      getContext() {
        return {
          fillRect() { fills.push(this.fillStyle); },
          fillText() { assert.fail('Icon feedback must not draw the legacy Y'); },
          getImageData() { return { color: this.fillStyle }; }
        };
      }
    }
  });
  ctx.chrome.action.setIcon = icon => icons.push(JSON.parse(JSON.stringify(icon)));
  ctx.chrome.tabs.sendMessage = async (_, message) => { messages.push(message); };
  const packagedIcon = { path: { 16: 'icon16.png', 48: 'icon48.png', 128: 'icon128.png' } };

  ctx.chrome.runtime.onInstalled.listener();
  assert.deepEqual(icons, [packagedIcon]);
  assert.equal(timers.length, 0);
  assert.equal(fills.length, 0);

  vm.runInContext('resolveSlotModel = async () => ({provider:"openai",id:"vision"}); getKeys = async () => ({openaiApiKey:"test"}); analyzeImageOpenAI = async () => "blue";', ctx);
  await vm.runInContext('solveQuestion("slot1")', ctx);
  assert.deepEqual(icons[1], { imageData: { color: '#45A3E5' } });
  assert.equal(messages.at(-1).action, 'highlight_answer');
  assert.equal(messages.at(-1).answer, 'blue');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1000);
  timers[0].callback();
  assert.deepEqual(icons[2], packagedIcon);

  vm.runInContext('analyzeImageOpenAI = async () => { throw new Error("Provider failed"); };', ctx);
  await vm.runInContext('solveQuestion("slot1")', ctx);
  assert.deepEqual(icons[3], { imageData: { color: '#FF0000' } });
  assert.equal(messages.at(-1).action, 'error');
  assert.equal(messages.at(-1).message, 'Provider failed');
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 1000);
  timers[1].callback();
  assert.deepEqual(icons[4], packagedIcon);
  assert.deepEqual(fills, ['#45A3E5', '#FF0000']);
});

test('OpenAI request uses custom endpoint and rejects token-truncated output', async () => {
  let url;
  const ctx = context({ fetch: async (target, options) => {
    url = target;
    const body = JSON.parse(options.body);
    assert.equal('max_completion_tokens' in body, false);
    assert.equal('max_tokens' in body, false);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"answer":"red"}' } }] }) };
  } });
  await assert.rejects(vm.runInContext('analyzeImageOpenAI("test", "image", "vision", "http://127.0.0.1:8080/v1")', ctx), /truncated/);
  assert.equal(url, 'http://127.0.0.1:8080/v1/chat/completions');
});

test('pending feedback expires after worker interruption and is cancelled on a result', () => {
  let listener;
  let current;
  let nextTimer = 0;
  const timers = new Map();
  const cancelled = [];
  const ctx = vm.createContext({
    chrome: { runtime: { onMessage: { addListener: fn => { listener = fn; } } } },
    console: { warn: () => {} },
    document: {
      getElementById: () => current,
      createElement: () => ({ style: {}, classList: { add: () => {} }, remove() { current = undefined; } }),
      body: { appendChild: node => { current = node; } }
    },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => { cancelled.push(id); timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync('content.js', 'utf8'), ctx);
  listener({ action: 'show_processing', mode: 'normal' });
  assert.equal(current.textContent, 'Analyzing question…');
  assert.equal(timers.get(1).delay, 30000);
  timers.get(1).callback();
  assert.match(current.textContent, /Error: The request timed out or was interrupted/);
  assert.equal(timers.get(2).delay, 4000);
  timers.get(2).callback();
  assert.equal(current, undefined);

  listener({ action: 'show_processing', mode: 'stealth' });
  assert.equal(current.textContent, '');
  listener({ action: 'highlight_answer', mode: 'stealth', answer: 'blue' });
  assert.ok(cancelled.includes(3));
  assert.equal(timers.has(3), false);
  assert.equal(current.textContent, '◆');
  assert.equal(timers.get(4).delay, 8000);
});

test('old result timers are cancelled when a new indicator is displayed', () => {
  let listener;
  let current;
  const cancelled = [];
  const ctx = vm.createContext({
    chrome: { runtime: { onMessage: { addListener: fn => { listener = fn; } } } },
    console,
    document: {
      getElementById: () => current,
      createElement: () => ({ style: {}, classList: { add: () => {} }, remove() { current = undefined; } }),
      body: { appendChild: node => { current = node; } }
    },
    setTimeout: () => 123,
    clearTimeout: timer => cancelled.push(timer)
  });
  vm.runInContext(fs.readFileSync('content.js', 'utf8'), ctx);
  listener({ action: 'highlight_answer', answer: 'red' });
  listener({ action: 'show_processing' });
  assert.ok(cancelled.includes(123));
  assert.equal(current.textContent, '');
  listener({ action: 'highlight_answer', mode: 'normal', answer: { type: 'order', items: ['2', '4'] } });
  assert.equal(current.className, 'kahoot-normal-panel');
  assert.equal(current.textContent, '1. 2\n2. 4');
  listener({ action: 'highlight_answer', mode: 'stealth', answer: { type: 'text', text: '<script>unsafe</script>' } });
  assert.equal(current.className, 'kahoot-stealth-indicator');
  assert.equal(current.textContent, '<script>unsafe</script>');
});

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
    runtime: { onInstalled: { addListener: () => {} }, onMessage: { addListener: () => {} } }
  };
  const ctx = vm.createContext({ chrome, console, URL, AbortSignal, setTimeout: () => {}, clearTimeout: () => {}, importScripts: () => {}, ...overrides });
  vm.runInContext(fs.readFileSync('models.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), ctx);
  vm.runInContext('drawIcon = () => ({})', ctx);
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

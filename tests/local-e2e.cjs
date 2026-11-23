// Run with playwright-core and an extension-capable Chromium binary.
// The temporary manifest pre-grants capture and localhost API access.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const { setTimeout: delay } = require('node:timers/promises');
const LONG_MODEL = 'local-vision-' + 'long-model-name-'.repeat(12);

async function waitFor(check, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

// The toolbar popup is a separate Chrome target. A normal extension tab has
// a pre-existing viewport and cannot reproduce Chrome's intrinsic popup sizing.
async function openToolbarPopup(cdp, worker) {
  await cdp.send('Page.bringToFront');
  const windowId = await worker.evaluate(async () => {
    const [browserWindow] = await chrome.windows.getAll({ windowTypes: ['normal'] });
    await chrome.windows.update(browserWindow.id, { focused: true });
    return browserWindow.id;
  });
  await waitFor(async () => {
    try {
      await worker.evaluate(id => chrome.action.openPopup({ windowId: id }), windowId);
      return true;
    } catch (error) {
      if (!/inactive window/i.test(error.message)) throw error;
      return false;
    }
  }, 'Chrome window activation');
  const url = new URL('popup.html', worker.url()).href;
  const target = await waitFor(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return targetInfos.find(info => info.url === url);
  }, 'the native toolbar popup');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let messageId = 0;

  async function send(method, params = {}) {
    const id = ++messageId;
    let listener;
    let timer;
    try {
      const result = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Chrome popup did not respond to ${method}`)), 5000);
        listener = event => {
          if (event.sessionId !== sessionId) return;
          const data = JSON.parse(event.message);
          if (data.id !== id) return;
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        };
        cdp.on('Target.receivedMessageFromTarget', listener);
      });
      await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
      return await result;
    } finally {
      clearTimeout(timer);
      cdp.off('Target.receivedMessageFromTarget', listener);
    }
  }

  async function evaluate(expression) {
    const data = await send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true });
    if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text);
    return data.result.value;
  }

  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  return { send, evaluate, click, targetId: target.targetId };
}

async function checkLayout(popup, name) {
  const metrics = await popup.evaluate(`(() => {
    const visible = [...document.querySelectorAll('header button, main button, main select, #slotCard3, #mediaContext')]
      .filter(element => element.getClientRects().length)
      .map(element => {
        const { left, right } = element.getBoundingClientRect();
        return { id: element.id, left, right };
      });
    const heading = document.querySelector('h1');
    const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      topbarSingleLine: heading.offsetHeight < 1.6 * lineHeight,
      clipped: visible.filter(element => element.left < 0 || element.right > innerWidth + 1)
    };
  })()`);
  assert.equal(metrics.width, 398, name + ': toolbar popup width');
  assert.ok(metrics.height < 601, name + ': Chrome popup height');
  assert.ok(metrics.scrollWidth <= metrics.width, name + ': horizontal scrollbar');
  assert.equal(metrics.topbarSingleLine, true, name + ': title wraps');
  assert.deepEqual(metrics.clipped, [], name + ': controls clipped horizontally');
}

async function saveScreenshot(popup, name) {
  const output = process.env.E2E_UI_ARTIFACTS;
  if (!output) return;
  await fs.mkdir(output, { recursive: true });
  const { data } = await popup.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
}

async function main() {
  assert.ok(process.env.E2E_CHROME_PATH, 'Set E2E_CHROME_PATH');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kahoot-local-e2e-'));
  const extension = path.join(tmp, 'extension');
  const profile = path.join(tmp, 'profile');
  let browser;
  let holdModels = false;
  let rejectSolve = false;
  let modelAnswer = { answer: 'blue' };
  let modelRequests = 0;
  const solves = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === '/v1/models') {
      modelRequests++;
      if (holdModels) await new Promise(resolve => setTimeout(resolve, 1500));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [
        { id: 'local-vision', capabilities: { vision: true } },
        { id: LONG_MODEL, capabilities: { vision: true } }
      ] }));
    } else if (request.url === '/v1/chat/completions') {
      let body = '';
      for await (const chunk of request) body += chunk;
      solves.push(JSON.parse(body));
      response.setHeader('Content-Type', 'application/json');
      response.statusCode = rejectSolve ? 401 : 200;
      response.end(JSON.stringify(rejectSolve ? { error: 'Mock rejection' } : {
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(modelAnswer) } }]
      }));
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<h1>What is 2 + 2?</h1><p>Red: 3 | Blue: 4 | Yellow: 5 | Green: 6</p>');
    }
  });

  try {
    await fs.mkdir(extension);
    const source = path.join(__dirname, '..');
    for (const file of ['background.js', 'content.js', 'models.js', 'popup.js', 'popup.html',
      'styles.css', 'icon16.png', 'icon48.png', 'icon128.png']) {
      await fs.copyFile(path.join(source, file), path.join(extension, file));
    }
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'));
    manifest.host_permissions.push('<all_urls>');
    await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.E2E_CHROME_PATH,
      headless: false,
      viewport: null,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const quiz = browser.pages()[0];
    await quiz.goto(origin);
    const cdp = await browser.newCDPSession(quiz);
    let popup = await openToolbarPopup(cdp, worker);
    const popupState = expression => waitFor(() => popup.evaluate(expression), expression);
    await popupState('!document.querySelector("#setupAction").hidden');
    await checkLayout(popup, 'first-run home');
    await saveScreenshot(popup, 'home-unconfigured');
    await popup.click('#setupAction');
    assert.equal(await popup.evaluate('document.activeElement.id'), 'apiKey');
    await checkLayout(popup, 'first-run settings');
    await popup.click('#customEndpoint summary');
    await checkLayout(popup, 'expanded custom server');
    await saveScreenshot(popup, 'settings-custom-server');
    await popup.evaluate('document.querySelector("#displayMode").scrollIntoView({ block: "end" })');
    await popupState('document.querySelector("#displayMode").getBoundingClientRect().bottom <= innerHeight');
    assert.equal(await popup.evaluate('document.querySelector(".brandbar").getBoundingClientRect().top'), 0);
    await popup.evaluate('document.querySelector("#openaiBaseUrl").scrollIntoView({ block: "center" })');
    await popup.evaluate(`document.querySelector('#openaiBaseUrl').value = ${JSON.stringify(origin + '/v1')};
      document.querySelector('#openaiApiKey').value = 'local-test-key';`);
    await popup.click('#saveBtn');
    await popupState('document.querySelector("#modelStatus").textContent === "2 models available"');
    const selectModel = (slot, model) => popup.evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify('#slot' + slot)});
      field.value = ${JSON.stringify('openai:' + model)};
      field.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await selectModel(1, 'local-vision');
    await popupState('!document.querySelector("#solveSlot1").disabled');
    await selectModel(2, LONG_MODEL);
    await popupState('!document.querySelector("#solveSlot2").disabled');
    await popup.click('#customEndpoint summary');
    await checkLayout(popup, 'configured settings');
    await saveScreenshot(popup, 'settings-configured');
    await popup.click('#toggleViewBtn');
    await checkLayout(popup, 'configured home');
    assert.match(await popup.evaluate('document.querySelector("#model1").textContent'), /local-vision/);
    assert.ok(await popup.evaluate('document.querySelector("#shortcut1").textContent'));
    const long = await popup.evaluate(`(() => {
      const label = document.querySelector('#model2');
      return { value: label.title, height: label.offsetHeight };
    })()`);
    assert.ok(long.value.endsWith(LONG_MODEL));
    assert.ok(long.height <= 38, 'long model name stays within two lines');
    for (const theme of ['light', 'dark']) {
      await popup.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await checkLayout(popup, theme + ' home');
      await saveScreenshot(popup, 'home-' + theme);
    }

    await popup.click('.context-panel summary');
    await checkLayout(popup, 'expanded transcript');
    await popup.evaluate("document.querySelector('#mediaContext').value = 'Local test transcript';");
    await saveScreenshot(popup, 'home-transcript');
    await popup.click('.context-panel summary');

    // The saved slot remains runnable while model discovery is refreshing.
    holdModels = true;
    const initialRequests = modelRequests;
    await popup.click('#toggleViewBtn');
    await popup.click('#refreshBtn');
    await popupState('document.querySelector("#modelStatus").textContent === "Loading models…"');
    await popup.click('#toggleViewBtn');
    assert.equal(await popup.evaluate('document.querySelector("#solveSlot1").disabled'), false);
    await popup.click('#solveSlot1').catch(error => {
      if (!/Target|session/i.test(error.message)) throw error;
    });
    const indicator = quiz.locator('#kahoot-stealth-indicator');
    await indicator.filter({ hasText: '◆ BLUE' }).waitFor();
    assert.equal(solves.length, 1);
    assert.ok(modelRequests > initialRequests);
    const screenshot = solves[0].messages[0].content.find(part => part.type === 'image_url');
    assert.match(screenshot.image_url.url, /^data:image\/png;base64,iVBORw0KGgo/);
    assert.match(solves[0].messages[0].content[0].text, /Local test transcript/);
    if (process.env.E2E_UI_ARTIFACTS) {
      await quiz.screenshot({ path: path.join(process.env.E2E_UI_ARTIFACTS, 'answer-panel.png') });
    }

    // Chrome allows two visible-tab captures per second.
    for (const [reply, expected] of [
      [{ type: 'multiple', colors: ['red', 'blue'] }, 'red, blue'],
      [{ type: 'text', text: 'Mars' }, 'Mars'],
      [{ type: 'number', value: 42 }, '42'],
      [{ type: 'order', items: ['First', 'Second'] }, '2. Second'],
      [{ type: 'unknown', message: 'Question not visible' }, 'Question not visible']
    ]) {
      modelAnswer = reply;
      await delay(550);
      await worker.evaluate(() => solveQuestion('slot1'));
      assert.ok((await indicator.textContent()).includes(expected), reply.type);
    }

    // Select compact feedback in the native settings UI and exercise it.
    popup = await openToolbarPopup(cdp, worker);
    await popup.click('#toggleViewBtn');
    await popup.evaluate(`(() => {
      const mode = document.querySelector('#displayMode');
      mode.value = 'stealth';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(async () => (await worker.evaluate(() => chrome.storage.local.get('displayMode'))).displayMode === 'stealth', 'compact preference');
    await popup.click('#toggleViewBtn');
    modelAnswer = { answer: 'blue' };
    await delay(550);
    await popup.click('#solveSlot1').catch(error => {
      if (!/Target|session/i.test(error.message)) throw error;
    });
    await quiz.locator('.kahoot-stealth-indicator').filter({ hasText: '◆' }).waitFor();
    assert.equal(await indicator.textContent(), '◆');

    // A provider error still uses the readable panel in compact mode.
    rejectSolve = true;
    await delay(550);
    await worker.evaluate(() => solveQuestion('slot1'));
    await indicator.filter({ hasText: 'HTTP 401' }).waitFor();
    assert.match(await indicator.textContent(), /Check your API key/);

    await quiz.goto('chrome://version/');
    popup = await openToolbarPopup(cdp, worker);
    await popupState('!document.querySelector("#solveSlot1").disabled');
    await popup.click('#solveSlot1');
    await popupState('/restricted pages/.test(document.querySelector("#solveStatus").textContent)');
    await checkLayout(popup, 'restricted-tab error');
    await saveScreenshot(popup, 'home-restricted-error');
    assert.equal(solves.length, 8);
    console.log('Chrome toolbar popup passed: first-run setup, long model names, both themes, transcript field, capture, all answer formats, compact mode, API error and restricted-tab feedback.');
  } finally {
    try {
      await browser?.close();
    } finally {
      server.close();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

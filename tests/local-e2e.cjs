// Run with playwright-core and an extension-capable Chromium binary.
// The temporary manifest pre-grants capture and localhost API access.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

async function main() {
  assert.ok(process.env.E2E_CHROME_PATH, 'Set E2E_CHROME_PATH');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kahoot-local-e2e-'));
  const extension = path.join(tmp, 'extension');
  const profile = path.join(tmp, 'profile');
  let browser;
  let holdModels = false;
  let rejectSolve = false;
  let modelRequests = 0;
  const solves = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === '/v1/models') {
      modelRequests++;
      if (holdModels) await new Promise(resolve => setTimeout(resolve, 1500));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'local-vision', capabilities: { vision: true } }] }));
    } else if (request.url === '/v1/chat/completions') {
      let body = '';
      for await (const chunk of request) body += chunk;
      solves.push(JSON.parse(body));
      response.setHeader('Content-Type', 'application/json');
      response.statusCode = rejectSolve ? 401 : 200;
      response.end(JSON.stringify(rejectSolve ? { error: 'Mock rejection' } : {
        choices: [{ finish_reason: 'stop', message: { content: '{"answer":"blue"}' } }]
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
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const popupUrl = new URL('popup.html', worker.url()).href;
    const quiz = browser.pages()[0];
    await quiz.goto(origin);
    const popup = await browser.newPage();
    await popup.goto(popupUrl);
    await popup.locator('#toggleViewBtn').click();
    await popup.locator('#openaiBaseUrl').fill(`${origin}/v1`);
    await popup.locator('#openaiApiKey').fill('local-test-key');
    await popup.locator('#saveBtn').click();
    await popup.getByText('1 models available', { exact: true }).waitFor();
    assert.equal(await popup.locator('#solveSlot1').isDisabled(), true);
    await popup.locator('#slot1').selectOption('openai:local-vision');
    await popup.locator('#solveSlot1:enabled').waitFor();
    await popup.reload();
    await popup.locator('#toggleViewBtn').click();
    await popup.locator('#solveSlot1:enabled').waitFor();

    // Verify the actual popup handler sends a request even during model refresh.
    holdModels = true;
    const beforeRefresh = modelRequests;
    await popup.locator('#refreshBtn').click();
    await popup.getByText('Loading models…', { exact: true }).waitFor();
    assert.equal(await popup.locator('#solveSlot1').isEnabled(), true);
    await quiz.bringToFront();
    await popup.locator('#solveSlot1').evaluate(button => button.click());
    const indicator = quiz.locator('#kahoot-stealth-indicator');
    await indicator.filter({ hasText: '◆ BLUE' }).waitFor();
    assert.equal(solves.length, 1);
    assert.ok(modelRequests > beforeRefresh);
    const screenshot = solves[0].messages[0].content.find(part => part.type === 'image_url');
    assert.match(screenshot.image_url.url, /^data:image\/png;base64,iVBORw0KGgo/);

    // A bad key reaches the page as a readable, actionable error.
    rejectSolve = true;
    await worker.evaluate(() => solveQuestion('slot1'));
    await indicator.filter({ hasText: 'HTTP 401' }).waitFor();
    assert.match(await indicator.textContent(), /Check your API key/);

    // A capture failure reaches the popup before it closes or makes an API call.
    const secondPopup = await browser.newPage();
    await secondPopup.goto(popupUrl);
    await secondPopup.locator('#toggleViewBtn').click();
    await secondPopup.locator('#solveSlot1:enabled').waitFor();
    await quiz.goto('chrome://version/');
    await quiz.bringToFront();
    await secondPopup.locator('#solveSlot1').evaluate(button => button.click());
    await secondPopup.locator('#solveStatus').filter({ hasText: /restricted pages/ }).waitFor();
    assert.equal(solves.length, 2);
    console.log('Chrome passed: model discovery, selection persistence, solve during refresh, PNG capture, answer display, API error and restricted-tab feedback.');
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

// Run with E2E_API_KEY, E2E_CHROME_PATH and playwright-core installed.
// This test grants capture/API permissions in a temporary extension copy.
// It does not validate the toolbar, native permission prompt or OS shortcuts.
const { chromium }=require('playwright-core');
const fs=require('fs');const http=require('http');const os=require('os');
const path=require('path');
const repo=fs.mkdtempSync(os.tmpdir()+'/kahoot-e2e-extension-');
const source=path.resolve(__dirname,'..');
for(const file of ['background.js','content.js','models.js','popup.js','popup.html','styles.css','manifest.json','icon16.png','icon48.png','icon128.png']) fs.copyFileSync(path.join(source,file),path.join(repo,file));
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'manifest.json')));
manifest.host_permissions.push('<all_urls>');
fs.writeFileSync(path.join(repo,'manifest.json'),JSON.stringify(manifest));
if(!process.env.E2E_API_KEY || !process.env.E2E_CHROME_PATH) throw new Error('Set E2E_API_KEY and E2E_CHROME_PATH');
const artifacts=fs.mkdtempSync(os.tmpdir()+'/kahoot-e2e-results-');
(async()=>{
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="UTF-8"><title>Kahoot E2E Quiz</title><style>body{margin:0;background:#35136b;color:white;font:32px Arial;text-align:center}h1{padding:45px;font-size:52px}.answers{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:30px}.option{padding:50px;font-size:42px}.red{background:#e21b3c}.blue{background:#1368ce}.yellow{background:#d89e00}.green{background:#26890c}</style></head><body><h1>What is 2 + 2?</h1><div class="answers"><div class="option red">▲ 3</div><div class="option blue">◆ 4</div><div class="option yellow">● 5</div><div class="option green">■ 6</div></div></body></html>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=fs.mkdtempSync(os.tmpdir()+'/kahoot-e2e-profile-');
const ctx=await chromium.launchPersistentContext(profile,{executablePath:process.env.E2E_CHROME_PATH,headless:false,args:[`--disable-extensions-except=${repo}`,`--load-extension=${repo}`],viewport:{width:1280,height:800}});
try{
const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const id=worker.url().split('/')[2];console.log('Extension loaded',id);
worker.on('console',m=>console.log('WORKER:',m.text()));
const quiz=ctx.pages()[0];quiz.on('console',m=>console.log('PAGE:',m.text()));await quiz.goto(`http://127.0.0.1:${server.address().port}/`);await quiz.bringToFront();
// Render the actual settings document in an extension tab for form automation.
const popup=await ctx.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);console.log('Popup URL',popup.url());
await popup.locator('#toggleViewBtn').click();await popup.screenshot({path:path.join(artifacts,'settings.png')});await popup.locator('#openaiBaseUrl').fill('http://100.81.152.90:20128/v1');await popup.locator('#openaiApiKey').fill(process.env.E2E_API_KEY);
// The temporary manifest pre-grants access; this does not test the native prompt.
await popup.locator('#saveBtn').click();
await popup.locator('#modelStatus').filter({hasText:/models available/}).waitFor({timeout:30000});console.log('Settings status',await popup.locator('#modelStatus').textContent());
if(await popup.locator('#slot1').inputValue()!=='')throw new Error('Model was automatically forced');
await popup.locator('#slot1').selectOption('openai:oc/fledge-alpha-free');
await popup.locator('#refreshBtn').click();await popup.locator('#modelStatus').filter({hasText:/models available/}).waitFor();
if(await popup.locator('#slot1').inputValue()!=='openai:oc/fledge-alpha-free')throw new Error('Refresh changed user selection');
await popup.locator('#slot1').selectOption('openai:oc/space-bunny-free');
await popup.locator('#displayMode').selectOption('stealth');
console.log('User model switch and refresh persistence PASS');
console.log('Persisted selection',await worker.evaluate(async()=>{const s=await chrome.storage.local.get(['slot1','openaiBaseUrl','openaiApiKey']);return {slot1:s.slot1,baseUrl:s.openaiBaseUrl,keySaved:!!s.openaiApiKey};}));
await quiz.bringToFront();
await quiz.evaluate(()=>{window.e2eEvents=[];new MutationObserver(()=>{const e=document.getElementById('kahoot-stealth-indicator');if(e)window.e2eEvents.push({text:e.textContent,color:e.style.backgroundColor,pending:e.classList.contains('kahoot-stealth-indicator--pending')});}).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});});
// A normal extension tab would capture itself. Close it and invoke the same service-worker solve entry point used by the popup/command.
await popup.close();
await worker.evaluate(()=>solveQuestion('slot1'));
const firstAnswer=await quiz.locator('#kahoot-stealth-indicator').textContent();
if(firstAnswer!=='◆')throw new Error('Arithmetic expected blue');
console.log('Arithmetic PASS');
await quiz.evaluate(()=>{document.querySelector('h1').textContent='Which planet is known as the Red Planet?';document.querySelector('.red').textContent='Earth';document.querySelector('.blue').textContent='Venus';document.querySelector('.yellow').textContent='Jupiter';document.querySelector('.green').textContent='Mars';});
await quiz.screenshot({path:path.join(artifacts,'science-before.png')});
await worker.evaluate(()=>solveQuestion('slot1'));
if(await quiz.locator('#kahoot-stealth-indicator').textContent()!=='■')throw new Error('Science expected green');
console.log('Science PASS');
await quiz.evaluate(()=>{document.querySelector('h1').textContent='What is the capital of France?';document.querySelector('.red').textContent='Paris';document.querySelector('.blue').textContent='London';document.querySelector('.yellow').textContent='Berlin';document.querySelector('.green').textContent='Rome';});
await quiz.screenshot({path:path.join(artifacts,'geography-before.png')});
await worker.evaluate(()=>solveQuestion('slot1'));
if(await quiz.locator('#kahoot-stealth-indicator').textContent()!=='▲')throw new Error('Geography expected red');
console.log('Geography PASS');
// Switch using the settings UI, then exercise richer answers in normal mode.
const settings=await ctx.newPage();await settings.goto(`chrome-extension://${id}/popup.html`);
await settings.locator('#toggleViewBtn').click();await settings.locator('#displayMode').selectOption('normal');
await settings.close();await quiz.bringToFront();
const cases=[
  {question:'Select ALL prime numbers. Multiple correct answers.',options:['2','4','3','6'],expected:['▲','●']},
  {question:'Type the answer: What is the capital of France?',options:['Type your answer','','',''],expected:['Paris']},
  {question:'Puzzle: Arrange these numbers in ascending order.',options:['8','2','6','4'],expected:['1. 2','2. 4','3. 6','4. 8']},
  {question:'Slider: How many minutes are in one hour? Return a number.',options:['0 to 120','','',''],expected:['60']}
];
for(const item of cases){
 await quiz.evaluate(item=>{document.querySelector('h1').textContent=item.question;document.querySelectorAll('.option').forEach((e,i)=>e.textContent=item.options[i]);},item);
 await quiz.screenshot({path:path.join(artifacts,`before-${cases.indexOf(item)}.png`)});
 await worker.evaluate(()=>solveQuestion('slot1'));
 const panel=quiz.locator('#kahoot-stealth-indicator');const text=await panel.textContent();
 for(const expected of item.expected)if(!text.includes(expected))throw new Error(`Expected ${expected}, received ${text}`);
 if(!await panel.evaluate(e=>e.classList.contains('kahoot-normal-panel')))throw new Error('Normal mode not applied');
 console.log('Extended type PASS:',item.question,text);
 await quiz.screenshot({path:path.join(artifacts,`answer-${cases.indexOf(item)}.png`)});
}
await quiz.evaluate(()=>{document.querySelector('h1').textContent='Audio question: Which city did the narrator visit?';document.querySelectorAll('.option').forEach((e,i)=>e.textContent=['Paris','London','Berlin','Rome'][i]);});
await quiz.screenshot({path:path.join(artifacts,'audio-context-before.png')});
await worker.evaluate(()=>solveQuestion('slot1','Transcript: Yesterday I visited London and saw Big Ben.'));
if(!(await quiz.locator('#kahoot-stealth-indicator').textContent()).includes('BLUE'))throw new Error('Transcript context was not used');
console.log('Transcript-assisted question PASS');
console.log('Indicator evidence',await quiz.evaluate(()=>window.e2eEvents));
await quiz.screenshot({path:path.join(artifacts,'result.png')});
if(!(await quiz.locator('#kahoot-stealth-indicator').textContent()).includes('BLUE'))throw new Error('Expected transcript-assisted blue answer');
console.log('E2E PASS: explicit model selection, refresh, switch, capture, eight real API answers including transcript context across both display modes. Artifacts:',artifacts);
console.log('Pages',ctx.pages().map(p=>p.url()));
await quiz.screenshot({path:path.join(artifacts,'quiz.png')});

}finally{await ctx.close();server.close();fs.rmSync(profile,{recursive:true,force:true});fs.rmSync(repo,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

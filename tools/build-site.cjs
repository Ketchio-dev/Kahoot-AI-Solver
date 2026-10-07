#!/usr/bin/env node
// Rebuilds the generated website files:
//   docs/assets/logo.svg -> icon16.png, icon48.png, icon128.png
//   PRIVACY.md           -> docs/privacy.html
// Icon rendering uses @resvg/resvg-js, which is not a project dependency:
//   npm install --no-save @resvg/resvg-js
//   node tools/build-site.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, data) => fs.writeFileSync(path.join(root, file), data);

function buildIcons() {
  const { Resvg } = require('@resvg/resvg-js');
  const svg = read('docs/assets/logo.svg');
  for (const size of [16, 48, 128]) {
    write('icon' + size + '.png', new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  }
}

const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const inline = (text) => escapeHtml(text)
  .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

function buildPrivacyPage() {
  const blocks = read('PRIVACY.md').trim().split(/\n\n+/).map((block) => {
    if (block.startsWith('# ')) return '<h1>' + inline(block.slice(2)) + '</h1>';
    if (block.startsWith('## ')) return '<h2>' + inline(block.slice(3)) + '</h2>';
    if (block.startsWith('- ')) {
      return '<ul>' + block.split('\n').map((line) => '<li>' + inline(line.slice(2)) + '</li>').join('\n') + '</ul>';
    }
    const cls = block.startsWith('Last updated:') ? ' class="policy-meta"' : '';
    return '<p' + cls + '>' + inline(block.replaceAll('\n', ' ')) + '</p>';
  }).join('\n\n');

  write('docs/privacy.html', [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="theme-color" content="#20263e">',
    '<meta name="description" content="How Kahoot AI Solver handles API keys, screenshots, optional context and local settings.">',
    '<title>Privacy policy — Kahoot AI Solver</title>',
    '<link rel="icon" type="image/svg+xml" href="assets/logo.svg">',
    '<link rel="stylesheet" href="site.css">',
    '</head>',
    '<body>',
    '<a class="skip-link" href="#main">Skip to content</a>',
    '<header class="site-header container"><a class="brand" href="./" aria-label="Kahoot AI Solver home"><img src="assets/logo.svg" width="40" height="40" alt=""><span>Kahoot <b>AI Solver</b></span></a><nav aria-label="Main navigation"><a href="./" lang="ko"><span aria-hidden="true">←</span> 홈으로 돌아가기</a></nav></header>',
    '<main class="policy container" id="main">',
    '<p class="eyebrow">KNOW WHAT YOU SHARE</p>',
    '<p class="policy-language" lang="ko">저장소의 개인정보 처리방침 원문(영문)입니다. <a href="./#privacy">한국어 데이터 안내 요약</a>도 확인할 수 있어요.</p>',
    blocks,
    '</main>',
    '<footer class="site-footer container"><div class="footer-top"><a class="brand" href="./"><img src="assets/logo.svg" width="32" height="32" alt=""><span>Kahoot <b>AI Solver</b></span></a><div><a href="https://github.com/Ketchio-dev/Kahoot-AI-Solver/issues" target="_blank" rel="noopener noreferrer">Support ↗</a><a href="https://github.com/Ketchio-dev/Kahoot-AI-Solver" target="_blank" rel="noopener noreferrer">Source ↗</a></div></div><p>Independent project by Ketchio-dev. Not affiliated with or endorsed by Kahoot!, Google or OpenAI.</p></footer>',
    '</body>',
    '</html>',
    ''
  ].join('\n'));
}

buildIcons();
buildPrivacyPage();
console.log('Rebuilt icon16.png, icon48.png, icon128.png and docs/privacy.html');

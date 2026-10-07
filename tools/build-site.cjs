#!/usr/bin/env node
// Rebuilds the generated website files:
//   docs/assets/logo.svg -> icon16.png, icon48.png, icon128.png
//   docs/assets/social-card.svg -> docs/assets/social-card.png
//   PRIVACY.md           -> docs/privacy.html
// SVG rendering uses @resvg/resvg-js, which is not a project dependency:
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

function buildSocialCard() {
  const { Resvg } = require('@resvg/resvg-js');
  const svg = read('docs/assets/social-card.svg');
  write('docs/assets/social-card.png', new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
}

const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const inline = (text) => escapeHtml(text)
  .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

// The header, footer and icon sprite come straight from docs/index.html so both pages stay in sync.
function shell() {
  const index = read('docs/index.html');
  const pick = (pattern, label) => {
    const match = index.match(pattern);
    if (!match) throw new Error('docs/index.html: could not find the ' + label);
    return match[0];
  };
  // Same-page anchors point at the home page when used from the privacy page.
  const toHome = (html) => html.replace(/href="#([^"]+)"/g, 'href="./#$1"');
  return {
    sprite: pick(/<svg class="sprite"[\s\S]*?<\/svg>/, 'icon sprite'),
    header: toHome(pick(/<header class="site-header[\s\S]*?<\/header>/, 'header')),
    footer: pick(/<footer class="site-footer[\s\S]*?<\/footer>/, 'footer')
  };
}

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

  const { sprite, header, footer } = shell();
  write('docs/privacy.html', [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="theme-color" content="#fbfaf7">',
    '<meta name="description" content="How Kahoot AI Solver handles API keys, screenshots, optional context and local settings.">',
    '<title>Privacy policy — Kahoot AI Solver</title>',
    '<link rel="canonical" href="https://ketchio-dev.github.io/Kahoot-AI-Solver/privacy.html">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Kahoot AI Solver">',
    '<meta property="og:title" content="Privacy policy — Kahoot AI Solver">',
    '<meta property="og:description" content="How Kahoot AI Solver handles API keys, screenshots, optional context and local settings.">',
    '<meta property="og:url" content="https://ketchio-dev.github.io/Kahoot-AI-Solver/privacy.html">',
    '<meta property="og:image" content="https://ketchio-dev.github.io/Kahoot-AI-Solver/assets/social-card.png">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Kahoot AI Solver with a simulated quiz and green answer suggestion. Bring your own API key.">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="https://ketchio-dev.github.io/Kahoot-AI-Solver/assets/social-card.png">',
    '<meta name="twitter:image:alt" content="Kahoot AI Solver with a simulated quiz and green answer suggestion. Bring your own API key.">',
    '<link rel="icon" type="image/svg+xml" href="assets/logo.svg">',
    '<link rel="preload" href="assets/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin>',
    '<link rel="stylesheet" href="site.css">',
    '</head>',
    '<body>',
    sprite,
    '<a class="skip-link" href="#main">Skip to content</a>',
    header,
    '<main class="policy" id="main">',
    blocks,
    '</main>',
    footer,
    '</body>',
    '</html>',
    ''
  ].join('\n'));
}

buildIcons();
buildSocialCard();
buildPrivacyPage();
console.log('Rebuilt extension icons, docs/assets/social-card.png and docs/privacy.html');

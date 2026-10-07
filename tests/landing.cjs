const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static checks for the landing page in docs/. No network, no API keys.
const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pages = ['index.html', 'privacy.html'];
const attr = (html, name) => [...html.matchAll(new RegExp('\\s' + name + '="([^"]*)"', 'g'))].map((match) => match[1]);
const ids = (file) => new Set(attr(read('docs', file), 'id'));

test('local links, images and anchors resolve', () => {
  for (const page of pages) {
    const html = read('docs', page);
    for (const target of [...attr(html, 'href'), ...attr(html, 'src')]) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [file, hash = ''] = target.split('#');
      let name = file || page;
      let full = path.join(docs, name);
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        name = path.join(name, 'index.html');
        full = path.join(docs, name);
      }
      assert.ok(fs.existsSync(full), page + ': missing file for ' + target);
      if (hash) assert.ok(ids(name).has(hash), page + ': missing anchor ' + target);
    }
  }
});

test('external links open safely', () => {
  for (const page of pages) {
    for (const tag of read('docs', page).match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
      assert.match(tag, /rel="[^"]*noopener/, page + ': ' + tag);
    }
  }
});

test('install buttons point to the Chrome Web Store listing', () => {
  const links = new Set(read('docs', 'index.html').match(/https:\/\/chromewebstore\.google\.com\/[^"]+/g));
  assert.deepEqual([...links], ['https://chromewebstore.google.com/detail/fgpbceoplppnfodmjcengikbefngpjfp']);
});

test('the release link names the current repository version without a pending-review claim', () => {
  const html = read('docs', 'index.html');
  const note = html.match(/<p class="release-note">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(note, 'release note is missing');
  assert.ok(note.includes('v' + manifest.version + ' is available on the Chrome Web Store.'), 'release version differs from manifest');
  assert.match(note, /href="https:\/\/chromewebstore\.google\.com\/detail\/fgpbceoplppnfodmjcengikbefngpjfp"/);
  assert.doesNotMatch(note, /pending|awaiting|under review/i);
});

test('sharing metadata uses canonical public URLs and a 1200 by 630 PNG', () => {
  const base = 'https://ketchio-dev.github.io/Kahoot-AI-Solver/';
  const imageUrl = base + 'assets/social-card.png';
  for (const page of pages) {
    const html = read('docs', page);
    const url = page === 'index.html' ? base : base + page;
    const meta = (name) => html.match(new RegExp('<meta (?:property|name)="' + name + '" content="([^"]+)"'))?.[1];
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], url, page);
    assert.equal(meta('og:url'), url, page);
    assert.ok(meta('og:title'), page + ': missing sharing title');
    assert.ok(meta('og:description'), page + ': missing sharing description');
    assert.equal(meta('og:image'), imageUrl, page);
    assert.equal(meta('twitter:image'), imageUrl, page);
    assert.equal(meta('og:image:type'), 'image/png', page);
    assert.equal(meta('og:image:width'), '1200', page);
    assert.equal(meta('og:image:height'), '630', page);
    assert.equal(meta('twitter:card'), 'summary_large_image', page);
    assert.match(meta('og:image:alt'), /simulated quiz/, page);
    assert.equal(meta('twitter:image:alt'), meta('og:image:alt'), page);
  }
  const png = fs.readFileSync(path.join(docs, 'assets', 'social-card.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const source = read('docs', 'assets', 'social-card.svg');
  assert.match(source, /<title>/);
  assert.match(source, /<desc>/);
  assert.doesNotMatch(source, /<text\b/, 'sharing source must use outlined type for portable rendering');
  assert.doesNotMatch(source, /(?:href|src)="(?:https?:)?\/\//, 'sharing source loads a remote asset');
});

test('Ketchio maker links stay separate from the product home link on both pages', () => {
  for (const page of pages) {
    const html = read('docs', page);
    const header = html.match(/<header class="site-header[\s\S]*?<\/header>/)?.[0];
    assert.ok(header, page + ': missing header');
    const product = header.match(/<a class="brand"[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.match(product, /href="\.\/"/, page + ': product home link changed');
    assert.match(product, /Kahoot <b>AI Solver<\/b>/, page + ': product name changed');
    assert.doesNotMatch(product, /Ketchio/, page + ': maker link must not be nested inside the product link');
    const makers = [...html.matchAll(/<a class="maker maker-(header|footer)"[^>]*>[\s\S]*?<\/a>/g)];
    assert.equal(makers.length, 2, page + ': expected header and footer maker links');
    for (const [tag, position] of makers) {
      assert.match(tag, /href="https:\/\/ketchio\.com\/"/, page + ': maker destination');
      assert.match(tag, /target="_blank" rel="noopener noreferrer"/, page + ': maker link safety');
      assert.match(tag, /src="assets\/ketchup\.svg"/, page + ': missing local signature');
      assert.ok(tag.includes(position === 'header' ? 'by <b>Ketchio</b>' : 'Made by <b>Ketchio</b>'));
    }
    assert.match(html, /name="author" content="Ketchio"/, page);
    assert.match(html, /property="og:site_name" content="Kahoot AI Solver by Ketchio"/, page);
  }
  const card = read('docs', 'assets', 'social-card.svg');
  assert.match(card, /id="ketchio-signature" aria-label="by Ketchio"/);
  assert.match(card, /<title>Kahoot AI Solver by Ketchio/);
});

test('the README links to the published website and privacy policy', () => {
  const readme = read('README.md');
  assert.ok(readme.includes('(https://ketchio-dev.github.io/Kahoot-AI-Solver/)'));
  assert.ok(readme.includes('(https://ketchio-dev.github.io/Kahoot-AI-Solver/privacy.html)'));
});

test('the demo script is a static preview without network or storage access', () => {
  assert.doesNotMatch(read('docs', 'site.js'), /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|chrome\./);
});

test('shortcuts on the page match the manifest commands', () => {
  const html = read('docs', 'index.html');
  const slots = Object.entries(manifest.commands).filter(([name]) => name.startsWith('solve-slot'));
  assert.equal(slots.length, 3);
  for (const [, command] of slots) {
    const key = command.suggested_key.default.split('+')[1];
    assert.match(html, new RegExp('<kbd[^>]*>\\s*' + key + '\\s*</kbd>'), 'missing shortcut ' + key);
  }
});

test('extension icons are PNGs at the sizes declared in the manifest', () => {
  assert.match(read('docs', 'assets', 'logo.svg'), /<title>/);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
    assert.equal(png.readUInt32BE(16), Number(size), file + ' width');
    assert.equal(png.readUInt32BE(20), Number(size), file + ' height');
  }
});

test('the stylesheet only references local files, and they exist', () => {
  const css = read('docs', 'site.css');
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((match) => match[1]);
  assert.ok(urls.length > 0, 'expected the self-hosted font to be referenced');
  for (const url of urls) {
    assert.doesNotMatch(url, /^(https?:)?\/\//, 'remote resource in site.css: ' + url);
    assert.ok(fs.existsSync(path.join(docs, url)), 'missing file for url(' + url + ')');
  }
  assert.ok(fs.existsSync(path.join(docs, 'assets', 'fonts', 'OFL.txt')), 'font license file is missing');
});

test('pages load no third-party scripts, styles, fonts or images', () => {
  for (const page of pages) {
    const html = read('docs', page);
    // Canonical URLs describe the page; unlike stylesheets or preloads, they are not fetched.
    for (const tag of html.match(/<(?:script|link|img|source|iframe)\b[^>]*>/g) || []) {
      if (/^<link\b/.test(tag) && /\brel="canonical"/.test(tag)) continue;
      assert.doesNotMatch(tag, /\s(?:src|href)="(?:https?:)?\/\//, page + ' loads a remote resource: ' + tag);
    }
  }
});

test('the privacy page reuses the site header and footer', () => {
  const index = read('docs', 'index.html');
  const privacy = read('docs', 'privacy.html');
  const header = (html) => (html.match(/<header class="site-header[\s\S]*?<\/header>/) || [''])[0];
  const homeHeader = header(index).replace(/href="#([^"]+)"/g, 'href="./#$1"');
  assert.ok(homeHeader.length > 0 && homeHeader === header(privacy), 'header product or maker markup differs');
  const footer = (html) => (html.match(/<footer class="site-footer[\s\S]*?<\/footer>/) || [''])[0];
  assert.ok(footer(index).length > 0 && footer(index) === footer(privacy), 'footer markup differs');
});

test('pages declare language, title, viewport, one h1, and image attributes', () => {
  for (const page of pages) {
    const html = read('docs', page);
    assert.match(html, /<html lang="en"/, page);
    assert.doesNotMatch(html, /[\uAC00-\uD7A3]/, page + ' contains Korean text');
    assert.match(html, /<title>[^<]+<\/title>/, page);
    assert.match(html, /name="viewport"/, page);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, page + ' h1 count');
    for (const tag of html.match(/<img\b[^>]*>/g) || []) {
      assert.match(tag, /\balt="/, page + ': ' + tag);
      assert.match(tag, /\bwidth="\d+"/, page + ': ' + tag);
      assert.match(tag, /\bheight="\d+"/, page + ': ' + tag);
    }
  }
});

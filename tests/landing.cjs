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

test('pages declare language, title, viewport, one h1, and image attributes', () => {
  for (const page of pages) {
    const html = read('docs', page);
    assert.match(html, /<html lang="(ko|en)"/, page);
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

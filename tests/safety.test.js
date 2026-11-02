// Sicherheitsregeln, die automatisch geprüft werden:
// - kein innerHTML & Co. im App-Code (Schutz vor XSS)
// - kein eval / new Function
// - keine Verbindungen zu fremden Servern (außer api.anthropic.com)
// - keine API-Schlüssel im Code

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'vendor') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

const appFiles = walk(join(root, 'js'), ['.js']);
const htmlFiles = walk(root, ['.html']).filter((p) => !p.includes(`${join(root, 'tests')}`));

test('kein innerHTML, outerHTML, insertAdjacentHTML oder document.write', () => {
  for (const file of appFiles) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/\.(innerHTML|outerHTML)\s*=/.test(src), `${file}: innerHTML/outerHTML`);
    assert.ok(!/insertAdjacentHTML|document\.write|createContextualFragment/.test(src), `${file}`);
  }
});

test('kein eval und kein new Function', () => {
  for (const file of appFiles) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(/.test(src), file);
  }
});

test('keine fremden Server im Code', () => {
  for (const file of [...appFiles, ...htmlFiles]) {
    const src = readFileSync(file, 'utf8');
    const urls = src.match(/https?:\/\/[^\s'"`)<>;,]+/g) || [];
    // Namensräume wie http://www.w3.org/2000/svg sind Kennungen, keine Netzwerkanfragen
    for (const url of urls.filter((u) => !u.startsWith('http://www.w3.org/'))) {
      let host;
      try {
        host = new URL(url).host;
      } catch {
        continue; // keine gültige Adresse (z. B. "https://…" in einem Kommentar)
      }
      assert.ok(host === 'api.anthropic.com', `${file}: externe Adresse ${url}`);
    }
  }
});

test('Content-Security-Policy erlaubt nur eigene Dateien und die Anthropic-API', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(csp, 'CSP fehlt');
  const policy = csp[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self'(;|$)/);
  assert.match(policy, /connect-src 'self' https:\/\/api\.anthropic\.com(;|$)/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(policy));
});

test('keine API-Schlüssel im Repository-Code', () => {
  for (const file of [...appFiles, ...htmlFiles]) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/sk-ant-[a-zA-Z0-9_-]{10,}/.test(src), `${file}: sieht aus wie ein API-Schlüssel`);
  }
});

test('keine style-Attribute (würden von der CSP blockiert)', () => {
  for (const file of appFiles) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/setAttribute\(\s*['"]style['"]/.test(src), `${file}: setAttribute('style') – bitte node.style benutzen`);
    assert.ok(!/style:\s*['"`][a-z-]+\s*:/.test(src), `${file}: style-Text als Attribut – bitte node.style oder el(…, { style: { … } })`);
  }
});

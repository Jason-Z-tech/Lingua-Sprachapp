// Offline-Modus: Service Worker, Dateiliste und Manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { appFiles } from '../tools/build-sw.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

function listedFiles() {
  const m = sw.match(/const APP_FILES = (\[[\s\S]*?\]);/);
  assert.ok(m, 'APP_FILES in sw.js');
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test('sw.js: Dateiliste ist aktuell (sonst: node tools/build-sw.mjs)', () => {
  assert.deepEqual(listedFiles(), appFiles());
  for (const f of listedFiles()) assert.ok(existsSync(join(root, f)), f);
});

test('sw.js: speichert nur eigene GET-Anfragen, nie die Anthropic-API', () => {
  assert.match(sw, /request\.method !== 'GET'\) return/);
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/);
  assert.doesNotMatch(sw, /anthropic\.com|https?:\/\//);
  assert.doesNotMatch(sw, /importScripts|eval\(/);
});

test('Manifest ist gültig und verweist auf vorhandene Symbole', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.lang, 'de');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url.startsWith('./'), 'relativer Start (GitHub Pages im Unterordner)');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.type === 'image/png'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, icon.src)), icon.src);
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest"/);
});

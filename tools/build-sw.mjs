// Schreibt die Liste der App-Dateien (ohne Lerninhalte) in sw.js und setzt eine neue Version.
// Aufruf: node tools/build-sw.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

export function appFiles() {
  return ['index.html', 'manifest.webmanifest', ...walk('assets'), ...walk('css'), ...walk('js'), ...walk('vendor'), 'content/languages.json']
    .map((p) => relative(root, join(root, p)).split('\\').join('/'))
    .filter((p) => !/\.(md|map)$/.test(p) && !p.split('/').some((part) => part.startsWith('.')))
    .sort();
}

export function versionOf(files) {
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
  return hash.digest('hex').slice(0, 8);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = appFiles();
  const version = versionOf(files);
  const swPath = join(root, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const block = `/* PRECACHE-START */\nconst VERSION = '${version}';\nconst APP_FILES = ${JSON.stringify(files, null, 2).replace(/"/g, "'")};\n/* PRECACHE-END */`;
  const next = sw.replace(/\/\* PRECACHE-START \*\/[\s\S]*?\/\* PRECACHE-END \*\//, block);
  writeFileSync(swPath, next);
  console.log(`sw.js: ${files.length} Dateien, Version ${version}`);
}

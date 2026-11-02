#!/usr/bin/env node
// Erzeugt content/<sprache>/stories/index.json aus den vorhandenen Geschichten.
// Nur ein Entwickler-Werkzeug (die App liest die fertige index.json).
//
//   node tools/build-story-index.mjs

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordsOf } from '../js/lang/tokenize.js';

const root = fileURLToPath(new URL('../content/', import.meta.url));
const { languages } = JSON.parse(readFileSync(join(root, 'languages.json'), 'utf8'));

for (const { code } of languages) {
  const dir = join(root, code, 'stories');
  if (!existsSync(dir)) continue;
  const meta = JSON.parse(readFileSync(join(root, code, 'meta.json'), 'utf8'));
  const files = readdirSync(dir)
    .filter((f) => /^(a1|a2|b1)-\d\d\.json$/.test(f))
    .sort();
  const stories = files.map((file) => {
    const s = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const words = s.sentences.reduce((n, sentence) => n + wordsOf(sentence.text, code, { elision: Boolean(meta.elision) }).length, 0);
    return {
      id: s.id,
      file,
      level: s.level,
      type: s.type,
      title: s.title,
      title_de: s.title_de,
      topics: s.topics,
      summary_de: s.summary_de,
      words,
    };
  });
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify({ formatVersion: 1, lang: code, stories }, null, 2)}\n`);
  console.log(`${code}: ${stories.length} Texte`);
}

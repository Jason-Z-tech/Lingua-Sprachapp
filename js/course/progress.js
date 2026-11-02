// Kursfortschritt: Reihenfolge der Lektionen, Empfehlung, was "später" ist,
// gelernte Kanji und Kana. Reine Funktionen (in Node testbar).

export const PASS_SCORE = 0.8;

/**
 * Baut die Lernreihenfolge: (Japanisch: Hiragana, Katakana) → A1 → A2 → B1.
 * Jeder Eintrag: { id, kind: 'kana' | 'lesson', group, level, number, available, meta }
 */
export function courseSequence(index, kana = null) {
  const seq = [];
  if (kana) {
    for (const script of ['hiragana', 'katakana']) {
      const s = kana.scripts[script];
      s.lessons.forEach((l, i) => {
        seq.push({ id: l.id, kind: 'kana', group: script, level: 'kana', number: i + 1, available: true, meta: l });
      });
    }
  }
  for (const level of index.levels) {
    level.lessons.forEach((l, i) => {
      seq.push({ id: l.id, kind: 'lesson', group: level.id, level: level.id, number: i + 1, available: Boolean(l.available), meta: l });
    });
  }
  return seq;
}

export function lessonProgress(profile, id) {
  return (profile && profile.course && profile.course[id]) || null;
}

export function isCompleted(profile, id) {
  const p = lessonProgress(profile, id);
  return Boolean(p && p.completedAt);
}

/** Ab welchem Eintrag beginnt dieser Lernende (nach Niveau und Kana-Kenntnissen)? */
export function startIndex(profile, seq) {
  const level = profile.level;
  const kana = profile.options && profile.options.kana;
  let target = null;
  if (level === 'A2' || level === 'B1') target = level;
  if (target) {
    const i = seq.findIndex((s) => s.level === target);
    if (i !== -1) return i;
  }
  if (kana === 'both') {
    const i = seq.findIndex((s) => s.kind === 'lesson');
    return i === -1 ? 0 : i;
  }
  if (kana === 'hiragana') {
    const i = seq.findIndex((s) => s.group === 'katakana');
    return i === -1 ? 0 : i;
  }
  return 0;
}

/** Die empfohlene nächste Lektion (oder null, wenn alles Verfügbare erledigt ist). */
export function recommended(profile, seq) {
  const start = startIndex(profile, seq);
  for (let i = start; i < seq.length; i++) {
    const item = seq[i];
    if (!item.available) return { item, index: i, waiting: true };
    if (!isCompleted(profile, item.id)) return { item, index: i, waiting: false };
  }
  return null;
}

/**
 * Status für die Anzeige:
 *  'done' | 'recommended' | 'started' | 'later' | 'skippable' | 'unavailable'
 */
export function itemStatus(profile, seq, id) {
  const index = seq.findIndex((s) => s.id === id);
  if (index === -1) return 'unavailable';
  const item = seq[index];
  if (!item.available) return 'unavailable';
  if (isCompleted(profile, id)) return 'done';
  const rec = recommended(profile, seq);
  const start = startIndex(profile, seq);
  if (index < start) return 'skippable';
  if (rec && rec.item.id === id) return 'recommended';
  if (lessonProgress(profile, id)) return 'started';
  if (rec && index > rec.index) return 'later';
  return 'started';
}

/** Muss vor dem Öffnen kurz nachgefragt werden? (Lektion liegt nach der empfohlenen) */
export function needsConfirmation(profile, seq, id) {
  const status = itemStatus(profile, seq, id);
  return status === 'later';
}

/** Kanji, deren Lektion abgeschlossen ist. kanjiList: Einträge aus kanji.json */
export function learnedKanji(profile, kanjiList) {
  const out = new Set();
  for (const k of kanjiList || []) if (isCompleted(profile, k.lesson)) out.add(k.char);
  return out;
}

/** Kana, die als gelernt gelten (abgeschlossene Kana-Lektionen oder Vorkenntnisse). */
export function learnedKana(profile, kana) {
  const out = new Set();
  if (!kana) return out;
  const pre = profile.options && profile.options.kana;
  for (const script of ['hiragana', 'katakana']) {
    const known = pre === 'both' || (pre === 'hiragana' && script === 'hiragana');
    for (const lesson of kana.scripts[script].lessons) {
      if (known || isCompleted(profile, lesson.id)) for (const c of lesson.chars) for (const ch of c.kana) out.add(ch);
    }
  }
  return out;
}

/** Fortschritt einer Stufe: { done, available, total } */
export function groupSummary(profile, seq, group) {
  const items = seq.filter((s) => s.group === group);
  return {
    total: items.length,
    available: items.filter((s) => s.available).length,
    done: items.filter((s) => isCompleted(profile, s.id)).length,
  };
}

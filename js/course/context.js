// Lädt alles, was Kurs-, Lektions- und Kana-Ansichten brauchen, an einer Stelle.

import { loadCourseIndex, loadKana, loadKanji, loadLanguages, loadMeta } from '../content/loader.js';
import { getProfile, getState, update } from '../store/state.js';
import { courseSequence, learnedKana, learnedKanji } from './progress.js';
import { ttsSupported } from '../speech/tts.js';

export async function loadCourseContext(code = null) {
  const profile = getProfile(code || undefined);
  if (!profile) return null;
  const lang = profile.code;
  const isJa = lang === 'ja';
  const [languages, meta, index, kana, kanji] = await Promise.all([
    loadLanguages(),
    loadMeta(lang),
    loadCourseIndex(lang),
    isJa ? loadKana() : Promise.resolve(null),
    isJa ? loadKanji() : Promise.resolve({ kanji: [] }),
  ]);
  const info = languages.find((l) => l.code === lang);
  const seq = courseSequence(index, kana);
  return {
    lang,
    langName: info ? info.name : lang,
    profile,
    meta,
    index,
    kana,
    kanji: kanji.kanji || [],
    seq,
  };
}

/** Kontext für Übungsrunden und Textanzeige (immer mit aktuellem Lernstand). */
export function sessionContext(cc) {
  const profile = getProfile(cc.lang);
  const state = getState();
  return {
    lang: cc.lang,
    langName: cc.langName,
    meta: cc.meta,
    ttsRate: state.settings.ttsRate,
    listening: ttsSupported(),
    furigana: (profile.options && profile.options.furigana) || 'unknown',
    knownKanji: learnedKanji(profile, cc.kanji),
    knownKana: learnedKana(profile, cc.kana),
  };
}

/** Fortschritt einer Lektion ändern: markLesson('es', 'es-a1-01', (p) => { p.vocabSeenAt = … }) */
export function markLesson(lang, id, mutator) {
  update((s) => {
    const profile = s.langs[lang];
    if (!profile) return;
    if (!profile.course[id]) profile.course[id] = { startedAt: new Date().toISOString() };
    mutator(profile.course[id], profile);
  }, 'course');
}

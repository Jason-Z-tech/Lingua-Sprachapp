// Bereiche, die in den nächsten Etappen entstehen.

import { mount } from '../ui/dom.js';
import { getProfile } from '../store/state.js';
import { loadLanguages } from '../content/loader.js';
import { languageName, pageHead, placeholderCard } from './common.js';

const SECTIONS = {
  kurs: {
    title: 'Kurs',
    icon: 'course',
    text: 'Lektionen von A1 bis B1 wie im Schulbuch: Vokabeln mit Beispielsätzen, Grammatik auf Deutsch erklärt, Übungen und ein Test am Ende jeder Lektion. Für Japanisch zusätzlich Hiragana, Katakana und Kanji.',
  },
  lesen: {
    title: 'Lesen & Hören',
    icon: 'read',
    text: 'Geschichten und Dialoge passend zu deinem Wortschatz. Jedes Wort lässt sich antippen und vorlesen; neue Wörter wandern mit ihrem Satz in deinen Lernstapel.',
  },
  wiederholen: {
    title: 'Wiederholen',
    icon: 'review',
    text: 'Tägliche Wiederholung mit dem FSRS-Verfahren: Jedes Wort kommt genau dann wieder, wenn du es sonst vergessen würdest. Du rufst die Antwort aktiv ab, statt sie nur wiederzuerkennen.',
  },
  sprechen: {
    title: 'Sprechen',
    icon: 'speak',
    text: 'Alltagsszenen wie im Café bestellen oder nach dem Weg fragen. Du sprichst laut, die App vergleicht mit dem Zieltext und gibt dir eine Rückmeldung.',
  },
};

export function placeholderView(key) {
  return async function view(main) {
    const section = SECTIONS[key];
    const profile = getProfile();
    const languages = await loadLanguages();
    mount(
      main,
      pageHead({ eyebrow: profile ? languageName(languages, profile.code) : '', title: section.title }),
      placeholderCard({ iconName: section.icon, title: 'Kommt bald', text: section.text, note: 'In Arbeit' }),
    );
  };
}

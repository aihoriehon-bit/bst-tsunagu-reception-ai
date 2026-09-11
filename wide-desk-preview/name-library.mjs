import { NAME_RECORDINGS } from './name-library-data.mjs?v=20260910-bank10000-1';
import { normalizeReading } from './kana-name.mjs?v=20260909-5';

export { NAME_RECORDINGS };
const byReading = new Map(NAME_RECORDINGS.map(entry => [entry.reading, entry]));
// A real reading can end in さま, or even be さん. Exact bank keys win over
// optional honorific removal (くさま must never become く).
const literalReading = value => String(value || '').normalize('NFKC').trim()
  .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・･。]/g, '');
export function normalizeNameReading(value) {
  const literal = literalReading(value);
  return byReading.has(literal) ? literal : normalizeReading(value);
}
const byName = new Map();
for (const entry of NAME_RECORDINGS) for (const name of entry.names) {
  const key = literalReading(name);
  if (!key) continue;
  const choices = byName.get(key) || [];
  if (!choices.includes(entry)) choices.push(entry);
  byName.set(key, choices);
}
export function recordedName(person) {
  const reading = normalizeNameReading(person?.reading);
  if (literalReading(person?.reading)) return byReading.get(reading) || null;
  const literal = literalReading(person?.name);
  if (byReading.has(literal)) return byReading.get(literal);
  if (byName.has(literal)) {
    const choices = byName.get(literal);
    return choices.length === 1 ? choices[0] : null;
  }
  const name = normalizeNameReading(person?.name);
  if (byReading.has(name)) return byReading.get(name);
  const choices = byName.get(name) || [];
  // Never guess between e.g. やまざき and やまさき. Never shorten a full name.
  return choices.length === 1 ? choices[0] : null;
}
export function nameVoiceDescription(person) {
  const found = recordedName(person);
  if (!found && !normalizeReading(person?.reading) && (byName.get(normalizeReading(person?.name)) || []).length > 1) {
    return '読みがなを入力してください。この漢字には複数の読み方があります。';
  }
  return found ? `収録済み：${found.reading}さん（名前全体の音声）`
    : '未収録：入力した読みがなを、以前のAI音声で名前全体として読み上げます。';
}

import { NAME_RECORDINGS } from './name-library-data.mjs?v=20260910-1';
import { normalizeReading } from './kana-name.mjs?v=20260909-5';

export { NAME_RECORDINGS };
const byReading = new Map(NAME_RECORDINGS.map(entry => [entry.reading, entry]));
const byName = new Map();
for (const entry of NAME_RECORDINGS) for (const name of entry.names) {
  const key = normalizeReading(name);
  const choices = byName.get(key) || [];
  if (!choices.includes(entry)) choices.push(entry);
  byName.set(key, choices);
}
export function recordedName(person) {
  const reading = normalizeReading(person?.reading);
  if (reading) return byReading.get(reading) || null;
  const name = normalizeReading(person?.name);
  if (byReading.has(name)) return byReading.get(name);
  const choices = byName.get(name) || [];
  // Never guess between e.g. やまざき and やまさき. Never shorten a full name.
  return choices.length === 1 ? choices[0] : null;
}
export function nameVoiceDescription(person) {
  const found = recordedName(person);
  return found ? `収録済み：${found.reading}さん（名前全体の音声）`
    : '未収録：従来の１音ずつつなぐ試作音声になります。自然な音声にするには、呼びたい読みをお知らせください。';
}

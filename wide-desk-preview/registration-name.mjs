import { recordedName, normalizeNameReading } from './name-library.mjs?v=20260910-bank10000-1';

const clean = value => String(value || '').trim().slice(0, 40);
export function registrationName(mode, firstName, firstReading, lastName = '', lastReading = '') {
  if (!['surname', 'given', 'full'].includes(mode)) return { nameMode: 'legacy', name: clean(firstName), reading: clean(firstReading) };
  const nameParts = [{ name: clean(firstName), reading: clean(firstReading) }];
  if (mode === 'full') nameParts.push({ name: clean(lastName), reading: clean(lastReading) });
  return {
    nameMode: mode, nameParts,
    name: nameParts.map(p => p.name).join(' ').trim(),
    reading: nameParts.map(p => recordedName(p)?.reading || normalizeNameReading(p.reading || p.name)).join(''),
  };
}
export function structuredParts(person) {
  const count = person?.nameMode === 'full' ? 2 : ['surname', 'given'].includes(person?.nameMode) ? 1 : 0;
  return count && Array.isArray(person.nameParts) && person.nameParts.length === count && person.nameParts.every(p => p && typeof p.name === 'string' && typeof p.reading === 'string') ? person.nameParts : null;
}
export function validateRegistrationName(person) {
  const parts = structuredParts(person);
  if (!person.name || (parts && parts.some(p => !p.name))) throw new Error(person.nameMode === 'full' ? '名字と名前の両方を入力してください。片方だけの場合は登録方法を変更してください。' : 'お名前を入力してください。');
  if (person.name.length > 40) throw new Error('名字と名前は合わせて40文字以内で入力してください。');
}
// Keep legacy strings intact. Never infer a boundary in an old full name.
export function restoreRegistrationName(person) {
  const parts = structuredParts(person);
  return parts ? registrationName(person.nameMode, parts[0].name, parts[0].reading, parts[1]?.name, parts[1]?.reading)
    : { nameMode: 'legacy', name: clean(person?.name), reading: typeof person?.reading === 'string' ? person.reading.slice(0, 60) : '' };
}

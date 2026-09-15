import { predictReading } from './reading-autofill.mjs';

export const toRecipientKana = value => String(value || '').normalize('NFKC').trim()
  .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・･]/g, '');
const isKana = value => /^[ぁ-ゖー]+$/.test(value) && value.length <= 80;
const key = value => String(value || '').normalize('NFKC').replace(/[\s・･]/g, '');
export function recipientReading(state, people = []) {
  const raw = String(state.recipient || '').trim();
  if (!raw) return { text: '', kind: 'empty' };
  if (raw === '総務担当者') return { text: raw, kind: 'department' };
  if (state.recipientReadingFor === raw) {
    return isKana(toRecipientKana(state.recipientReading)) ? { text: toRecipientKana(state.recipientReading), kind: 'confirmed' } : { text: '', kind: 'unknown' };
  }
  if (isKana(toRecipientKana(raw))) return { text: toRecipientKana(raw), kind: 'kana' };
  const suffix = raw.match(/(さん|様|さま|先生)$/)?.[1] || '';
  const stem = key(suffix ? raw.slice(0, -suffix.length) : raw);
  const ending = suffix === '様' ? 'さま' : suffix === '先生' ? 'せんせい' : suffix;
  const registered = new Set();
  for (const person of people) {
    if (person.role !== 'employee') continue;
    const entries = [person, ...(person.nameParts || [])];
    for (const entry of entries) if (key(entry.name) === stem && isKana(toRecipientKana(entry.reading))) registered.add(toRecipientKana(entry.reading));
  }
  if (registered.size === 1) return { text: [...registered][0] + ending, kind: 'registered' };
  // Conflicting registered readings must not be replaced by a dictionary guess.
  if (registered.size > 1) return { text: '', kind: 'unknown' };
  const direct = predictReading(stem);
  let reading = direct.reading;
  if (!reading) {
    const candidates = new Set();
    for (let split = 1; split < stem.length; split++) {
      const surname = predictReading(stem.slice(0, split), 'surname');
      const given = predictReading(stem.slice(split), 'given');
      if (surname.reading && given.reading) candidates.add(surname.reading + given.reading);
    }
    if (candidates.size === 1) reading = [...candidates][0];
  }
  return reading ? { text: reading + ending, kind: 'predicted' } : { text: '', kind: 'unknown' };
}

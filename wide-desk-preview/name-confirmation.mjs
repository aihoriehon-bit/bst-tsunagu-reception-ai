import { readingFor } from './kana-name.mjs?v=20260909-5';
import { recordedName } from './name-library.mjs?v=20260910-bank10000-1';
import { structuredParts } from './registration-name.mjs?v=20260911-fullname-1';

// Change the revision whenever the bank or assembly changes: old approval must not
// silently authorize a different pronunciation.
export const NAME_AUDIO_REVISION = 'whole-name-mp3-10000-v1-kana-bank3';
export function nameApprovalToken(person) {
  return JSON.stringify([NAME_AUDIO_REVISION, String(person?.name || '').trim(), recordedName(person)?.reading || readingFor(person), person?.nameMode || 'legacy', structuredParts(person)]);
}
export function isNameApproved(person) {
  return Boolean(person?.name && person?.nameAudioApproval === nameApprovalToken(person));
}
// Face/name registration enables calling by default. Audition is advisory;
// only an explicit OFF preference suppresses an otherwise readable name.
export function shouldCallName(person) {
  return Boolean(person?.name && person.nameCallingEnabled !== false);
}
export function hasNameReading(person) {
  const parts = structuredParts(person);
  if (parts) return parts.every(p => p.name && hasNameReading(p));
  if (recordedName(person)) return true;
  const reading = readingFor(person);
  return reading.length > 0 && reading.length <= 40 && /^[ぁ-ゖー]+$/.test(reading);
}
export function createNameAudition() {
  let played = '';
  return {
    clear() { played = ''; },
    completed(person) { played = nameApprovalToken(person); },
    canApprove(person) { return played === nameApprovalToken(person); },
  };
}

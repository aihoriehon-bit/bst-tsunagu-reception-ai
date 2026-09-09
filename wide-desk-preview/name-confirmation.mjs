import { readingFor } from './kana-name.mjs?v=20260909-5';

// Change the revision whenever the bank or assembly changes: old approval must not
// silently authorize a different pronunciation.
export const NAME_AUDIO_REVISION = 'kana-bank3-assembly1';
export function nameApprovalToken(person) {
  return JSON.stringify([NAME_AUDIO_REVISION, String(person?.name || '').trim(), readingFor(person)]);
}
export function isNameApproved(person) {
  return Boolean(person?.name && person?.nameAudioApproval === nameApprovalToken(person));
}
export function createNameAudition() {
  let played = '';
  return {
    clear() { played = ''; },
    completed(person) { played = nameApprovalToken(person); },
    canApprove(person) { return played === nameApprovalToken(person); },
  };
}

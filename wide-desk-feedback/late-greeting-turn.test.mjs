import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./automatic-conversation.js', import.meta.url), 'utf8');
const getter = source.match(/get canAnnounceName\(\) \{([^}]+)\}/)[1];
const start = source.indexOf('onStatus(code) {') + 'onStatus(code) {'.length;
const status = source.slice(start, source.indexOf('\n  } });', start));
const levelStart = source.indexOf('onLevel(value) {') + 'onLevel(value) {'.length;
const level = source.slice(levelStart, source.indexOf('}, onReady:', levelStart));
function fixture() {
  const context = { completed: false, speaking: false, visitorSpeaking: false, micStatus: 'processing',
    input: { value: '' }, voiceActivityAt: 99500, now: 100000, renderCue() {}, q: () => ({}), turnIndicator: { setLevel() {} } };
  context.Date = { now: () => context.now };
  vm.createContext(context);
  vm.runInContext(`function canAnnounce(){${getter}};function onStatus(code){${status}};function onLevel(value){${level}}`, context);
  return context;
}
test('new listening turn permits late recognition without carrying over the previous four-second delay', () => {
  const f = fixture(); assert.equal(f.canAnnounce(), false);
  f.visitorSpeaking = true; f.onStatus('listening');
  assert.equal(f.visitorSpeaking, false); assert.equal(f.canAnnounce(), true);
});
test('real speech, pending transcription, AI playback and typed answers still prevent interruption', () => {
  for (const change of [{ visitorSpeaking: true }, { micStatus: 'processing' }, { speaking: true }, { input: { value: '入力途中' } }, { completed: true }]) {
    const f = fixture(); f.onStatus('listening'); Object.assign(f, change); assert.equal(f.canAnnounce(), false);
  }
});
test('local mic activity guards the gap before remote speech-start, but quiet waiting does not renew the hold', () => {
  const f = fixture(); f.onStatus('listening');
  f.onLevel(.3); assert.equal(f.canAnnounce(), false);
  f.now += 500; f.onLevel(0); assert.equal(f.canAnnounce(), false);
  f.now += 301; f.onLevel(.01); assert.equal(f.canAnnounce(), true);
  f.visitorSpeaking = true; f.now += 10000; assert.equal(f.canAnnounce(), false);
});

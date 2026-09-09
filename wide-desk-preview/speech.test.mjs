import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('async function speakLine('), source.indexOf('async function runSequence('));
function fixture(line) {
  const motions = [], audio = { pause() {}, play: async () => {} };
  const state = {
    mixer: {}, SPEECH_LINES: { registeredName: line }, SPEECH_AUDIO_VERSION: 'test',
    deviceVoiceTimeout: null, speechRequestId: 0, speechBusy: false, sequenceId: 0,
    speechPlayer: audio, currentSpeechAudio: null, posture: 0, soundEnabled: true,
    speechStatusElement: {}, lastSpeechAt: 0, sensorAutomationActive: false,
    speechButtonsElement: { querySelectorAll: () => [] },
    cancelNameVoice() { state.cancelled = true; }, stopLipSync() { state.lips = false; }, startLipSync() { state.lips = true; },
    playMotion(key) { motions.push(key); }, setActiveButton() {}, getMotionDurationMs: () => 0,
    updateSoundToggle() {}, returnToDeskAfterStartup() {}, isSensorVisitorPresent: () => true,
    setTimeout, clearTimeout, window: { setTimeout(fn) { fn(); } },
    speakDeviceName(text, callbacks) { state.text = text; state.callbacks = callbacks; },
  };
  vm.createContext(state); vm.runInContext(code, state);
  return { state, audio, motions };
}
test('device name stands, lip-syncs, finishes, and hands off exactly once', async () => {
  const f = fixture({ text: '山本さん。', spokenText: 'やまもとさん' }); let finishes = 0;
  await f.state.speakLine('registeredName', null, { onFinish: () => finishes++ });
  assert.equal(f.state.text, 'やまもとさん'); assert.equal(f.motions[0], 'standUp');
  f.state.callbacks.onstart(); assert.equal(f.state.lips, true);
  f.state.callbacks.onend(); f.state.callbacks.onend();
  assert.equal(finishes, 1); assert.equal(f.state.speechBusy, false); assert.equal(f.state.lips, false);
});
test('stored whole-name WAV uses the blob URL unchanged', async () => {
  const f = fixture({ text: '山本さん。', audio: 'blob:example', spokenText: 'やまもとさん' }); let done = false;
  await f.state.speakLine('registeredName', null, { onFinish: () => done = true });
  assert.equal(f.audio.src, 'blob:example'); assert.equal(f.state.text, undefined);
  f.audio.onended(); assert.equal(done, true);
});
test('a stale name callback cannot resume cancelled greetings', async () => {
  const f = fixture({ text: '山本さん。', spokenText: 'やまもとさん' }); let done = false;
  await f.state.speakLine('registeredName', null, { onFinish: () => done = true });
  f.state.cancelSpeechSequence(false); f.state.callbacks.onend();
  assert.equal(done, false); assert.equal(f.state.speechBusy, false);
});
test('missing device voice reports failure so the role greeting can continue', async () => {
  const f = fixture({ text: '山本さん。', spokenText: 'やまもとさん' }); let failed = false;
  await f.state.speakLine('registeredName', null, { onFailure: () => failed = true });
  f.state.callbacks.onerror(); assert.equal(failed, true); assert.equal(f.state.speechBusy, false);
});

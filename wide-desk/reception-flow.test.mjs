import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { receptionPlan } from './visitor-matching.mjs';

const source = readFileSync(new URL('./motion-preview.js', import.meta.url), 'utf8');
// Execute the actual orchestration with deterministic camera, motion and audio adapters.
const flow = source.slice(source.indexOf('function updateAutomaticSpeech('), source.indexOf('function returnToDeskAfterStartup('));
const sensorLoop = source.slice(source.indexOf('function updateSensorBehavior('), source.indexOf('function updateAutomaticSpeech('));
const trigger = source.slice(source.indexOf('function triggerVisitorTest('), source.indexOf('function isSensorVisitorPresent('));
function fixture(identity = null, demo = null) {
  const spoken = [], motions = [];
  const state = {
    mixer: {}, sequenceId: 0, greetingPending: false, sensorAutomationActive: false,
    sensorAttending: true, attendLineIndex: 0, workLineIndex: 0, currentReceptionPlan: null,
    currentVisitorSpeechKey: null, pendingTestSpeechKey: demo, testVisitorUntil: demo ? Date.now() + 24000 : 0,
    soundEnabled: true, speechBusy: false, posture: 0, currentMotionKey: 'deskWork', lastSpeechAt: 0,
    faceFirstSeenAt: 0, faceLastSeenAt: 0, TEST_VISITOR_MS: 24000,
    faceVisible: false, FACE_CONFIRM_MS: 600, FACE_LOST_MS: 5000,
    visitorStatusElement: {}, cameraFaceMarkElement: {}, cameraViewElement: { classList: { add() {} } },
    document: { hidden: false, querySelector: () => ({ checked: true }) },
    receptionPlan, timeSpeechKey: () => 'greetingDayArrival',
    cancelSpeechSequence() {}, setActiveButton() {}, getMotionDurationMs: () => 1,
    waitFor: async () => true,
    isSensorVisitorPresent: () => true,
    visitorRecognition: { paused: false, identify: async () => identity },
    playMotion(key) { motions.push(key); state.currentMotionKey = key; state.posture = 1; },
    speakLine(key, button, options) { spoken.push(key); state.sequenceId++; state.finish = options?.onFinish; },
    runSensorSitDown() { motions.push('sitDown'); }, updateSensorBehavior() {},
  };
  vm.createContext(state); vm.runInContext(sensorLoop + '\n' + flow + '\n' + trigger, state);
  return { state, spoken, motions };
}
test('employee demo starts with employee speech, waits quietly, and uses employee farewell', async () => {
  const { state, spoken } = fixture(null, 'employeeSato');
  await state.beginSensorGreeting();
  assert.deepEqual(spoken, ['employeeSato']);
  state.finish(); state.currentMotionKey = 'standIdle';
  state.updateAutomaticSpeech(Date.now() + 60000);
  assert.deepEqual(spoken, ['employeeSato']);
  state.beginSensorReturn();
  assert.deepEqual(spoken, ['employeeSato', 'employeeGoodbye']);
});
test('recognized employee and delivery never receive welcome', async () => {
  for (const [identity, key] of [[{ name: '田中', role: 'employee', source: 'face' }, 'employeeTanaka'], [{ name: '配達', role: 'delivery', source: 'clothing' }, 'calling']]) {
    const f = fixture(identity); await f.state.beginSensorGreeting();
    assert.deepEqual(f.spoken, [key]);
  }
});
test('ordinary visitor test replaces an active employee demo', async () => {
  const f = fixture(null, 'employeeSato'); await f.state.beginSensorGreeting(); f.state.finish();
  f.state.triggerVisitorTest();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.currentReceptionPlan.role, 'guest');
  assert.equal(f.spoken.at(-1), 'welcome');
  f.state.finish();
  assert.equal(f.spoken.at(-1), 'greetingDayArrival');
});
test('an obsolete recognition result cannot interrupt a newer delivery request', async () => {
  const f = fixture(); let resolveIdentity;
  f.state.visitorRecognition.identify = () => new Promise(resolve => { resolveIdentity = resolve; });
  const old = f.state.beginSensorGreeting();
  f.state.triggerVisitorTest('calling');
  await new Promise(resolve => setImmediate(resolve));
  resolveIdentity({ name: '佐藤', role: 'employee', source: 'face' }); await old;
  assert.deepEqual(f.spoken, ['calling']);
});
test('departures while identifying cancel late speech', async () => {
  const f = fixture(); let resolveIdentity;
  f.state.visitorRecognition.identify = () => new Promise(resolve => { resolveIdentity = resolve; });
  const pending = f.state.beginSensorGreeting();
  f.state.sensorAttending = false; f.state.beginSensorReturn();
  resolveIdentity({ name: '佐藤', role: 'employee', source: 'face' }); await pending;
  assert.deepEqual(f.spoken, []);
  assert.equal(f.motions.at(-1), 'sitDown');
});

test('expired employee demo re-identifies the real visitor in front of the camera', async () => {
  const f = fixture(null, 'employeeSato'); await f.state.beginSensorGreeting(); f.state.finish();
  f.state.faceVisible = true;
  f.state.testVisitorUntil = Date.now() - 1;
  f.state.updateSensorBehavior();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.currentReceptionPlan.role, 'guest');
  assert.equal(f.spoken.at(-1), 'welcome');
});

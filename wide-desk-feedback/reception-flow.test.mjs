import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { receptionPlan } from './visitor-matching.mjs';
import { nameLine as realNameLine } from './name-voice.js';
import { initialReceptionState, recognizeLateGuest, recognizeLateEmployee, respond } from './dialogue.mjs';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
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
    greetingStartedAt: 0, conversation: { active: false, state: {}, close() { this.active = false; this.state = {}; }, beginReception(role, identity) { this.active = true; this.state = initialReceptionState(role, identity); }, recognizeVisitor(person) { const result = recognizeLateEmployee(this.state, person) || recognizeLateGuest(this.state, person); if (result) this.state = result.state; return result?.key; }, setPresence(value) { this.present = value; }, setAudible() {} }, SPEECH_LINES: {},
    nameLine: async person => ({ text: person.name + 'さん。', spokenText: person.name + 'さん' }),
    faceFirstSeenAt: 0, faceLastSeenAt: 0, TEST_VISITOR_MS: 24000,
    faceVisible: false, FACE_CONFIRM_MS: 600, FACE_LOST_MS: 5000,
    visitorStatusElement: {}, cameraFaceMarkElement: {}, cameraViewElement: { classList: { add() {} } },
    document: { hidden: false, querySelector: () => ({ checked: true }) },
    receptionPlan, timeSpeechKey: () => 'greetingDayArrival',
    cancelSpeechSequence() {}, setActiveButton() {}, getMotionDurationMs: () => 1,
    waitFor: async () => true,
    isSensorVisitorPresent: () => true,
    visitorRecognition: { paused: false, identify: async () => identity, current: () => identity },
    playMotion(key) { motions.push(key); state.currentMotionKey = key; state.posture = 1; },
    speakLine(key, button, options) { spoken.push(key); state.sequenceId++; state.finish = options?.onFinish; state.fail = options?.onFailure; },
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
  for (const [identity, key] of [[{ name: '山本', role: 'employee', source: 'face' }, 'registeredName'], [{ name: '配達', role: 'delivery', source: 'clothing' }, 'calling']]) {
    const f = fixture(identity); await f.state.beginSensorGreeting();
    assert.deepEqual(f.spoken, [key]);
  }
});

test('arbitrary registered names precede the role greeting without doubling a name', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const f = fixture({ id: 'known', name: '山本花子', role, source: 'face' });
    await f.state.beginSensorGreeting();
    assert.equal(f.state.SPEECH_LINES.registeredName.text, '山本花子さん。');
    f.state.finish();
    assert.deepEqual(f.spoken, ['registeredName', role === 'employee' ? 'employeeGeneric' : role === 'delivery' ? 'calling' : 'visitor']);
  }
});
test('real name generator starts every registered face role with its name without an audition approval', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const f = fixture({ id: 'known', name: '佐藤', reading: 'さとう', nameAudioApproval: '', role, source: 'face' });
    f.state.nameLine = realNameLine; f.state.speechStatusElement = {};
    await f.state.beginSensorGreeting();
    assert.deepEqual(f.spoken, ['registeredName']);
    assert.equal(f.state.SPEECH_LINES.registeredName.audio, '../wide-desk-preview/audio/nameSato.wav');
    f.state.finish();
    assert.equal(f.spoken[1], role === 'employee' ? 'employeeGeneric' : role === 'guest' ? 'visitor' : 'calling');
  }
});
test('explicit name OFF still uses role-appropriate greeting and clothing never calls an individual name', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const f = fixture({ id: 'known', name: '佐藤', role, source: 'face', nameCallingEnabled: false });
    f.state.nameLine = realNameLine; f.state.speechStatusElement = {};
    await f.state.beginSensorGreeting();
    assert.deepEqual(f.spoken, [role === 'employee' ? 'employeeGeneric' : role === 'guest' ? 'visitor' : 'calling']);
  }
  const f = fixture({ name: '佐藤', source: 'clothing', role: 'delivery' });
  f.state.nameLine = () => { throw Error('Must not infer an individual from clothing'); };
  await f.state.beginSensorGreeting(); assert.deepEqual(f.spoken, ['calling']);
});
test('a missing reading or failed name bank still permits the role greeting', async () => {
  const f = fixture({ name: '山本', source: 'face', role: 'employee' });
  f.state.speechStatusElement = {};
  f.state.nameLine = async () => { throw Error('読みがなを入力してください'); };
  await f.state.beginSensorGreeting();
  assert.deepEqual(f.spoken, ['employeeGeneric']);
  f.state.finish(); assert.equal(f.state.greetingPending, false);
});
test('automatic conversation suppresses idle speech while camera departure remains active', () => {
  const f = fixture(); f.state.conversation.active = true; f.state.faceVisible = true;
  f.state.currentReceptionPlan = receptionPlan(null, 'greetingDayArrival');
  f.state.visitorRecognition.current = () => null;
  f.state.updateSensorBehavior(); f.state.updateAutomaticSpeech(Date.now());
  assert.deepEqual(f.spoken, []);
  f.state.currentReceptionPlan = receptionPlan(null, 'greetingDayArrival');
  f.state.sensorAutomationActive = true;
  f.state.faceVisible = false; f.state.faceLastSeenAt = Date.now() - 6000;
  f.state.updateSensorBehavior();
  assert.equal(f.state.conversation.active, false);
  assert.equal(f.spoken.at(-1), 'goodbye');
});

test('camera greeting completion opens listening without another hello or conversation button', async () => {
  const f = fixture(); await f.state.beginSensorGreeting();
  assert.equal(f.state.conversation.active, false);
  f.state.finish(); f.state.finish();
  assert.equal(f.state.conversation.active, true);
  assert.deepEqual(f.spoken, ['welcome', 'greetingDayArrival']);
});
test('late recognition calls a registered name after the anonymous greeting', async () => {
  const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
  f.state.visitorRecognition.current = () => ({ name: '山本', source: 'face', role: 'guest' });
  f.state.visitorRecognition.identify = async () => ({ name: '山本', source: 'face', role: 'guest' });
  f.state.updateAutomaticSpeech(Date.now());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.spoken.at(-1), 'registeredName');
});
test('two registered faces are both named before the shared greeting and microphone turn', async () => {
  const a={id:'a',name:'山田太郎',role:'guest',source:'face'}, b={id:'b',name:'平井',role:'guest',source:'face'};
  const f=fixture(a); f.state.visitorRecognition.currentAll=()=>[a,b];
  await f.state.beginSensorGreeting();
  assert.deepEqual(f.spoken,['registeredName']);f.state.finish();
  assert.deepEqual(f.spoken,['registeredName','registeredNameGroup0']);
  assert.equal(f.state.SPEECH_LINES.registeredNameGroup0.text,'平井さん。');
  assert.equal(f.state.conversation.active,false);
  f.state.finish();assert.equal(f.spoken.at(-1),'visitor');f.state.finish();
  f.state.updateAutomaticSpeech(Date.now());assert.equal(f.spoken.length,3);
  assert.equal(f.state.conversation.active,true);
});
test('additional registered faces arriving later are named once without replacing the first visitor',async()=>{
  const a={id:'a',name:'山田太郎',role:'guest',source:'face'}, b={id:'b',name:'平井',role:'employee',source:'face'};
  const f=fixture(a);f.state.visitorRecognition.currentAll=()=>[a];
  await f.state.beginSensorGreeting();f.state.finish();f.state.finish();
  f.state.visitorRecognition.currentAll=()=>[a,b];
  f.state.updateAutomaticSpeech(Date.now());await new Promise(r=>setImmediate(r));
  assert.equal(f.spoken.at(-1),'registeredName');assert.equal(f.state.SPEECH_LINES.registeredName.text,'平井さん。');
  f.state.finish();assert.equal(f.spoken.at(-1),'chatRecognizedEmployee');f.state.finish();
  f.state.updateAutomaticSpeech(Date.now());assert.equal(f.spoken.length,4);
  assert.equal(f.state.currentReceptionPlan.identity.id,'a');
});
test('a companion leaving before their turn is skipped and name OFF remains respected',async()=>{
  const a={id:'a',name:'山田太郎',role:'guest',source:'face'}, b={id:'b',name:'平井',role:'guest',source:'face'};
  const f=fixture(a);f.state.visitorRecognition.currentAll=()=>[a,b];await f.state.beginSensorGreeting();
  f.state.visitorRecognition.currentAll=()=>[a];f.state.finish();assert.equal(f.spoken.at(-1),'visitor');
  const g=fixture(a);g.state.visitorRecognition.currentAll=()=>[a,{...b,nameCallingEnabled:false}];
  g.state.nameLine=async p=>p.nameCallingEnabled===false?null:{text:p.name+'さん。'};
  await g.state.beginSensorGreeting();g.state.finish();assert.equal(g.spoken.at(-1),'visitor');
});
test('body-only arrivals do not wait for face identification, then name once even after 20 seconds', async () => {
  const f = fixture();
  f.state.visitorRecognition.canIdentify = () => false;
  f.state.visitorRecognition.identify = () => { throw Error('must not wait for a tiny face'); };
  await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
  f.state.greetingStartedAt = Date.now() - 40000;
  const identity = { id: 'a', name: '山本', source: 'face', role: 'employee' };
  f.state.visitorRecognition.current = () => identity;
  f.state.updateAutomaticSpeech(Date.now()); await new Promise(r => setImmediate(r));
  assert.deepEqual(f.spoken, ['welcome', 'greetingDayArrival', 'registeredName']);
  assert.equal(f.state.currentReceptionPlan.role, 'employee');
  f.state.finish(); f.state.updateAutomaticSpeech(Date.now());
  assert.equal(f.spoken.at(-1), 'chatRecognizedEmployee');
  f.state.finish(); f.state.updateAutomaticSpeech(Date.now());
  assert.equal(f.spoken.length, 4);
});

test('late recognition joins a role-appropriate greeting once without restarting the conversation', async () => {
  for (const role of ['guest', 'employee', 'delivery']) {
    const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
    let restarts = 0; f.state.conversation.beginReception = () => restarts++;
    const person = { id: 'known', name: '山田太郎', source: 'face', role };
    f.state.visitorRecognition.current = () => person;
    f.state.updateAutomaticSpeech(Date.now()); await new Promise(r => setImmediate(r));
    assert.equal(f.state.greetingPending, true);
    f.state.finish();
    assert.equal(f.spoken.at(-1), { guest: 'chatGuestRecipient', employee: 'chatRecognizedEmployee', delivery: 'chatRecognizedDelivery' }[role]);
    assert.equal(f.state.greetingPending, true);
    f.state.finish(); f.state.updateAutomaticSpeech(Date.now());
    assert.equal(f.state.greetingPending, false);
    assert.equal(f.spoken.length, 4); assert.equal(restarts, 0);
    assert.equal(f.state.conversation.active, true);
    if (role === 'employee') assert.equal(f.state.conversation.state.step, 'employee');
  }
});

test('late guest prompt advances the actual next response and preserves an answered recipient', async () => {
  for (const recipient of [null, '平井さん']) {
    const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
    f.state.conversation.state = { role: 'guest', purpose: '打ち合わせ', ...(recipient ? {recipient, step:'visitorName'} : {}) };
    f.state.visitorRecognition.current = () => ({id:'a',name:'山田太郎',role:'guest',source:'face'});
    f.state.updateAutomaticSpeech(Date.now()); await new Promise(r => setImmediate(r));
    // Do not change the question before the name has actually finished playing.
    assert.equal(f.state.conversation.state.visitor, undefined);
    f.state.finish();
    assert.equal(f.spoken.at(-1), recipient ? 'chatRecognizedGuest' : 'chatGuestRecipient');
    if (!recipient) {
      const result = respond('平井さん', f.state.conversation.state);
      assert.equal(result.state.visitor, '山田太郎');
      assert.equal(result.state.recipient, '平井さん');
      assert.equal(result.state.purpose, '打ち合わせ');
      assert.equal(result.key, 'chatConfirm');
    } else assert.equal(f.state.conversation.state.step, 'visitorName');
  }
});
test('a late guest companion does not replace or restart the primary reception', async () => {
  const a={id:'a',name:'山田太郎',role:'guest',source:'face'}, b={id:'b',name:'平井',role:'guest',source:'face'};
  const f=fixture(a); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
  const before=f.state.conversation.state;
  f.state.visitorRecognition.currentAll=()=>[a,b];
  f.state.updateAutomaticSpeech(Date.now()); await new Promise(r=>setImmediate(r)); f.state.finish();
  assert.equal(f.spoken.at(-1), 'chatRecognizedGuest');
  assert.equal(f.state.conversation.state, before);
});
test('late greeting stops safely for departure, a different face, interruption or audio failure', async () => {
  for (const scenario of ['departed', 'faceChanged', 'interrupted', 'nameFailed', 'followUpFailed', 'muted']) {
    const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
    const person = { id: 'known', name: '山田太郎', source: 'face', role: 'guest' };
    f.state.visitorRecognition.current = () => person;
    f.state.updateAutomaticSpeech(Date.now()); await new Promise(r => setImmediate(r));
    if (scenario === 'departed') f.state.isSensorVisitorPresent = () => false;
    if (scenario === 'faceChanged') f.state.visitorRecognition.current = () => ({ ...person, id: 'other' });
    if (scenario === 'muted') f.state.soundEnabled = false;
    if (scenario === 'interrupted') { const stale = f.state.finish; f.state.beginSensorReturn(); stale(); assert.equal(f.spoken.at(-1), 'goodbye'); continue; }
    if (scenario === 'nameFailed') f.state.fail();
    else { f.state.finish(); if (scenario === 'followUpFailed') f.state.fail(); }
    assert.equal(f.state.greetingPending, false);
    assert.equal(f.spoken.length, scenario === 'followUpFailed' ? 4 : 3);
  }
});
test('late name waits while the visitor is speaking and discards a replaced face during audio preparation', async () => {
  const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
  const identity = { id: 'a', name: '山本', source: 'face', role: 'guest' };
  f.state.visitorRecognition.current = () => identity;
  f.state.conversation.canAnnounceName = false;
  f.state.updateAutomaticSpeech(Date.now()); assert.equal(f.spoken.length, 2);
  f.state.conversation.canAnnounceName = true;
  let complete; f.state.nameLine = () => new Promise(r => { complete = r; });
  f.state.updateAutomaticSpeech(Date.now());
  f.state.visitorRecognition.current = () => ({ ...identity, id: 'b' });
  complete({ text: '山本さん。', audio: './fake.wav' }); await new Promise(r => setImmediate(r));
  assert.equal(f.spoken.length, 2); assert.equal(f.state.greetingPending, false);
});
test('a face held during the visitor turn is greeted by role once the turn becomes idle', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
    f.state.visitorRecognition.current = () => ({ id: 'known', name: '山田太郎', source: 'face', role });
    f.state.conversation.canAnnounceName = false;
    f.state.updateAutomaticSpeech(Date.now()); assert.equal(f.spoken.length, 2);
    f.state.conversation.canAnnounceName = true;
    f.state.updateAutomaticSpeech(Date.now()); await new Promise(r => setImmediate(r));
    assert.equal(f.spoken.at(-1), 'registeredName');
    f.state.finish(); assert.equal(f.spoken.at(-1), { employee: 'chatRecognizedEmployee', guest: 'chatGuestRecipient', delivery: 'chatRecognizedDelivery' }[role]);
    f.state.finish(); f.state.updateAutomaticSpeech(Date.now());
    assert.equal(f.spoken.length, 4); assert.equal(f.state.conversation.active, true);
  }
});
test('late recognition still acknowledges the role when calling the name is disabled or unavailable', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const f = fixture(); await f.state.beginSensorGreeting(); f.state.finish(); f.state.finish();
    f.state.visitorRecognition.current = () => ({ id: 'known', name: '山田太郎', source: 'face', role, nameCallingEnabled: false });
    f.state.nameLine = async () => null;
    f.state.updateAutomaticSpeech(Date.now()); await new Promise(r => setImmediate(r));
    assert.equal(f.spoken.at(-1), { employee: 'chatRecognizedEmployee', guest: 'chatGuestRecipient', delivery: 'chatRecognizedDelivery' }[role]);
    f.state.finish(); f.state.updateAutomaticSpeech(Date.now()); assert.equal(f.spoken.length, 3);
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

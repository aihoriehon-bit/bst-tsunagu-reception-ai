import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameApprovalToken, isNameApproved, createNameAudition, shouldCallName, hasNameReading } from './name-confirmation.mjs';
import vm from 'node:vm';
import { ROLES, validVector } from './visitor-matching.mjs';
import { nameLine, previewName, cancelNameVoice } from './name-voice.js';

test('optional audition history belongs to an exact name and reading', () => {
  const person = { name: '絵美太', reading: 'えみた' };
  assert.equal(isNameApproved(person), false);
  const saved = JSON.parse(JSON.stringify({ ...person, nameAudioApproval: nameApprovalToken(person) }));
  assert.equal(isNameApproved(saved), true);
  assert.equal(isNameApproved({ ...saved, reading: 'えみこ' }), false);
  assert.equal(isNameApproved({ ...saved, name: '別人' }), false);
  assert.equal(isNameApproved({ ...saved, nameAudioApproval: 'old-version' }), false);
  assert.equal(isNameApproved({ ...saved, nameAudioApproval: '' }), false);
});
test('audition gate clears when cancelled or input changes', () => {
  const a = createNameAudition(), p = { name: 'えみた' };
  assert.equal(a.canApprove(p), false);
  a.completed(p); assert.equal(a.canApprove(p), true);
  assert.equal(a.canApprove({ ...p, reading: 'えみこ' }), false);
  a.clear(); assert.equal(a.canApprove(p), false);
});
test('registration has no upload or audition gate and persists an explicit calling preference', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /identityAudio|type="file"/);
  assert.match(source, /nameAudioApproval: typeof p.nameAudioApproval/);
  assert.match(source, /if \(!completed \|\| own !== auditionId \|\| !dialog.open\) return/);
  assert.match(source, /id="identityCallName" type="checkbox" checked/);
  assert.match(source, /nameCallingEnabled: p.nameCallingEnabled !== false/);
  assert.doesNotMatch(source, /identityNameApproved/);
});
test('actual name generator calls unreviewed registered names and honors explicit OFF', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(readFileSync(new URL(String(url).includes('bank.json') ? './audio/kana/bank.json' : './audio/kana/bank.wav', import.meta.url)));
  try {
    const p = { name: '絵美太', reading: 'えみた' };
    const automatic = await nameLine(p);
    await assert.rejects(nameLine({ ...p, nameCallingEnabled: false }), /OFF/);
    const trial = await nameLine(p, { audition: true });
    assert.match(trial.audio, /^\.\/audio\/name-bank\/.*\.mp3$/); assert.equal(trial.spokenText, undefined);
    assert.equal(automatic.audio, trial.audio);
    const approved = await nameLine({ ...p, nameAudioApproval: nameApprovalToken(p) });
    assert.equal(approved.audio, trial.audio);
    const sato = { name: '佐藤' };
    assert.equal((await nameLine({ ...sato, nameAudioApproval: nameApprovalToken(sato) })).audio, './audio/nameSato.wav');
  } finally { globalThis.fetch = originalFetch; }
});
test('all face roles default to calling; missing kanji readings are distinguishable', () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    assert.equal(shouldCallName({ name: '絵美太', reading: 'えみた', role, nameAudioApproval: '' }), true);
    assert.equal(shouldCallName({ name: '絵美太', role, nameCallingEnabled: false }), false);
  }
  assert.equal(hasNameReading({ name: 'えみた' }), true);
  assert.equal(hasNameReading({ name: '絵美太', reading: 'えみた' }), true);
  assert.equal(hasNameReading({ name: '絵美太' }), false);
});
test('actual saved-data loader migrates old registrations and preserves explicit OFF on reload', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function sanitize('), source.indexOf('function save('));
  const sanitize = vm.runInNewContext('(' + code + ')', { ROLES, validVector, crypto });
  const people = ['employee', 'guest', 'delivery'].map(role => ({ id: role, name: 'えみた', role, descriptors: [Array(128).fill(.1)], nameAudioApproval: '' }));
  people.push({ ...people[0], id: 'off', nameCallingEnabled: false });
  const once = sanitize({ people }), twice = sanitize(JSON.parse(JSON.stringify(once)));
  for (const data of [once, twice]) {
    assert.ok(data.people.slice(0, 3).every(p => p.nameCallingEnabled === true));
    assert.equal(data.people[3].nameCallingEnabled, false);
  }
});
test('preview completion is true only after ended, not cancellation or failed playback', async () => {
  const originalAudio = globalThis.Audio; let player;
  globalThis.Audio = class {
    constructor() { player = this; }
    play() { return Promise.resolve(); }
    pause() {}
  };
  try {
    const completed = previewName({ name: '佐藤' });
    await new Promise(r => setImmediate(r)); player.onended();
    assert.equal(await completed, true);
    const cancelled = previewName({ name: '佐藤' });
    await new Promise(r => setImmediate(r)); cancelNameVoice();
    assert.equal(await cancelled, false);
    const early = previewName({ name: '佐藤' }); cancelNameVoice();
    assert.equal(await early, false);
    const failed = previewName({ name: '佐藤' });
    await new Promise(r => setImmediate(r)); player.onerror();
    await assert.rejects(failed, /再生できません/);
  } finally { cancelNameVoice(); globalThis.Audio = originalAudio; }
});

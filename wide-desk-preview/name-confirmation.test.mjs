import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameApprovalToken, isNameApproved, createNameAudition } from './name-confirmation.mjs';
import { nameLine, previewName, cancelNameVoice } from './name-voice.js';

test('only an explicitly approved exact name, reading and audio revision may greet by name', () => {
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
test('registration retains approval, has no upload and requires completed playback to enable opt-in', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /identityAudio|type="file"/);
  assert.match(source, /nameAudioApproval: typeof p.nameAudioApproval/);
  assert.match(source, /if \(!completed \|\| own !== auditionId \|\| !dialog.open\) return/);
  assert.match(source, /checked && audition.canApprove/);
  assert.match(source, /\['#identityName', '#identityReading'\]/);
});
test('actual name generator blocks unapproved greetings, permits auditions and approved static bank audio', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(readFileSync(new URL(String(url).includes('bank.json') ? './audio/kana/bank.json' : './audio/kana/bank.wav', import.meta.url)));
  try {
    const p = { name: '絵美太', reading: 'えみた' };
    await assert.rejects(nameLine(p), /未確認/);
    const trial = await nameLine(p, { audition: true });
    assert.match(trial.audio, /^blob:/); assert.equal(trial.spokenText, undefined);
    const approved = await nameLine({ ...p, nameAudioApproval: nameApprovalToken(p) });
    assert.equal(approved.audio, trial.audio);
    const sato = { name: '佐藤' };
    assert.equal((await nameLine({ ...sato, nameAudioApproval: nameApprovalToken(sato) })).audio, './audio/nameSato.wav');
  } finally { globalThis.fetch = originalFetch; }
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandsfree } from './handsfree.mjs';

function fixture() {
  const sessions = [], texts = [], statuses = [], jobs = new Map(); let id = 0;
  class Recognition {
    constructor() { sessions.push(this); }
    start() { this.onstart?.(); }
    abort() { this.aborted = true; this.onend?.(); }
    result(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
  }
  let listener;
  listener = createHandsfree({ Recognition, onText(text) { texts.push(text); listener.update({ speaking: true }); }, onStatus: s => statuses.push(s),
    schedule(fn, ms) { jobs.set(++id, { fn, ms }); return id; }, unschedule(id) { jobs.delete(id); } });
  const tick = ms => { const found = [...jobs].find(([, job]) => job.ms === ms); if (!found) return false; jobs.delete(found[0]); found[1].fn(); return true; };
  return { listener, sessions, texts, statuses, jobs, tick };
}
test('permission and completed greeting gate listening; replies resume automatically', () => {
  const f = fixture(); f.listener.update({ active: true, present: true }); assert.equal(f.jobs.size, 0);
  f.listener.update({ enabled: true, speaking: true }); assert.equal(f.jobs.size, 0);
  f.listener.update({ speaking: false }); f.tick(650); assert.equal(f.sessions.length, 1);
  f.sessions[0].result('担当者に会いたいです'); assert.deepEqual(f.texts, ['担当者に会いたいです']);
  assert.equal(f.sessions[0].aborted, true); assert.equal(f.jobs.size, 0);
  f.listener.update({ speaking: false }); f.tick(650); assert.equal(f.sessions.length, 2);
});
test('playback invalidates late recognition results to avoid hearing its own voice', () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true }); f.tick(650);
  const old = f.sessions[0]; f.listener.update({ speaking: true }); old.result('いらっしゃいませ'); old.onend();
  assert.deepEqual(f.texts, []); assert.equal(f.jobs.size, 0);
});
test('absence, camera stop, mute, hidden tab and disable stop the microphone', () => {
  for (const change of [{ present: false }, { active: false }, { audible: false }, { visible: false }, { enabled: false }]) {
    const f = fixture(); f.listener.update({ enabled: true, active: true, present: true }); f.tick(650);
    f.listener.update(change); f.sessions[0].result('遅れて届いた発話');
    assert.equal(f.sessions[0].aborted, true); assert.equal(f.jobs.size, 0); assert.deepEqual(f.texts, []);
  }
});
test('silence renews listening without speaking or requiring a button', () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true }); f.tick(650);
  f.sessions[0].onerror({ error: 'no-speech' }); f.sessions[0].onend(); f.tick(650);
  assert.equal(f.sessions.length, 2); assert.deepEqual(f.texts, []);
});
test('permission denial does not repeat prompts; explicit retry restores listening', () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true }); f.tick(650);
  f.sessions[0].onerror({ error: 'not-allowed' });
  f.listener.update({ present: true }); assert.equal(f.jobs.size, 0); assert.equal(f.listener.blocked, true);
  f.listener.retry(); f.tick(0); assert.equal(f.sessions.length, 2);
});
test('three service failures stop reconnecting until explicit retry', () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true }); f.tick(650);
  for (let i = 0; i < 3; i++) { f.sessions[i].onerror({ error: 'network' }); f.sessions[i].onend(); f.tick(2000); }
  assert.equal(f.listener.blocked, true); assert.equal(f.sessions.length, 3); assert.equal(f.jobs.size, 0);
});
test('turn indicator clears during speech end, silence restart and watchdog restart', () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true });
  assert.equal(f.statuses.at(-1), 'preparing');
  f.tick(650); assert.equal(f.statuses.at(-1), 'listening');
  f.sessions[0].onspeechend(); assert.equal(f.statuses.at(-1), 'processing');
  f.sessions[0].onaudioend(); assert.equal(f.statuses.at(-1), 'processing');
  f.sessions[0].onend(); assert.equal(f.statuses.at(-1), 'preparing');
  f.tick(650); assert.equal(f.statuses.at(-1), 'listening');
  f.tick(25000); assert.equal(f.statuses.at(-1), 'preparing');
  f.tick(650); assert.equal(f.statuses.at(-1), 'listening');
});

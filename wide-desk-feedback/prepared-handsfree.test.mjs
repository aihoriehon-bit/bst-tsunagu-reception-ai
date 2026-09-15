import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandsfree } from './handsfree.mjs';
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ pending = false, unsupported = false, trackAvailable = true } = {}) {
  const sessions = [], texts = [], statuses = [], jobs = new Map();
  let id = 0, open = false, releases = 0, resolve;
  const track = { kind: 'audio', readyState: 'live' };
  const input = {
    getTrack() { return pending ? new Promise(r => { resolve = r; }) : Promise.resolve(trackAvailable ? track : null); },
    setOpen(value) { open = value; }, release() { open = false; releases++; },
  };
  class Recognition {
    constructor() { sessions.push(this); }
    start(value) { this.track = value; if (unsupported && value) throw Error('unsupported'); }
    abort() { this.aborted = true; this.onend?.(); }
    result(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
  }
  const listener = createHandsfree({ Recognition, input,
    onStatus: s => statuses.push(s), onText(text) { texts.push(text); listener.update({ speaking: true }); },
    schedule(fn, ms) { jobs.set(++id, { fn, ms }); return id; }, unschedule(id) { jobs.delete(id); },
  });
  return { listener, sessions, texts, statuses, jobs, track,
    get open() { return open; }, get releases() { return releases; },
    async tick(ms = 0) { const entry = [...jobs].find(([, v]) => v.ms === ms); if (!entry) return false; jobs.delete(entry[0]); entry[1].fn(); await settle(); return true; },
    async resolve() { resolve(track); await settle(); },
  };
}
test('prepares with silent input during AI speech, opens the SAME ready session immediately at audio end', async () => {
  for (const answer of ['はい', '訂正', 'ふくださんをお願いします']) {
    const f = fixture(); f.listener.update({ enabled: true, active: true, present: true, speaking: true }); await f.tick();
    const r = f.sessions[0]; assert.equal(r.track, f.track); assert.equal(r.continuous, true);
    r.onstart(); assert.equal(f.open, false); assert.equal(f.statuses.at(-1), 'preparing');
    r.result('はい、または訂正とお答えください'); assert.deepEqual(f.texts, []);
    f.listener.update({ speaking: false });
    assert.equal(f.open, true); assert.equal(f.statuses.at(-1), 'listening');
    assert.equal(f.sessions.length, 1); assert.equal([...f.jobs.values()].some(j => j.ms < 25000), false);
    r.result(answer); assert.deepEqual(f.texts, [answer]); assert.equal(f.open, false);
    await f.tick(); assert.equal(f.sessions.length, 2);
    r.result('古い返答'); assert.deepEqual(f.texts, [answer]);
    f.listener.stop();
  }
});
test('does not advertise listening when preparation is not ready before short AI speech ends', async () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true, speaking: true }); await f.tick();
  f.listener.update({ speaking: false }); assert.equal(f.open, false); assert.notEqual(f.statuses.at(-1), 'listening');
  f.sessions[0].onstart(); assert.equal(f.open, true); assert.equal(f.statuses.at(-1), 'listening'); f.listener.stop();
});
test('new AI turn invalidates live visitor session and repeated speaking updates do not restart preparation', async () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true }); await f.tick();
  const old = f.sessions[0]; old.onstart(); assert.equal(f.open, true);
  f.listener.update({ speaking: true }); assert.equal(old.aborted, true); assert.equal(f.open, false);
  await f.tick(); const next = f.sessions[1]; next.onstart();
  f.listener.update({ speaking: true }); assert.equal(next.aborted, undefined);
  old.result('遅れて届いた返事'); old.onstart(); assert.deepEqual(f.texts, []); assert.equal(f.open, false);
  f.listener.stop();
});
test('shutdown releases input; late pending preparation never starts a recognizer', async () => {
  for (const change of [{ present: false }, { active: false }, { audible: false }, { visible: false }, { enabled: false }]) {
    const f = fixture({ pending: true }); f.listener.update({ enabled: true, active: true, present: true }); await f.tick();
    f.listener.update(change); await f.resolve();
    assert.equal(f.sessions.length, 0); assert.equal(f.open, false); assert.ok(f.releases > 0); assert.equal(f.jobs.size, 0);
  }
});
test('unsupported track start falls back to ordinary recognition only AFTER AI finishes', async () => {
  const f = fixture({ unsupported: true }); f.listener.update({ enabled: true, active: true, present: true, speaking: true }); await f.tick();
  assert.equal(f.sessions.length, 1); assert.equal(f.jobs.size, 0); assert.equal(f.open, false);
  f.listener.update({ speaking: false }); await f.tick(); assert.equal(f.sessions[1].track, undefined);
  f.sessions[1].onstart(); f.listener.update({ speaking: true }); assert.equal(f.sessions[1].aborted, true);
  assert.equal(f.jobs.size, 0); f.listener.stop();
});
test('initial permission via ordinary recognition allows a prepared attempt on the next turn', async () => {
  const f = fixture({ trackAvailable: false }); f.listener.update({ enabled: true, active: true, present: true }); await f.tick();
  f.sessions[0].onstart(); f.listener.update({ speaking: true }); await f.tick();
  assert.equal(f.sessions.length, 1); // permission still unavailable in this fixture: never open raw mic during AI
  assert.equal(f.open, false); f.listener.stop();
});
test('no-speech closes gate, retries during AI speech; permission failure releases capture without a loop', async () => {
  const f = fixture(); f.listener.update({ enabled: true, active: true, present: true, speaking: true }); await f.tick();
  f.sessions[0].onstart(); f.sessions[0].onerror({ error: 'no-speech' }); f.sessions[0].onend();
  assert.equal(f.open, false); await f.tick(100); assert.equal(f.sessions.length, 2);
  f.sessions[1].onerror({ error: 'not-allowed' });
  assert.equal(f.listener.blocked, true); assert.equal(f.open, false); assert.ok(f.releases > 0); assert.equal(f.jobs.size, 0);
});

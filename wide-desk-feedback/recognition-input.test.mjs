import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionInput, supportsPreparedInput } from './recognition-input.mjs';
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ permission = 'granted', pending = false, suspended = false, broken = false } = {}) {
  let requests = 0, closes = 0, resolve, timeout, ended;
  const rawTrack = { readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener(_, fn) { ended = fn; } };
  const outTrack = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const stream = track => ({ getTracks: () => [track], getAudioTracks: () => [track] });
  const raw = stream(rawTrack), output = { stream: stream(outTrack) }, targets = [];
  const gain = { gain: { value: 99 }, connect(node) { targets.push(node); }, disconnect() {} };
  class Context {
    state = suspended ? 'suspended' : 'running';
    createGain() { if (broken) throw Error('no gain'); return gain; }
    createMediaStreamDestination() { return output; }
    createMediaStreamSource() { return { connect(node) { targets.push(node); }, disconnect() {} }; }
    resume() { return suspended ? new Promise(() => {}) : Promise.resolve(); }
    close() { closes++; this.state = 'closed'; return Promise.resolve(); }
  }
  const input = createRecognitionInput({ permissions: { async query() { return { state: permission }; } },
    mediaDevices: { getUserMedia() { requests++; return pending ? new Promise(r => { resolve = r; }) : Promise.resolve(raw); } },
    AudioContext: Context, schedule(fn) { timeout = fn; return 1; }, unschedule() {},
  });
  return { input, gain, targets, output, raw, rawTrack, outTrack,
    get requests() { return requests; }, get closes() { return closes; },
    async resolve() { resolve(raw); await settle(); }, timeout() { timeout(); }, ended() { rawTrack.readyState = 'ended'; ended(); },
  };
}
test('only supported desktop Chrome can pass gated tracks; never rely on silently ignored arguments', () => {
  const nav = userAgent => ({ vendor: 'Google Inc.', userAgent });
  assert.equal(supportsPreparedInput(nav('Chrome/135.0')), true);
  for (const ua of ['Chrome/134.0', 'Chrome/135.0 Android', 'Chrome/140.0 Edg/140.0', 'Safari/605.1', 'CriOS/140.0']) assert.equal(supportsPreparedInput(nav(ua)), false);
  assert.equal(supportsPreparedInput({ vendor: 'Apple Computer, Inc.', userAgent: 'Chrome/140.0' }), false);
});
test('one shared stream is silent until explicitly opened, with no speaker connection', async () => {
  const f = fixture(), p = f.input.getTrack(); assert.equal(f.input.getTrack(), p);
  assert.equal(await p, f.outTrack); assert.equal(f.gain.gain.value, 0);
  assert.deepEqual(f.targets, [f.gain, f.output]); assert.equal(f.input.stream, f.raw);
  f.input.setOpen(true); assert.equal(f.gain.gain.value, 1);
  assert.equal(await f.input.getTrack(), f.outTrack); assert.equal(f.requests, 1);
  f.input.setOpen(false); assert.equal(f.gain.gain.value, 0);
  f.input.release(); assert.equal(f.rawTrack.readyState, 'ended'); assert.equal(f.outTrack.readyState, 'ended'); assert.equal(f.input.stream, null);
});
test('preparation never prompts for new permission', async () => {
  for (const permission of ['prompt', 'denied']) {
    const f = fixture({ permission }); assert.equal(await f.input.getTrack(), null); assert.equal(f.requests, 0);
  }
});
test('late microphone acquisition after cancellation is disposed without opening a gate', async () => {
  const f = fixture({ pending: true }), p = f.input.getTrack(); await settle();
  f.input.release(); await f.resolve(); assert.equal(await p, null);
  assert.equal(f.rawTrack.readyState, 'ended'); assert.equal(f.input.stream, null);
});
test('failed or suspended audio context releases microphone and permits ordinary recognition fallback', async () => {
  for (const settings of [{ broken: true }, { suspended: true }]) {
    const f = fixture(settings), p = f.input.getTrack(); await settle();
    if (settings.suspended) f.timeout();
    assert.equal(await p, null); assert.equal(f.rawTrack.readyState, 'ended'); assert.equal(f.closes, 1);
  }
});
test('unplugged microphone also ends the recognition output track and closes its gate', async () => {
  const f = fixture(); await f.input.getTrack(); f.input.setOpen(true); f.ended();
  assert.equal(f.gain.gain.value, 0); assert.equal(f.outTrack.readyState, 'ended'); assert.equal(f.input.stream, null);
});

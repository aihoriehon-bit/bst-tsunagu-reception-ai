import test from 'node:test';
import assert from 'node:assert/strict';
import { createMicLevel, microphoneLevel } from './mic-level.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ permission = 'granted', pending = false, reject = false, borrowed = false } = {}) {
  let sample = 0, requests = 0, stopped = 0, closed = 0, disconnected = 0, ready = false, level = 0, resolve;
  const callbacks = new Map(); let nextFrame = 0;
  const track = { readyState: 'live', stop() { stopped++; this.readyState = 'ended'; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const analyser = { fftSize: 0, getFloatTimeDomainData(buffer) { buffer.fill(sample); } };
  class Context {
    state = 'running';
    createAnalyser() { return analyser; }
    createMediaStreamSource() { return { connect(target) { assert.equal(target, analyser); }, disconnect() { disconnected++; } }; }
    resume() { return Promise.resolve(); }
    close() { closed++; return Promise.resolve(); }
  }
  const meter = createMicLevel({
    borrowStream: () => borrowed ? stream : null,
    onReady(value) { ready = value; }, onLevel(value) { level = value; },
    permissions: { async query() { return { state: permission }; } },
    mediaDevices: { getUserMedia() { requests++; if (reject) return Promise.reject(Error('unavailable')); return pending ? new Promise(r => { resolve = r; }) : Promise.resolve(stream); } },
    AudioContext: Context,
    requestFrame(callback) { callbacks.set(++nextFrame, callback); return nextFrame; },
    cancelFrame(id) { callbacks.delete(id); },
  });
  return { meter, track,
    async start() { meter.setListening(true); await settle(); },
    async resolve() { resolve(stream); await settle(); },
    tick(value) { sample = value; const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(callback => callback()); },
    get state() { return { requests, stopped, closed, disconnected, ready, level, frames: callbacks.size }; },
  };
}

test('amplitude ignores near-silence and increases with actual audio samples', () => {
  assert.equal(microphoneLevel([]), 0);
  assert.equal(microphoneLevel([0, 0]), 0);
  assert.equal(microphoneLevel([.005, -.005]), 0);
  assert.ok(microphoneLevel([.08, -.08]) > microphoneLevel([.02, -.02]));
  assert.equal(microphoneLevel([1, -1]), 1);
});
test('visual meter never opens a microphone permission prompt', async () => {
  for (const permission of ['prompt', 'denied']) {
    const f = fixture({ permission }); f.meter.permissionGranted(); await f.start();
    assert.equal(f.state.requests, 0); assert.equal(f.state.ready, false);
  }
});
test('listening samples audio and turning off releases every resource', async () => {
  const f = fixture(); await f.start();
  assert.equal(f.state.ready, true); assert.equal(f.state.level, 0);
  f.tick(.06); assert.ok(f.state.level > .1);
  f.meter.setListening(true); assert.equal(f.state.requests, 1);
  f.meter.setListening(false);
  assert.deepEqual(f.state, { requests: 1, stopped: 1, closed: 1, disconnected: 1, ready: false, level: 0, frames: 0 });
});
test('late microphone resolution after speaking/stopping is immediately released', async () => {
  const f = fixture({ pending: true }); await f.start();
  f.meter.stop(); await f.resolve();
  assert.equal(f.state.stopped, 1); assert.equal(f.state.ready, false); assert.equal(f.state.frames, 0);
});
test('capture failure does not endlessly retry; explicit permission resets it', async () => {
  const f = fixture({ reject: true }); await f.start();
  f.meter.setListening(false); await f.start(); assert.equal(f.state.requests, 1);
  f.meter.permissionGranted(); f.meter.setListening(false); await f.start(); assert.equal(f.state.requests, 2);
});
test('device disconnection clears light and releases analysis', async () => {
  const f = fixture(); await f.start(); f.tick(.08);
  f.track.readyState = 'ended'; f.tick(.08);
  assert.equal(f.state.level, 0); assert.equal(f.state.ready, false); assert.equal(f.state.frames, 0);
});
test('meter reuses prepared input without opening a second mic or stopping its borrowed tracks', async () => {
  const f = fixture({ borrowed: true }); await f.start(); f.tick(.08);
  assert.equal(f.state.requests, 0); assert.equal(f.state.ready, true); assert.ok(f.state.level > 0);
  f.meter.setListening(false); assert.equal(f.state.stopped, 0); assert.equal(f.state.closed, 1);
  assert.equal(f.track.readyState, 'live');
  await f.start(); f.meter.stop(); assert.equal(f.state.stopped, 0); assert.equal(f.state.requests, 0);
});

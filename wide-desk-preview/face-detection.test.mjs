import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { CAMERA_CONSTRAINTS, FACE_DETECTION_OPTIONS, detectFaces, createDetectionLoop, searchRegions, mergeDetections, faceQuality } from './face-detection.mjs';
import { matchFace } from './visitor-matching.mjs';

const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
test('camera requests higher resolution without mandatory hardware or microphone constraints', () => {
  assert.equal(CAMERA_CONSTRAINTS.video.width.ideal, 1920);
  assert.equal(CAMERA_CONSTRAINTS.video.height.ideal, 1080);
  assert.equal(CAMERA_CONSTRAINTS.video.width.exact, undefined);
  assert.equal(CAMERA_CONSTRAINTS.audio, false);
  assert.equal(FACE_DETECTION_OPTIONS.inputSize, 608);
  assert.equal(FACE_DETECTION_OPTIONS.scoreThreshold, .5);
});
test('small face boxes use original camera coordinates and multiple faces are preserved', async () => {
  const video = { readyState: 2, videoWidth: 1280, videoHeight: 960 };
  const boxes = [{ x: 900, y: 220, width: 48, height: 58 }, { x: 200, y: 350, width: 180, height: 200 }];
  const canvases = { frame: { getContext: () => ({ drawImage() {} }) }, tile: { getContext: () => ({ drawImage() {} }) } };
  let calls = 0;
  const api = {
    TinyFaceDetectorOptions: class { constructor(options) { Object.assign(this, options); } },
    async detectAllFaces(input, options) {
      assert.equal(input, calls ? canvases.tile : canvases.frame); assert.equal(options.inputSize, 608);
      return calls++ ? [] : boxes.map(box => ({ box }));
    },
  };
  const result = await detectFaces(api, video, canvases);
  assert.equal(calls, 5);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].boundingBox, { originX: 900, originY: 220, width: 48, height: 58 });
  assert.deepEqual(await detectFaces(api, { ...video, readyState: 0 }), []);
});
test('tile-only far faces are mapped back and duplicate views do not create extra people', async () => {
  const video = { readyState: 2, videoWidth: 1920, videoHeight: 1080 };
  let frameCopies = 0, tiles = 0, calls = 0;
  const canvases = { frame: { getContext: () => ({ drawImage() { frameCopies++; } }) }, tile: { getContext: () => ({ drawImage() { tiles++; } }) } };
  const api = { TinyFaceDetectorOptions: class {}, async detectAllFaces() {
    calls++;
    // Full image misses the small face; the top-right crop finds it.
    return calls === 3 ? [{ score: .9, box: { x: 200, y: 100, width: 60, height: 70 } }] : [];
  } };
  const found = await detectFaces(api, video, canvases);
  assert.equal(frameCopies, 1); assert.equal(tiles, 4);
  assert.equal(found[0].boundingBox.originX, 968);
  const shifted = { ...found[0], score: .8, boundingBox: { ...found[0].boundingBox, originX: 970 } };
  const other = { ...found[0], boundingBox: { ...found[0].boundingBox, originX: 1100 } };
  assert.equal(mergeDetections([...found, shifted, other]).length, 2);
  assert.equal(faceQuality(found, 1920, 1080).usable, true);
  assert.equal(faceQuality([{ boundingBox: { width: 30, height: 35 } }], 640, 480).usable, false);
  assert.equal(searchRegions(640, 480).length, 5);
});
function fixture(detect) {
  const queued = new Map(), updates = [], errors = []; let id = 0, ready = true;
  const loop = createDetectionLoop({ detect, ready: () => ready, update: x => updates.push(x), onError: e => errors.push(e),
    schedule(fn, ms) { assert.equal(ms, 500); queued.set(++id, fn); return id; }, cancel(id) { queued.delete(id); },
  });
  return { loop, updates, errors, queued, setReady(v) { ready = v; }, async next() {
    const [id, fn] = queued.entries().next().value; queued.delete(id); await fn();
  } };
}
test('slow detection never overlaps or queues repeated inference', async () => {
  let finish, calls = 0;
  const f = fixture(() => { calls++; return new Promise(r => { finish = r; }); });
  f.loop.start(); assert.equal(calls, 1); assert.equal(f.queued.size, 0);
  finish([{ boundingBox: {} }]); await settle();
  assert.equal(f.updates.length, 1); assert.equal(f.queued.size, 1);
  f.loop.stop(); assert.equal(f.queued.size, 0);
});
test('stop and restart discard old recognition and do not overlap unfinished inference', async () => {
  let finish, calls = 0;
  const f = fixture(() => { calls++; return new Promise(r => { finish = r; }); });
  f.loop.start(); f.loop.stop(); f.loop.start(); assert.equal(calls, 1);
  finish(['stale']); await settle(); assert.equal(f.updates.length, 0);
  const next = f.next(); finish(['current']); await next;
  assert.deepEqual(f.updates, [['current']]); f.loop.stop();
});
test('camera loss discards pending result, and detector failure clears presence then permits recovery', async () => {
  let finish;
  const f = fixture(() => new Promise(r => { finish = r; }));
  f.loop.start(); f.setReady(false); finish(['stale']); await settle();
  assert.deepEqual(f.updates, []); f.loop.stop();
  let fail = true;
  const g = fixture(async () => { if (fail) throw Error('detector unavailable'); return ['face']; });
  g.loop.start(); await settle(); assert.deepEqual(g.updates, [[]]); assert.equal(g.errors.length, 1);
  fail = false; await g.next(); assert.deepEqual(g.updates, [[], ['face']]); g.loop.stop();
});
test('better small-face detection does not relax unknown or ambiguous identity rejection', () => {
  const v = x => [x, ...Array(127).fill(0)];
  const p = { id: 'a', role: 'employee', name: '登録者', descriptors: [v(0)] };
  assert.equal(matchFace(v(.46), [p]), null);
  assert.equal(matchFace(v(.1), [p, { ...p, id: 'b', descriptors: [v(.21)] }]), null);
  assert.equal(matchFace(v(.2), [p])?.id, 'a');
});

function cameraFixture() {
  let finish, reject, trackStopped = false, starts = 0;
  const stream = { getTracks: () => [{ stop() { trackStopped = true; } }] };
  const state = { CAMERA_CONSTRAINTS, cameraStream: null,
    navigator: { mediaDevices: { async getUserMedia(options) { assert.equal(options, CAMERA_CONSTRAINTS); return stream; } } },
    cameraStatusElement: {}, cameraToggleElement: {}, cameraPreviewElement: { async play() {} },
    visitorRecognition: { prepareDetection: () => new Promise((yes, no) => { finish = yes; reject = no; }) },
    startDetectionLoop() { starts++; },
    stopCamera() { state.cameraStream?.getTracks().forEach(t => t.stop()); state.cameraStream = null; },
    console: { warn() {} },
  };
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  vm.createContext(state);
  vm.runInContext(source.slice(source.indexOf('async function startCamera()'), source.indexOf('function stopCamera(')), state);
  return { state, complete: () => finish(), fail: () => reject(Error('models unavailable')), stopped: () => trackStopped, starts: () => starts };
}
test('actual camera startup cannot restart detection after camera was stopped during model loading', async () => {
  const f = cameraFixture(), pending = f.state.startCamera(); await settle();
  f.state.stopCamera(); f.complete(); await pending;
  assert.equal(f.starts(), 0); assert.equal(f.stopped(), true);
});
test('actual camera startup releases the camera on model error and allows retry', async () => {
  const f = cameraFixture(), pending = f.state.startCamera(); await settle();
  f.fail(); await pending;
  assert.equal(f.stopped(), true); assert.equal(f.state.cameraStream, null);
  assert.match(f.state.cameraStatusElement.textContent, /再試行/);
  const retry = f.state.startCamera(); await settle(); f.complete(); await retry;
  assert.equal(f.starts(), 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createBodyConfirmation, personBoxes } from './person-presence.mjs';
import { faceQuality } from './face-detection.mjs';

test('only confident person detections count, not chairs, noise or malformed boxes', () => {
  const box = { originX: 200, originY: 20, width: 120, height: 300 };
  const detection = (name, score, boundingBox = box) => ({ categories: [{ categoryName: name, score }], boundingBox });
  const result = { detections: [detection('person', .85), detection('chair', .99), detection('person', .4), detection('person', .9, { ...box, width: NaN }), detection('person', .8, { ...box, height: 10 })] };
  assert.deepEqual(personBoxes(result, 640, 360), [box]);
});
test('body-only presence requires three separate positive frames, and resets on departure/gaps', () => {
  const gate = createBodyConfirmation();
  assert.equal(gate.update(1, 1000), 0); assert.equal(gate.update(1, 1500), 0);
  assert.equal(gate.update(1, 2000), 1); assert.equal(gate.update(2, 2500), 2);
  assert.equal(gate.update(0, 3000), 0); assert.equal(gate.update(1, 3500), 0);
  gate.update(1, 4000); assert.equal(gate.update(1, 7000), 0);
  gate.reset(); assert.equal(gate.update(1, 7500), 0);
});
test('actual identity gate rejects body-only, tiny faces, stale frames and a second body', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  const start = source.indexOf('function singleFace()'), end = source.indexOf('function snapshot(', start);
  const state = { faceQuality, peopleCount: 1, faces: [], facesAt: Date.now(), video: { readyState: 2, videoWidth: 1920, videoHeight: 1080 } };
  vm.createContext(state); vm.runInContext(source.slice(start, end), state);
  assert.equal(state.singleFace(), false);
  state.faces = [{ boundingBox: { width: 30, height: 35 } }]; assert.equal(state.singleFace(), false);
  state.faces = [{ boundingBox: { width: 80, height: 90 } }]; assert.equal(state.singleFace(), true);
  state.peopleCount = 2; assert.equal(state.singleFace(), false);
  state.peopleCount = 1; state.facesAt = Date.now() - 2000; assert.equal(state.singleFace(), false);
});

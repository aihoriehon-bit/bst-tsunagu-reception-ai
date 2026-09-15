import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraRegion, frameLifetime } from './camera-region.mjs';
import { detectFaces } from './face-detection.mjs';
test('region selection keeps coordinates inside the original camera image', () => {
  assert.deepEqual(cameraRegion(1920, 1080, 'center50'), { x: 480, y: 0, width: 960, height: 1080 });
  assert.equal(cameraRegion(1920, 1080, 'right').x, 960);
  assert.equal(cameraRegion(1920, 1080, 'bad').width, 1920);
});
test('slow completed frames remain usable with a bounded expiration', () => {
  assert.equal(frameLifetime(250), 1800); assert.equal(frameLifetime(2200), 3700); assert.equal(frameLifetime(9000), 6000);
});
test('a selected region maps detections back to the original frame', async () => {
  const frame = { getContext: () => ({ drawImage() {} }) }, tile = { getContext: () => ({ drawImage() {} }) };
  let calls = 0;
  const api = { TinyFaceDetectorOptions: class {}, async detectAllFaces() { return calls++ ? [] : [{ score: .9, box: { x: 100, y: 90, width: 60, height: 65 } }]; } };
  const found = await detectFaces(api, { readyState: 2, videoWidth: 1920, videoHeight: 1080 }, { frame, tile }, cameraRegion(1920, 1080, 'center50'));
  assert.equal(found[0].boundingBox.originX, 580); assert.equal(calls, 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFace, matchClothing, clothingSignature, greetingForIdentity } from './visitor-matching.mjs';

const face = x => Array(128).fill(x);
const sato = { id: 'sato', name: '佐藤', role: 'employee', descriptors: [face(0.1)] };
const guest = { id: 'guest', name: 'お得意様', role: 'guest', descriptors: [face(0.2)] };
test('an enrolled employee is selected only within the face threshold', () => {
  assert.equal(matchFace(face(0.101), [sato, guest])?.id, 'sato');
  assert.equal(matchFace(face(0.5), [sato, guest]), null);
  assert.equal(matchFace(face(0.101), []), null);
});
test('a near tie between two people is never named', () => {
  assert.equal(matchFace(face(0.102), [sato, { ...guest, descriptors: [face(0.105)] }]), null);
});
test('malformed descriptors cannot match', () => {
  assert.equal(matchFace([0.1], [sato]), null);
  assert.equal(matchFace(face(NaN), [sato]), null);
  assert.equal(matchFace(face(0.1), [{ ...sato, descriptors: [[0.1]] }]), null);
});
test('face registration distinguishes employee, guest and delivery roles', () => {
  assert.equal(matchFace(face(0.2), [sato, guest])?.role, 'guest');
  assert.equal(matchFace(face(0.3), [{ ...guest, role: 'delivery', descriptors: [face(0.3)] }])?.role, 'delivery');
});
test('regular and delivery greetings never default to Sato', () => {
  const key = 'greetingDayArrival';
  assert.equal(greetingForIdentity(null, key), key);
  assert.equal(greetingForIdentity({ ...guest, source: 'face' }, key), 'visitor');
  assert.equal(greetingForIdentity({ ...sato, name: '鈴木', source: 'face' }, key), 'visitor');
  assert.equal(greetingForIdentity({ ...sato, source: 'face' }, key), 'employeeSato');
  assert.equal(greetingForIdentity({ ...sato, source: 'clothing' }, key), 'calling');
  assert.equal(greetingForIdentity({ ...sato, role: 'delivery', source: 'face' }, key), 'calling');
});
test('clothing is a tentative delivery match, with gray tops rejected', () => {
  const green = clothingSignature([0, 150, 50, 255, 0, 150, 50, 255]);
  const gray = clothingSignature([130, 130, 130, 255]);
  const uniforms = [{ id: 'green', name: '制服', signatures: [green] }];
  assert.equal(matchClothing(green, uniforms)?.source, 'clothing');
  assert.equal(matchClothing(gray, [{ id: 'gray', signatures: [gray] }]), null);
  assert.equal(matchClothing(green, [...uniforms, { id: 'similar', signatures: [green] }]), null);
  assert.equal(matchClothing(null, uniforms), null);
});

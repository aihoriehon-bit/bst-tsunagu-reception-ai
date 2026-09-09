import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchFace, receptionPlan, matchClothing } from './visitor-matching.mjs';
import { respond } from './dialogue.mjs';

const vector = (x = 0) => [x, ...Array(127).fill(0)];
test('centroid recovers noisy enrollment while unknown and ambiguous faces stay unnamed', () => {
  const person = { id: 'a', name: '山本', role: 'employee', descriptors: [vector(-.46), vector(.46)] };
  assert.equal(matchFace(vector(), [person])?.id, 'a');
  assert.equal(matchFace(vector(1.1), [person]), null);
  const other = { id: 'b', name: '鈴木', role: 'guest', descriptors: [vector(.01)] };
  assert.equal(matchFace(vector(), [person, other]), null);
  assert.equal(matchFace([NaN], [person]), null);
});
test('names are only spoken for identified faces, never inferred from uniforms or demos', () => {
  assert.deepEqual(receptionPlan({ id: 'a', name: '山本', role: 'employee', source: 'face' }, 'greetingDayArrival').greeting, ['registeredName', 'employeeGeneric']);
  assert.deepEqual(receptionPlan({ name: 'ヤマト', role: 'delivery', source: 'clothing' }, 'greetingDayArrival').greeting, ['calling']);
  assert.deepEqual(receptionPlan(null, 'greetingDayArrival', 'employeeSato').greeting, ['employeeSato']);
});
test('conversation follows appointment yes/no and delivery without claiming an actual call', () => {
  const first = respond('田中さんに会いたいです'); assert.equal(first.key, 'chatAppointment');
  const yes = respond('はい、あります', first.state); assert.equal(yes.key, 'chatWho');
  assert.equal(respond('山本です。田中さんです', yes.state).key, 'chatReceived');
  const no = respond('予約はありません', first.state); assert.equal(no.key, 'chatPurpose');
  assert.equal(respond('設備の相談です', no.state).key, 'chatReceived');
  const delivery = respond('荷物を届けに来ました'); assert.equal(delivery.key, 'chatDelivery');
  assert.equal(respond('福田さんです', delivery.state).key, 'chatReceived');
  const lines = JSON.parse(readFileSync(new URL('./dialogue-lines.json', import.meta.url)));
  assert.match(lines.chatReceived, /デモ/);
  assert.doesNotMatch(lines.chatReceived, /呼び出しました|送信しました/);
});
test('a visitor can answer the camera introduction with their name', () => {
  for (const text of ['山本です', '鈴木と申します。', '名前はやまもとです']) assert.equal(respond(text).key, 'chatPurpose');
  assert.equal(respond('明日の天気は？').key, 'chatUnknown');
});
test('small talk, employees, unknown questions, and reset use appropriate responses', () => {
  for (const [input, key] of [['ただいま', 'chatEmployee'], ['ありがとう', 'chatThanks'], ['どんな会社ですか', 'chatCompany'], ['あなたは誰ですか', 'chatIdentity'], ['明日の天気は？', 'chatUnknown'], ['最初から', 'chatHello']]) {
    assert.equal(respond(input, { step: 'appointment' }).key, key);
  }
});

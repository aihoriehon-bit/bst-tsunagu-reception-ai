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
test('conversation collects recipient and visitor separately and confirms before completion', () => {
  const first = respond('打ち合わせに来ました'); assert.equal(first.key, 'chatRecipient');
  const recipient = respond('山田太郎さんをお願いします', first.state); assert.equal(recipient.key, 'chatVisitorName');
  assert.equal(recipient.state.recipient, '山田太郎さん');
  const named = respond('鈴木と申します', recipient.state); assert.equal(named.key, 'chatConfirm');
  assert.equal(named.state.visitor, '鈴木');
  assert.equal(respond('はい', named.state).key, 'chatReceived');
  const delivery = respond('荷物を届けに来ました'); assert.equal(delivery.key, 'chatDelivery');
  const general = respond('誰でもいいです', delivery.state); assert.equal(general.key, 'chatGeneral');
  const confirmed = respond('山田太郎です', general.state);
  assert.equal(respond('はい', confirmed.state).key, 'chatGeneralComplete');
  const correction = respond('訂正', confirmed.state);
  const field = respond('担当者', correction.state);
  const corrected = respond('平井さん', field.state);
  assert.equal(corrected.state.visitor, '山田太郎'); assert.equal(corrected.state.recipient, '平井さん');
  assert.equal(corrected.key, 'chatConfirm');
  const lines = JSON.parse(readFileSync(new URL('./dialogue-lines.json', import.meta.url)));
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

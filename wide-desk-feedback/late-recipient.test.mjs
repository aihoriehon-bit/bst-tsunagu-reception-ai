import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeLateGuest, respond } from './dialogue.mjs';
const guest = { source: 'face', role: 'guest', name: '山田太郎' };

test('late recognition asks recipient and the next answer is not mistaken for the visitor name', () => {
  const result = recognizeLateGuest({ role: 'guest' }, guest);
  assert.equal(result.key, 'chatGuestRecipient');
  const next = respond('平井さん', result.state);
  assert.equal(next.state.recipient, '平井さん');
  assert.equal(next.state.visitor, '山田太郎');
  assert.equal(next.key, 'chatPurpose');
});
test('previously answered name and purpose survive recognition, and anyone leads to confirmation', () => {
  const result = recognizeLateGuest({ visitor: '山田', purpose: '打ち合わせ', step: 'recipient' }, guest);
  const next = respond('誰でもいいです', result.state);
  assert.equal(next.state.recipient, '総務担当者');
  assert.equal(next.state.visitor, '山田');
  assert.equal(next.state.purpose, '打ち合わせ');
  assert.equal(next.key, 'chatGeneralConfirm');
});
test('answered recipient, corrections, completed flows and other roles are not restarted', () => {
  for (const state of [{ recipient: '平井さん', step: 'visitorName' }, ...['confirm','correction','done','cancelled','finished'].map(step => ({ step })), {role:'employee'}, {role:'delivery'}]) {
    const copy = { ...state };
    assert.equal(recognizeLateGuest(state, guest), null);
    assert.deepEqual(state, copy);
  }
  assert.equal(recognizeLateGuest({}, { ...guest, source: 'clothing' }), null);
  assert.equal(recognizeLateGuest({}, { ...guest, role: 'employee' }), null);
});

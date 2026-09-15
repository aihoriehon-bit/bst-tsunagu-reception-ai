import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationCue } from './conversation-cue.mjs';
const ready = { speaking: false, enabled: true, supported: true, audible: true, active: true, present: true, visible: true, micStatus: 'listening' };
test('large listening cue only appears when recognition has actually started', () => {
  assert.equal(conversationCue(ready).mode, 'listening');
  assert.match(conversationCue(ready).title, /どうぞ、お話しください/);
  for (const micStatus of ['preparing', 'waiting', 'processing']) assert.notEqual(conversationCue({ ...ready, micStatus }).mode, 'listening');
});
test('greetings and replies show the character turn even before reception is active', () => {
  for (const active of [true, false]) {
    const cue = conversationCue({ ...ready, active, speaking: true });
    assert.equal(cue.mode, 'speaking'); assert.match(cue.detail, /聞き取りを止めています/);
  }
});
test('mute, absence, permission, unsupported, hidden and playback errors never invite speech', () => {
  for (const change of [{ enabled: false }, { supported: false }, { audible: false }, { active: false }, { present: false }, { visible: false }, { micStatus: 'network' }, { micStatus: 'permission' }, { micStatus: 'unavailable' }, { issue: '再生できません' }]) {
    assert.notEqual(conversationCue({ ...ready, ...change }).mode, 'listening');
  }
});

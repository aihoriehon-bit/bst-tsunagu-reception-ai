import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from './dialogue.mjs';

const phrases = ['呼んでほしい', 'よんでほしい', '呼んで欲しいです', '呼んでほしいんですけど', '呼んでほしいのですが', '呼んでほしいんだけど', '呼んでもらいたいです', '呼んでもらっていいですか', '呼んでもらってもいいですか？', '呼んで', '呼んでもらえませんか', '担当者を呼んでほしい'];
test('short call requests from anonymous arrivals ask whom to call, without inventing a purpose', () => {
  for (const text of phrases) for (const previous of [{}, { role: 'guest' }, { step: 'visitorName' }, { step: 'purpose', visitor: '山田太郎' }]) {
    const r = respond(text, previous);
    assert.equal(r.key, 'chatRecipient', text); assert.equal(r.state.step, 'recipient');
    assert.equal(r.state.visitor, previous.visitor); assert.equal(r.state.purpose, undefined);
    const named = respond('平井さん', r.state); assert.equal(named.state.recipient, '平井さん');
    assert.equal(named.key, previous.visitor ? 'chatPurpose' : 'chatVisitorName');
  }
});
test('requests retain known details and never become names, purposes or confirmation consent', () => {
  for (const text of phrases) {
    let r = respond(text, { step: 'visitorName', recipient: '平井さん', purpose: '打ち合わせ' });
    assert.equal(r.key, 'chatVisitorName'); assert.equal(r.state.visitor, undefined); assert.equal(r.state.purpose, '打ち合わせ');
    r = respond(text, { step: 'purpose', recipient: '平井さん', visitor: '山田太郎' });
    assert.equal(r.key, 'chatPurpose'); assert.equal(r.state.purpose, undefined);
    r = respond(text, { step: 'confirm', recipient: '平井さん', visitor: '山田太郎', purpose: '打ち合わせ' });
    assert.equal(r.key, 'chatConfirm'); assert.equal(r.state.step, 'confirm');
  }
});
test('employee and delivery requests retain their own intake flow', () => {
  for (const text of phrases) {
    const staff = respond(text, { role: 'employee', step: 'employee', visitor: '山田太郎' });
    assert.equal(staff.key, 'chatRecipient'); assert.equal(staff.state.employeeRequest, true);
    const parcel = respond(text, { role: 'delivery', step: 'delivery', purpose: '荷物のお届け' });
    assert.equal(parcel.key, 'chatDelivery'); assert.equal(parcel.state.recipient, undefined);
  }
  assert.equal(respond('平井さんを呼んでほしい', { step: 'visitorName' }).state.recipient, '平井さん');
  assert.equal(respond('誰でもいいので呼んでほしい').state.recipient, '総務担当者');
});
test('negative requests, previous-call questions and corrections are not new call intents', () => {
  for (const text of ['呼んでほしいわけではないです', '呼ばなくていいです', '呼ばないでください', '呼んでほしくないです']) {
    const r = respond(text); assert.notEqual(r.key, 'chatRecipient', text); assert.equal(r.state.recipient, undefined);
  }
  assert.equal(respond('呼んでくれましたか').key, 'chatCallStatus');
  assert.equal(respond('呼んでほしい', { step: 'correction', recipient: '平井さん' }).key, 'chatCorrection');
  assert.equal(respond('呼んでほしい', { step: 'done' }).state.step, 'done');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { respond, isDeliveryArrival, recognizeLateGuest } from './dialogue.mjs';

test('delivery overrides the expected answer without becoming a recipient or visitor name', () => {
  for (const step of [undefined,'recipient','visitorName','purpose','confirm','correction']) {
    for (const text of ['荷物を届けに来ました','荷物を届けに来た','配達です','配送で来ました','宅配です','ヤマト運輸です','佐川急便です','書類を届けに来ました']) {
      const result = respond(text, {step,visitor:'山田太郎',recipient:'平井さん',purpose:'相談'});
      assert.equal(result.key,'chatDelivery',text);
      assert.equal(result.state.step,'delivery');
      assert.equal(result.state.visitor,'山田太郎');
      assert.equal(result.state.recipient,undefined);
      assert.equal(result.state.purpose,'荷物のお届け');
      assert.equal(recognizeLateGuest(result.state,{name:'平井',source:'face',role:'guest'}),null);
    }
  }
  assert.equal(respond('荷物を届けに来ました',{step:'visitorName'}).state.visitor,undefined);
});
test('mentioning parcels or a carrier is not sufficient to classify a delivery arrival', () => {
  for (const text of ['荷物が届かないので相談です','配達について相談です','配達ではありません','ヤマトさんをお願いします','荷物の件で打ち合わせに来ました','再配達の相談です']) {
    assert.equal(isDeliveryArrival(text),false,text);
  }
});
test('delivery collects an addressee, confirms it and announces the call as a demo', () => {
  const state = respond('配達です').state;
  for (const text of ['はい','もう一度お願いします']) {
    const result=respond(text,state);
    assert.equal(result.key,'chatDelivery'); assert.equal(result.state.recipient,undefined);
  }
  for (const text of ['平井さん','平井さん宛てです','平井さん宛です','宛先は平井さんです','平井さんを呼んで']) {
    const r=respond(text,state); assert.equal(r.key,'chatDeliveryConfirm');assert.equal(r.state.recipient,'平井さん',text);
    assert.equal(r.state.visitor,undefined);
    assert.equal(respond('もう一度',r.state).key,'chatDeliveryConfirm');
    const yes=respond('はい',r.state);assert.equal(yes.key,'chatDeliveryCall');assert.equal(yes.state.step,'done');
    const correction=respond('訂正',r.state);assert.equal(correction.key,'chatDelivery');assert.equal(correction.state.recipient,undefined);
    assert.equal(respond('福田さん宛てです',correction.state).state.recipient,'福田さん');
  }
  for(const text of ['誰でもいいです','分かりません','宛先が不明です']) assert.equal(respond(text,state).state.recipient,'総務担当者');
  const combined=respond('平井さん宛ての荷物を届けに来ました');
  assert.equal(combined.key,'chatDeliveryConfirm');assert.equal(combined.state.recipient,'平井さん');
  assert.equal(respond('キャンセル',state).key,'chatCancel');
  assert.equal(respond('最初から',state).key,'chatHello');
  const lines=JSON.parse(readFileSync(new URL('./dialogue-lines.json',import.meta.url)));
  assert.match(lines.chatDelivery,/どなた宛て/);
  assert.doesNotMatch(lines.chatDelivery,/直接お渡し/);
  assert.match(lines.chatDeliveryCall,/お呼びします/);assert.match(lines.chatDeliveryCall,/実際の呼び出しは行っていません/);
});

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
test('handover does not turn yes or anyone into a staff call', () => {
  const state = respond('配達です').state;
  for (const text of ['はい','誰でもいいです','もう一度お願いします']) {
    const result=respond(text,state);
    assert.equal(result.key,'chatDelivery'); assert.equal(result.state.recipient,undefined);
  }
  assert.equal(respond('キャンセル',state).key,'chatCancel');
  assert.equal(respond('最初から',state).key,'chatHello');
  const lines=JSON.parse(readFileSync(new URL('./dialogue-lines.json',import.meta.url)));
  assert.match(lines.chatDelivery,/受付スタッフ/);
  assert.doesNotMatch(lines.chatDelivery,/担当者|教えて|誰でも|お呼び|呼び出/);
});

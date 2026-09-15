import test from 'node:test';
import assert from 'node:assert/strict';
import { respond, initialReceptionState } from './dialogue.mjs';

test('registered guest answers recipient then a brief purpose before confirmation', () => {
  const start = initialReceptionState('guest', {role:'guest',source:'face',name:'山田太郎'});
  const who = respond('平井さんをお願いします',start);
  assert.equal(who.key,'chatPurpose');
  const what = respond('打ち合わせに来ました',who.state);
  assert.equal(what.key,'chatConfirm');
  assert.deepEqual(what.state,{role:'guest',visitor:'山田太郎',recipient:'平井さん',purpose:'打ち合わせに来ました',step:'confirm'});
  assert.equal(respond('はい',what.state).key,'chatReceived');
});
test('unknown guests and general affairs also collect a purpose without repeating earlier answers', () => {
  const who=respond('誰でもいいです',{step:'recipient'});
  const name=respond('山田太郎です',who.state);
  assert.equal(name.key,'chatPurpose');
  const what=respond('書類を渡しに来ました',name.state);
  assert.equal(what.key,'chatConfirm');
  assert.equal(respond('はい',what.state).key,'chatGeneralComplete');
  const early=respond('修理の相談です');
  const recipient=respond('平井さん',early.state);
  assert.equal(respond('山田太郎です',recipient.state).key,'chatConfirm');
});
test('delivery starts with a handover guide, not a recipient question', () => {
  const start=initialReceptionState('delivery',null);
  assert.equal(start.step,'delivery');
  const again=respond('もう一度お願いします',start);
  assert.equal(again.key,'chatDelivery'); assert.equal(again.state.recipient,undefined);
  assert.equal(again.state.purpose,'荷物のお届け');
});
test('purpose corrections preserve name and recipient, then return to confirmation', () => {
  const state={step:'confirm',visitor:'山田太郎',recipient:'平井さん',purpose:'相談'};
  for(const selection of [respond('用件を訂正します',state),respond('用件',respond('訂正',state).state)]) {
    assert.equal(selection.key,'chatPurpose');assert.equal(selection.state.purpose,undefined);
    const corrected=respond('修理の相談です',selection.state);
    assert.equal(corrected.key,'chatConfirm');assert.equal(corrected.state.visitor,state.visitor);
    assert.equal(corrected.state.recipient,state.recipient);assert.equal(corrected.state.purpose,'修理の相談です');
  }
});
test('bare yes does not become the purpose or finish an incomplete reception', () => {
  const state={step:'purpose',visitor:'山田太郎',recipient:'平井さん'};
  assert.equal(respond('はい',state).key,'chatPurpose');
  assert.equal(respond('はい',{...state,step:'confirm'}).key,'chatPurpose');
  assert.equal(respond('もう一度お願いします',state).key,'chatPurpose');
});

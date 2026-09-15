import test from 'node:test';
import assert from 'node:assert/strict';
import { initialReceptionState, respond, recognizeLateEmployee } from './dialogue.mjs';
import { readFileSync } from 'node:fs';
const employee={id:'staff',name:'山田太郎',role:'employee',source:'face'};

test('staff recognition and spoken staff arrivals end at the greeting',()=>{
  const state=initialReceptionState('employee',employee);
  assert.equal(state.step,'employee'); assert.equal(state.visitor,'山田太郎');
  for(const input of ['お疲れさまです','はい','打ち合わせです','誰でもいいです','会社で打ち合わせです','平井さん','呼ばなくていいです']) {
    const r=respond(input,state);
    assert.equal(r.state.step,'employee',input);assert.equal(r.state.recipient,undefined);
    assert.ok(!['chatRecipient','chatGuestRecipient','chatGeneral','chatPurpose','chatVisitorName'].includes(r.key));
  }
  for(const step of [undefined,'recipient','visitorName','purpose']) {
    const r=respond('社員です',{step});assert.equal(r.key,'chatEmployee');assert.equal(r.state.step,'employee');
  }
});
test('staff may explicitly request a named or unspecified colleague',()=>{
  const state=initialReceptionState('employee',employee);
  for(const text of ['平井さんを呼んでください','平井さんをお願いします','平井さんに会いたいです']) {
    const r=respond(text,state);assert.equal(r.state.recipient,'平井さん',text);
    assert.equal(r.state.employeeRequest,true); assert.equal(r.state.visitor,'山田太郎');
    assert.equal(r.key,'chatPurpose');
    assert.equal(respond('打ち合わせです',r.state).key,'chatConfirm');
  }
  const request=respond('担当者を呼んでください',state);
  assert.equal(request.key,'chatRecipient');
  const recipient=respond('平井さん',request.state);
  assert.equal(recipient.state.recipient,'平井さん');assert.equal(recipient.key,'chatPurpose');
  assert.equal(respond('誰でもいいので呼んでください',state).state.recipient,'総務担当者');
});
test('late staff recognition replaces anonymous questions but retains explicit ongoing requests',()=>{
  for(const step of [undefined,'recipient','visitorName','purpose']) {
    const r=recognizeLateEmployee({step},employee);
    assert.equal(r.key,'chatRecognizedEmployee'); assert.equal(r.state.step,'employee');
    assert.equal(r.state.visitor,'山田太郎');
  }
  const ongoing={step:'purpose',recipient:'平井さん',visitor:'山田'};
  const r=recognizeLateEmployee(ongoing,employee);
  assert.equal(r.state.step,'purpose');assert.equal(r.state.visitor,'山田');assert.equal(r.state.employeeRequest,true);
  for(const state of [{role:'delivery'},...['confirm','correction','done','cancelled'].map(step=>({step}))]) assert.equal(recognizeLateEmployee(state,employee),null);
});
test('staff can still ask general questions or announce a delivery',()=>{
  const state=initialReceptionState('employee',employee);
  assert.equal(respond('トイレはどこですか',state).key,'chatFacility');
  assert.equal(respond('ありがとう',state).key,'chatThanks');
  assert.equal(respond('もう一度お願いします',state).key,'chatRecognizedEmployee');
  assert.equal(respond('荷物を届けに来ました',state).key,'chatDelivery');
  const lines=JSON.parse(readFileSync(new URL('./dialogue-lines.json',import.meta.url)));
  assert.equal(lines.chatEmployee,'お疲れさまです。');
  assert.deepEqual(readFileSync(new URL('./audio/chatEmployee.wav',import.meta.url)),readFileSync(new URL('./audio/chatRecognizedEmployee.wav',import.meta.url)));
});

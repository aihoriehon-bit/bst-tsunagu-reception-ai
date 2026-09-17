import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {respond,initialReceptionState,recognizeLateVisitor,spokenNumber,choicesFor,receptionPlan,GUIDED_TEXTS} from './guided-dialogue.mjs';
const run=(inputs,state=initialReceptionState('guest'))=>inputs.reduce((s,text)=>respond(text,s).state,state);
test('appointment can be completed through numbers, names and final confirmation',()=>{
  const s=run(['1番','1','やまだたろうさん','ふくだです','2','はい']);
  assert.equal(s.step,'done');assert.equal(s.recipient,'やまだたろうさん');assert.equal(s.visitor,'ふくだ');assert.equal(s.purpose,'ご相談');
});
test('delivery asks type and addressee without asking the courier for a visitor purpose',()=>{
  const s=run(['二番です','2','1','やまだたろうです']);
  assert.equal(s.step,'confirm');assert.equal(s.role,'delivery');assert.equal(s.purpose,'商品の納品');assert.equal(s.visitor,undefined);
  assert.equal(respond('はい',s).key,'chatDeliveryCall');
});
test('walk in can select purpose and general affairs',()=>{
  const s=run(['3','3']);const result=respond('2',s);
  assert.equal(result.prefix,'guideGeneral');assert.equal(result.state.step,'visitorName');
  assert.equal(run(['やまだたろう','はい'],result.state).step,'done');
});
test('recognized guest name comes before numbered guide and is not asked again',()=>{
  const person={source:'face',role:'guest',name:'山田太郎',id:'x'};
  assert.deepEqual(receptionPlan(person,'greetingDayArrival').greeting,['registeredName','chatRecognizedGuest','guideRoute']);
  const s=run(['1','2'],initialReceptionState('guest',person));assert.equal(s.step,'purposeChoice');assert.equal(s.visitor,'山田太郎');
});
test('known delivery also chooses reason; employee is not automatically treated as customer',()=>{
  assert.equal(initialReceptionState('delivery',{source:'face',name:'山田'}).step,'route');
  assert.equal(initialReceptionState('employee').step,'employee');
  assert.equal(respond('1',initialReceptionState('employee')).state.step,'route');
  assert.equal(respond('2',initialReceptionState('employee')).key,'chatNoPurpose');
});
test('ambiguous or out of range numbers never advance or become a name',()=>{
  for(const t of ['1か2','12','4','はい','えーっと','呼んでほしい'])assert.equal(respond(t,initialReceptionState('guest')).state.step,'route');
  for(const t of ['1','2','3','4','はい','ありがとう','呼んでほしい'])assert.equal(respond(t,{step:'recipient',category:'appointment'}).state.recipient,undefined);
  for(const t of ['１番','一番です','いちばん','1でお願いします'])assert.equal(spokenNumber(t),1);
});
test('back restores values before previous answer, repeat does not move, category reset clears stale data',()=>{
  const s=run(['1','1','やまだたろう']);const b=respond('戻る',s).state;
  assert.equal(b.step,'recipient');assert.equal(b.recipient,undefined);
  assert.equal(respond('もう一度',b).state.step,'recipient');
  const changed=run(['最初から','2'],s);assert.equal(changed.recipient,undefined);assert.equal(changed.purpose,undefined);
});
test('correction of recipient clears old reading and preserves the rest',()=>{
  const state={...run(['1','1','やまだたろう','ふくだ','1']),recipientReading:'やまだたろう',recipientReadingFor:'やまだたろう'};
  const corrected=run(['訂正','2','1','ひらい'],state);
  assert.equal(corrected.step,'confirm');assert.equal(corrected.visitor,'ふくだ');assert.equal(corrected.recipient,'ひらい');assert.equal(corrected.recipientReading,undefined);
});
test('delivery correction has correct numbering and no courier name requirement',()=>{
  const s=run(['2','1','2','訂正','3','2']);
  assert.equal(s.step,'confirm');assert.equal(s.purpose,'商品の納品');assert.equal(s.recipient,'総務担当者');
});
test('late recognition fills missing name without discarding route or explicit name',()=>{
  const p={source:'face',role:'guest',name:'まっきぃ'};
  let r=recognizeLateVisitor({role:'guest',category:'appointment',step:'visitorName',recipient:'総務担当者'},p);
  assert.equal(r.state.step,'purposeChoice');assert.equal(r.state.visitor,'まっきぃ');
  r=recognizeLateVisitor({step:'purposeChoice',category:'walkIn',visitor:'ふくだ'},p);
  assert.equal(r.state.visitor,'ふくだ');assert.equal(r.state.category,'walkIn');
  assert.equal(recognizeLateVisitor({step:'confirm'},p),null);
});
test('all selection prompts and option values are defined',()=>{
  for(const role of ['guest','delivery','employee'])for(const step of ['route','employee','deliveryType','recipientChoice','recipient','visitorName','purposeChoice','purpose','correction']){
    const info=choicesFor({role,step});assert.ok(GUIDED_TEXTS[info.key]);
    info.options.forEach((o,i)=>assert.equal(o.value,String(i+1)));
  }
});
test('production entry/runtime stay on the approved implementation',()=>{
  const root=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const preview=readFileSync(new URL('../wide-desk-preview/index.html',import.meta.url),'utf8');
  assert.match(root,/\/app.js\?v=20260915-mobile-audio-1/);assert.doesNotMatch(root,/guided/);
  assert.match(preview,/guided-app.js/);assert.match(preview,/guided.css/);
  assert.doesNotMatch(readFileSync(new URL('./app.js',import.meta.url),'utf8'),/guided/);
});
test('every new guide has a whole-phrase VOICEVOX recording with an audited reading',()=>{
  const report=JSON.parse(readFileSync(new URL('./guided-audio/generation.json',import.meta.url),'utf8'));
  for(const [key,text] of Object.entries(GUIDED_TEXTS)){
    const wav=readFileSync(new URL(`./guided-audio/${key}.wav`,import.meta.url));
    assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.equal(wav.subarray(8,12).toString(),'WAVE');
    assert.equal(report[key].text,text);assert.equal(report[key].speaker,'VOICEVOX:春日部つむぎ');assert.ok(report[key].seconds>.3);assert.ok(wav.length>10000);
  }
  assert.match(report.guideDeliveryType.kana,/オトドケモノ/);
});

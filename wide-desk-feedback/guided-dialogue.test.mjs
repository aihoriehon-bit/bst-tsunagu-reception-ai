import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {respond,initialReceptionState,recognizeLateVisitor,choicesFor,receptionPlan,GUIDED_TEXTS} from './guided-dialogue.mjs';
import {spokenNumber,selectSpeechAnswer} from './guided-speech-input.mjs';
import {DIRECTORY,directoryPage} from './guided-directory.mjs';
const run=(inputs,state=initialReceptionState('guest'))=>inputs.reduce((s,text)=>respond(text,s).state,state);
const confirmation=()=>run(['1','1','1','1','株式会社テスト','1','やまだたろう','1']);
test('appointment selects department and staff by number, then company and name separately',()=>{
  let s=run(['1番','1','1','1']);assert.equal(s.step,'company');
  s=run(['会社名は株式会社テストです'],s);assert.equal(s.step,'companyCheck');assert.equal(s.company,'株式会社テスト');
  s=run(['1'],s);assert.equal(s.step,'visitorName');
  s=run(['やまだたろうと申します'],s);assert.equal(s.step,'nameCheck');
  s=run(['1'],s);assert.equal(s.step,'confirm');assert.equal(s.department,'営業');assert.equal(s.recipient,'山田太郎');
  assert.equal(s.recipientReading,'やまだたろう');assert.equal(s.visitor,'やまだたろう');
  assert.equal(respond('1',s).state.step,'done');assert.equal(respond('1',s).key,'guideComplete');
});
test('delivery uses type and recipient directory and asks courier company/name',()=>{
  let s=run(['二番です','2','2','1']);assert.equal(s.role,'delivery');assert.equal(s.purpose,'商品の納品');assert.equal(s.step,'company');
  s=run(['宅配テスト','1','ひらい','1','1'],s);assert.equal(s.step,'done');assert.equal(s.recipient,'総務担当者');
});
test('walk in and department fallback select general affairs with explicit demo wording',()=>{
  const s=run(['3','3']);const r=respond('7',s);assert.equal(r.prefix,'guideGeneral');assert.equal(r.state.step,'company');
  const done=run(['個人です','ふくだ','1','1'],r.state);assert.equal(done.step,'done');assert.equal(done.company,'個人での来訪');
});
test('recognized names precede guide; names are confirmed and can be corrected without re-insertion',()=>{
  const person={source:'face',role:'guest',name:'山田太郎',id:'x'};
  assert.deepEqual(receptionPlan(person,'greetingDayArrival').greeting,['registeredName','chatRecognizedGuest','guideRoute','guideGoAhead']);
  assert.deepEqual(receptionPlan(null,'greetingDayArrival').greeting.slice(-2),['guideRoute','guideGoAhead']);
  assert.deepEqual(receptionPlan({role:'employee',name:'佐藤'},'greetingDayArrival').greeting.slice(-2),['guideEmployee','guideGoAhead']);
  let s=run(['1','2','7','個人です'],initialReceptionState('guest',person));assert.equal(s.step,'nameCheck');
  s=respond('2',s).state;assert.equal(s.step,'visitorName');assert.equal(s.visitor,undefined);
  assert.equal(recognizeLateVisitor(s,person).state.visitor,undefined);
  s=run(['ふくだ','1'],s);assert.equal(s.step,'confirm');assert.equal(s.visitor,'ふくだ');
});
test('employee can decline; known delivery still uses route and numbered choices',()=>{
  assert.equal(initialReceptionState('delivery',{source:'face',name:'山田'}).step,'route');
  assert.equal(initialReceptionState('employee').step,'employee');
  assert.equal(respond('1',initialReceptionState('employee')).state.step,'route');
  assert.equal(respond('2',initialReceptionState('employee')).key,'chatNoPurpose');
});
test('ambiguous or out of range numbers never advance or become names',()=>{
  for(const text of ['1か2','12','4','はい','呼んでほしい',''])assert.equal(respond(text,initialReceptionState('guest')).state.step,'route');
  for(const text of ['1','2','はい','ありがとう',''])assert.equal(respond(text,{step:'visitorName'}).state.visitor,undefined);
  for(const text of ['１番','一番です','いちばん','1でお願いします','番号は1番','イチバン'])assert.equal(spokenNumber(text),1);
});
test('number alternatives are considered, conflicts retry and names are never chosen from a lower candidate',()=>{
  const info=choicesFor(initialReceptionState('guest')), a=(...s)=>s.map(transcript=>({transcript}));
  assert.equal(selectSpeechAnswer(a('位置','一番'),info).text,'1');
  assert.equal(selectSpeechAnswer(a('一番','二番'),info).unclear,true);
  assert.equal(selectSpeechAnswer(a('4','1'),info).text,'4');
  assert.equal(selectSpeechAnswer(a('株式会社一番','二番'),{voiceField:true}).text,'株式会社一番');
});
test('repeat stays, back restores snapshot, reset discards previous data',()=>{
  const s=run(['1','1','1','1']), b=respond('9',s).state;assert.equal(b.step,'staff');assert.equal(b.recipient,undefined);
  assert.equal(respond('0',b).state.step,'staff');
  const reset=run(['最初から','2'],s);assert.equal(reset.recipient,undefined);assert.equal(reset.purpose,undefined);
});
test('every final correction returns to confirmation retaining other fields',()=>{
  let s=run(['2','2','1'],confirmation());assert.equal(s.step,'confirm');assert.equal(s.recipient,'総務担当者');assert.equal(s.visitor,'やまだたろう');
  s=run(['3','別の株式会社','1'],s);assert.equal(s.step,'confirm');assert.equal(s.company,'別の株式会社');
  s=run(['4','まっきぃ','1'],s);assert.equal(s.step,'confirm');assert.equal(s.visitor,'まっきぃ');
  s=run(['5','2'],s);assert.equal(s.step,'confirm');assert.equal(s.purpose,'ご相談');
  s=run(['6','2','2','7'],s);assert.equal(s.step,'confirm');assert.equal(s.role,'delivery');assert.equal(s.purpose,'商品の納品');
});
test('spoken company and name have separate retry and individual path',()=>{
  let s=run(['1','1','7','間違えた会社','2']);assert.equal(s.step,'company');assert.equal(s.company,undefined);
  s=run(['修正した会社','3','間違えた名前','2','ひらい','1'],s);
  assert.equal(s.step,'confirm');assert.equal(s.company,'個人での来訪');assert.equal(s.visitor,'ひらい');
});
test('late recognition does not discard route, company or explicit name',()=>{
  const p={source:'face',role:'guest',name:'まっきぃ'};
  const r=recognizeLateVisitor({role:'guest',category:'appointment',step:'visitorName',recipient:'総務担当者'},p);
  assert.equal(r.state.step,'nameCheck');assert.equal(r.state.visitor,'まっきぃ');
  assert.equal(recognizeLateVisitor({step:'company',company:'テスト',visitor:'ふくだ'},p).state.visitor,'ふくだ');
  assert.equal(recognizeLateVisitor({step:'confirm'},p),null);
});
test('all selection prompts have recordings and unique numeric options, roster is sample and paginates',()=>{
  for(const step of ['route','employee','deliveryType','department','staff','company','companyCheck','visitorName','nameCheck','purposeChoice','confirm']){
    const info=choicesFor({step,departmentId:'sales'});assert.ok(GUIDED_TEXTS[info.key]);
    assert.equal(new Set(info.options.map(o=>o.value)).size,info.options.length);
    info.options.forEach(o=>assert.match(o.value,/^[1-7]$/));
  }
  assert.equal(DIRECTORY.sample,true);assert.deepEqual(directoryPage([1,2,3,4,5],1),[5]);
});
test('visitor screens have no typing form; both approved entries use guided runtime',()=>{
  for(const file of ['guided-panel.mjs','guided-card.mjs','guided-conversation.js']){
    assert.doesNotMatch(readFileSync(new URL('./'+file,import.meta.url),'utf8'),/<input|<textarea|<form/);
  }
  const root=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(root,/guided-app.js\?v=20260928-goahead-2/);assert.match(root,/guided.css/);
  assert.match(readFileSync(new URL('../wide-desk-preview/index.html',import.meta.url),'utf8'),/guided-app.js/);
  assert.doesNotMatch(readFileSync(new URL('./app.js',import.meta.url),'utf8'),/guided/);
});
test('every numbered guide has a whole phrase recording and matching text',()=>{
  const report=JSON.parse(readFileSync(new URL('./guided-audio/generation.json',import.meta.url),'utf8'));
  for(const [key,text] of Object.entries(GUIDED_TEXTS)){
    const wav=readFileSync(new URL('./guided-audio/'+key+'.wav',import.meta.url));
    assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.equal(wav.subarray(8,12).toString(),'WAVE');
    assert.equal(report[key].text,text);assert.equal(report[key].speaker,'VOICEVOX:春日部つむぎ');assert.ok(report[key].seconds>.3);assert.ok(wav.length>10000);
  }
  assert.match(report.guideDeliveryType.kana,/オトドケモノ/);
});

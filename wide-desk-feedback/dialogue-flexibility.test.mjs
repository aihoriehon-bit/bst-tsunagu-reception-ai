import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {respond} from './dialogue.mjs';
test('general affairs variants give the requested phrase both before and after learning a name',()=>{
 const lines=JSON.parse(readFileSync(new URL('./dialogue-lines.json',import.meta.url)));
 for(const input of ['誰でもいいです','だれでも大丈夫です','どなたでも構いません','お任せします','担当者が分かりません']) {
   const result=respond(input,{step:'recipient'});assert.equal(result.key,'chatGeneral');assert.equal(result.state.recipient,'総務担当者');
   assert.ok(lines[result.key].startsWith('では、総務担当者をお呼びいたしますね。'));
   const known=respond(input,{step:'recipient',visitor:'山田太郎'});assert.equal(known.key,'chatGeneralConfirm');assert.equal(known.state.visitor,'山田太郎');
   assert.ok(lines[known.key].startsWith('では、総務担当者をお呼びいたしますね。'));
 }
});
test('common visit paraphrases are purposes, not visitor names',()=>{
 for(const text of ['面会です','営業です','商談です','資料を渡したいです','点検に来ました','修理の相談です','ミーティングで来ました']) {
   const r=respond(text);assert.equal(r.key,'chatRecipient',text);assert.equal(r.state.visitor,undefined);
 }
 assert.equal(respond('山田太郎さんを呼んでください').state.recipient,'山田太郎さん');
});
test('interruptions preserve reception details and corrections only clear the selected field',()=>{
 const state={step:'confirm',visitor:'山田太郎',recipient:'平井さん',purpose:'打ち合わせ'};
 for(const [text,key] of [['ちょっと待ってください','chatPause'],['あと何分ですか','chatWaitTime'],['トイレはどこですか','chatFacility'],['もう一回お願いします','chatConfirm'],['電話はつながりましたか','chatCallStatus'],['どうすればいいですか','chatHelp']]) {
   const r=respond(text,state);assert.equal(r.key,key,text);assert.deepEqual(r.state,state);
 }
 assert.equal(respond('名前を間違えました',state).state.visitor,undefined);
 assert.equal(respond('名前を間違えました',state).state.recipient,'平井さん');
 assert.deepEqual(respond('キャンセルしてください',state).state,{step:'cancelled'});
 assert.deepEqual(state,{step:'confirm',visitor:'山田太郎',recipient:'平井さん',purpose:'打ち合わせ'});
});
test('name refusal never becomes a visitor name, and employee no-purpose is not a farewell',()=>{
 assert.equal(respond('名前は言いたくないです',{step:'visitorName',recipient:'総務担当者'}).key,'chatNameRequired');
 assert.equal(respond('特にありません',{role:'employee',step:'purpose'}).key,'chatNoPurpose');
});

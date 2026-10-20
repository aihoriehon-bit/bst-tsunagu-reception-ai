import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const version='20261020-leda-fullnames-1';
globalThis.location={hostname:'localhost'};
const bank=await import(`../reception-leda/app/name-library.mjs?v=${version}`);
const {registrationName,restoreRegistrationName}=await import(`../reception-leda/app/registration-name.mjs?v=${version}`);
const {nameAvailability}=await import(`../reception-leda/app/name-availability.mjs?v=${version}`);
const {nameLine}=await import(`../reception-leda/app/name-voice.js?v=${version}`);
const {canJoinNames,joinLedaNameSamples,fullNameAudio}=await import(`../reception-leda/app/full-name-audio.mjs?v=${version}`);
const {nameApprovalToken,shouldCallName}=await import(`../reception-leda/app/name-confirmation.mjs?v=${version}`);
const manifest=JSON.parse(readFileSync(new URL('../reception-leda/model/leda-name-manifest.json',import.meta.url)));
const old=JSON.parse(execFileSync('git',['show','HEAD:reception-leda/model/leda-name-manifest.json'],{maxBuffer:20*1024*1024}));
const oldMap=new Map(old.entries.map(e=>[e.reading,e]));
const digest=b=>createHash('sha256').update(b).digest('hex');
for(const e of manifest.entries){
 assert.equal(e.audio,oldMap.get(e.reading).audio);assert.equal(e.sha256,oldMap.get(e.reading).sha256);
 assert.equal(digest(readFileSync(new URL('../reception-leda/app/'+e.audio,import.meta.url))),e.sha256);
 if(e.surnameStem)assert.equal(digest(readFileSync(new URL('../reception-leda/app/'+e.surnameStem.audio,import.meta.url))),e.surnameStem.sha256);
 if(e.joinTiming)assert(e.joinTiming.startSeconds>=0&&e.joinTiming.startSeconds<e.joinTiming.endSeconds&&e.joinTiming.endSeconds<=e.joinTiming.durationSeconds);
}
assert.equal(manifest.entries.filter(e=>e.surnameStem).length,5001);
assert.equal(manifest.entries.filter(e=>e.joinTiming).length,5000);
bank.configureLedaNameBank(manifest.entries);
const part=reading=>bank.recordedName({reading});
const out=new URL('../qa/leda-full-names/',import.meta.url);mkdirSync(out,{recursive:true});
const decode=(bytes,rate=24000)=>{let b=execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-ac','1','-ar',String(rate),'-f','f32le','pipe:1'],{input:bytes,maxBuffer:10*1024*1024});return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
let fetches=0,closes=0,failFetch=false,wrongBytes=false;
globalThis.fetch=async u=>{fetches++;if(failFetch)throw new Error('test offline');let b=readFileSync(u);if(wrongBytes)b=Buffer.from('incorrect-audio');return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)};};
globalThis.AudioContext=class{sampleRate=24000;async decodeAudioData(b){let y=decode(Buffer.from(b));return {numberOfChannels:1,getChannelData:()=>y};}async close(){closes++;}};
const pairs=[['やまだ','たろう'],['すずき','えみた'],['はし','たろう'],['はやし','たける'],['たなか','さくら'],['たかはし','たろう'],['わだ','たかし'],['くさま','たけき'],['ありが','まきお'],['うねおか','たろう'],['ますが','たろう'],['ひろし','たろう'],['たんの','たろう'],['うえます','たろう'],['くにます','たろう'],['ふくます','たろう'],['なす','たろう'],['やす','たろう'],['あかす','たろう'],['まき','たろう'],['みす','たろう'],['さく','たろう'],['くし','たろう'],['さとう','あい']];
const sampleRecords=[];
for(const [s,g] of pairs){
 const surname=part(s),given=part(g);assert(canJoinNames(surname,given));
 const url=await fullNameAudio(surname,given);assert(url.startsWith('blob:'));
 // Derive the review WAV through the same joining function used in browsers.
 const stem=decode(readFileSync(new URL(surname.surnameStem.audio,new URL('../reception-leda/app/full-name-audio.mjs',import.meta.url))));
 const name=decode(readFileSync(new URL(given.audio)));
 const wav=joinLedaNameSamples(stem,name,surname.surnameStem,given.joinTiming,24000);
 const file=s+g+'さん.wav';writeFileSync(new URL(file,out),wav);sampleRecords.push({surname:s,given:g,file,sha256:digest(wav)});
}
const person=registrationName('full','山田','やまだ','太郎','たろう');
assert.equal(nameAvailability(person).state,'recorded');
const before=fetches;assert((await nameLine(person,{audition:true})).audio.startsWith('blob:'));assert.equal(fetches,before);
assert.equal((await nameLine(registrationName('surname','山田','やまだ'))).audio,part('やまだ').audio);
assert.equal((await nameLine(registrationName('given','太郎','たろう'))).audio,part('たろう').audio);
assert.equal(shouldCallName({...person,nameCallingEnabled:false}),false);
await assert.rejects(nameLine({...person,nameCallingEnabled:false}),/OFF/);
assert((await nameLine({...person,nameCallingEnabled:false},{audition:true})).audio);
assert.equal(nameAvailability(registrationName('full','山田','やまだ','太郎','')).state,'recorded');
assert.equal(nameAvailability(registrationName('full','山田','やまだ','','')).state,'reading-needed');
const missing=registrationName('full','未収録','ほげほげ','太郎','たろう');assert.equal(nameAvailability(missing).state,'missing');assert.equal((await nameLine(missing)).spokenText,'ほげほげたろうさん');
const legacy=restoreRegistrationName({name:'山田太郎',reading:'やまだたろう'});assert.equal(legacy.nameMode,'legacy');assert.equal((await nameLine(legacy)).spokenText,'やまだたろうさん');
assert.equal(part('くさま').reading,'くさま');assert.equal(part('さん').reading,'さん');assert.equal(part('まっきー').reading,'まっきぃ');
assert.equal((await nameLine(registrationName('full','未収録','ほげほげ','さん','さん'))).spokenText,'ほげほげさんさん');
assert(nameApprovalToken(person).includes('leda-fullnames-20261020-v1'));
failFetch=true;let fallback=await nameLine(registrationName('full','佐藤','さとう','太郎','たろう'));assert.equal(fallback.spokenText,'さとうたろうさん');assert(!fallback.audio);failFetch=false;
wrongBytes=true;await assert.rejects(fullNameAudio(part('やまだ'),part('あい')),/内容/);wrongBytes=false;
for(const rate of [24000,44100,48000]){
 const stem=new Float32Array(Math.round(rate*.3)).fill(.5),given=new Float32Array(rate).fill(.5);
 const bytes=joinLedaNameSamples(stem,given,{durationSeconds:.3},{durationSeconds:1,startSeconds:.2,endSeconds:.9},rate);
 const expected=Math.round(rate*.3)+Math.round(rate*.06)+Math.round(rate*.9)-Math.round(rate*.2);assert.equal((bytes.byteLength-44)/2,expected);
}
assert.throws(()=>joinLedaNameSamples(new Float32Array(100),new Float32Array(100),{durationSeconds:1},{durationSeconds:1,startSeconds:0,endSeconds:1},24000),/長さ/);
assert.throws(()=>joinLedaNameSamples(new Float32Array(24000),new Float32Array(24000),{durationSeconds:1},{durationSeconds:1,startSeconds:-.1,endSeconds:.8},24000),/長さ/);
writeFileSync(new URL('result.json',out),JSON.stringify({passed:true,originalsUnchanged:9234,surnameStems:5001,givenTimings:5000,sampleRecords,fetches,closes},null,2));
console.log(JSON.stringify({passed:true,originalsUnchanged:9234,surnameStems:5001,givenTimings:5000,samples:pairs.length,fetches,closes}));

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { needsAudioGesture, primeSpeechPlayer } from './audio-access.mjs';
test('iPhone Chrome, Safari, iPad desktop UA and Android need explicit initial audio action', () => {
  for (const nav of [{userAgent:'iPhone CriOS/152'}, {userAgent:'iPhone Safari/605'}, {userAgent:'Android Chrome'}, {userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}]) assert.equal(needsAudioGesture(nav),true);
  assert.equal(needsAudioGesture({userAgent:'Macintosh Chrome',platform:'MacIntel',maxTouchPoints:0}),false);
});
test('tap calls play synchronously on the same unmuted speech element, then pauses a valid silent PCM WAV', async () => {
  let played=false,paused=false,resolve;
  const audio={muted:true,play(){played=true;return new Promise(r=>resolve=r)},pause(){paused=true}};
  const promise=primeSpeechPlayer(audio);assert.equal(played,true);assert.equal(paused,false);assert.equal(audio.muted,false);
  const bytes=Buffer.from(audio.src.split(',')[1],'base64');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(40),bytes.length-44);assert.ok(bytes.subarray(44).every(x=>x===0));
  resolve();assert.equal(await promise,true);assert.equal(paused,true);
});
test('rejection is not treated as unlocked; a late primer cannot stop another clip', async () => {
  await assert.rejects(primeSpeechPlayer({play(){return Promise.reject(Error('blocked'))}}));
  let resolve,paused=false;
  const audio={play(){return new Promise(r=>resolve=r)},pause(){paused=true}};
  const promise=primeSpeechPlayer(audio);audio.src='new-speech.wav';resolve();
  assert.equal(await promise,false);assert.equal(paused,false);
});
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function startAudioFromGesture()'),source.indexOf('document.querySelector("#autoSpeech")'));
function fixture(overrides={}) {
  const paragraph={}, button={}, prompt={hidden:false,querySelector:()=>paragraph}, calls=[];
  let resolve;
  const state={audioStarting:false,audioStartToken:0,audioEnabledOnce:false,blockedSpeechKey:null,speechRequestId:0,sequenceId:0,greetingPending:false,soundEnabled:false,audioStartButton:button,audioPrompt:prompt,speechPlayer:{},document:{hidden:false},mixer:{},sensorAttending:false,currentReceptionPlan:null,
    conversation:{active:false,setAudible:v=>calls.push(['audible',v]),speechFinished:()=>calls.push(['finished'])},
    cancelSpeechSequence(){state.speechRequestId++},updateSoundToggle(){},
    primeSpeechPlayer(){calls.push(['prime']);return new Promise(r=>resolve=r)},
    speakLine:key=>calls.push(['speak',key]),beginSensorGreeting:()=>calls.push(['greeting']),playReceptionGreeting:()=>calls.push(['replay']),...overrides};
  vm.createContext(state);vm.runInContext(handler,state);
  return {state,calls,paragraph,button,prompt,resolve:()=>resolve(true)};
}
test('initial mobile tap primes before animation and enables audio only after success', async () => {
  const f=fixture();const p=f.state.startAudioFromGesture();assert.equal(f.calls.at(-1)[0],'prime');assert.equal(f.state.soundEnabled,false);
  f.resolve();await p;assert.equal(f.state.soundEnabled,true);assert.equal(f.prompt.hidden,true);assert.deepEqual(f.calls.at(-1),['speak','startup']);
});
test('first tap replays an already silent camera greeting, blocked replies retry, stale taps cannot revive speech',async()=>{
  const f=fixture({currentReceptionPlan:{},conversation:{active:true,setAudible(){},speechFinished(){}}});const p=f.state.startAudioFromGesture();f.resolve();await p;assert.equal(f.calls.at(-1)[0],'replay');
  const g=fixture({blockedSpeechKey:'chatRecipient',conversation:{active:true,setAudible(){},speechFinished(){}}});const q=g.state.startAudioFromGesture();g.resolve();await q;assert.deepEqual(g.calls.at(-1),['speak','chatRecipient']);
  const h=fixture();const r=h.state.startAudioFromGesture();h.state.speechRequestId++;h.resolve();await r;assert.equal(h.state.soundEnabled,false);assert.equal(h.calls.some(c=>c[0]==='speak'),false);assert.equal(h.button.disabled,false);
});
test('failed preparation leaves a visible retry and never enables recognition or speech',async()=>{
  const f=fixture({primeSpeechPlayer:()=>Promise.reject(Error('blocked'))});
  await f.state.startAudioFromGesture();assert.equal(f.state.soundEnabled,false);assert.equal(f.prompt.hidden,false);assert.equal(f.button.disabled,false);
  assert.match(f.paragraph.textContent,/もう一度/);assert.equal(f.calls.some(c=>c[0]==='speak'),false);
});

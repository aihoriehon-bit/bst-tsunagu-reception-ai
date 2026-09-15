import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureDirection,mirroredRegionLeft,createShutterSound} from './enrollment-feedback.mjs';
test('mirror preview directions follow the registrant and mirror the detection region',()=>{
  assert.equal(captureDirection(0).arrow,'◎');assert.equal(captureDirection(1).arrow,'→');assert.equal(captureDirection(2).arrow,'←');
  assert.equal(captureDirection(2,true).arrow,'◎');
  assert.equal(mirroredRegionLeft({x:0,width:50}),50);assert.equal(mirroredRegionLeft({x:50,width:50}),0);
});
test('shutter is short, optional, and releases its audio context',()=>{
  let starts=0,closed=0;
  class Context {
    state='running';sampleRate=24000;destination={};
    resume(){return Promise.resolve()} close(){closed++;return Promise.resolve()}
    createBuffer(n,length,rate){assert.equal(n,1);assert.equal(length,4320);assert.equal(rate,24000);return {getChannelData:()=>new Float32Array(length)}}
    createBufferSource(){return {connect(){},disconnect(){},start(){starts++}}}
    createBiquadFilter(){return {frequency:{},connect(){},disconnect(){}}}
    createGain(){return {gain:{},connect(){},disconnect(){}}}
  }
  const sound=createShutterSound(Context);assert.equal(sound.play(),false);sound.unlock();assert.equal(sound.play(),true);sound.close();
  assert.equal(starts,1);assert.equal(closed,1);assert.equal(sound.play(),false);
  assert.doesNotThrow(()=>{const unsupported=createShutterSound(null);unsupported.unlock();unsupported.play();unsupported.close()});
});
test('one capture button lives in the camera stage and sound follows validated capture only',()=>{
  const source=readFileSync(new URL('./visitor-recognition.js',import.meta.url),'utf8');
  assert.equal((source.match(/data-face>/g)||[]).length,1);
  assert.ok(source.indexOf('data-face>')>source.indexOf('class="enrollment-camera"'));
  assert.ok(source.indexOf('data-face>')<source.indexOf('class="enrollment-steps"'));
  assert.match(source,/captured\.push\(v\);\s*if \(q\('\[data-shutter\]'\)\.checked\) shutter\.play\(\)/);
});
test('desktop registration keeps fields beside the camera and capture requires fresh stable frames',()=>{
  const source=readFileSync(new URL('./visitor-recognition.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('./preview.css',import.meta.url),'utf8');
  assert.match(source,/identity-workspace/);assert.match(source,/identity-form-column/);
  assert.match(css,/@media \(min-width: 960px\)/);
  assert.match(source,/fresh: facesAt >= stepStartedAt/);
  assert.match(source,/freshFrames >= 2 && guidanceDone/);
  assert.match(source,/if \(currentIssue\) \{\s*stableSince = 0; freshFrames = 0/);
  assert.doesNotMatch(source,/data-countdown|Math.ceil\(\(1800/);
  const lines=JSON.parse(readFileSync(new URL('./dialogue-lines.json',import.meta.url),'utf8'));
  const report=JSON.parse(readFileSync(new URL('./audio/generation.json',import.meta.url),'utf8'));
  for(const key of ['enrollFrontCue','enrollRightCue','enrollLeftCue']) {
    assert.equal(report[key].text,lines[key]);assert.ok(report[key].seconds<4);
    assert.ok(readFileSync(new URL(`./audio/${key}.wav`,import.meta.url)).length>1000);
  }
  assert.deepEqual(['enrollFrontCue','enrollRightCue','enrollLeftCue'].map(k=>lines[k]),
    ['正面を向いてください。','次は右を向いてください。','最後に左を向いてください。']);
});

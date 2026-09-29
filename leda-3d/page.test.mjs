import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('four buttons use existing Leda recordings and matching comparison text',()=>{
 const html=read('leda-3d/index.html'), app=read('leda-3d/app.js'), compare=read('voice-comparison/compare.js');
 for(const key of ['startup','route','confirm','goodbye']){
  assert.ok(html.includes(`data-line="${key}"`));
  const voice=new URL(`voice-comparison/audio/leda-${key}.wav`,root);assert.ok(existsSync(voice));assert.equal(readFileSync(voice).toString('ascii',0,4),'RIFF');
  const text=app.match(new RegExp(`${key}:\\{title:'[^']+',text:'([^']+)'`))[1];assert.ok(compare.includes(text));
 }
 assert.ok(app.includes('../voice-comparison/audio/leda-${key}.wav'));
});
test('audition contains no camera, microphone, recognition or generated speech requests',()=>{
 const code=read('leda-3d/app.js')+read('leda-3d/avatar.js');
 assert.doesNotMatch(code,/getUserMedia|SpeechRecognition|speechSynthesis|createVisitorRecognition|api[_-]?key/i);
 assert.ok(code.includes('own!==token'));assert.ok(code.includes('visibilitychange'));
});
test('character is clipped below desk and rendering assets exist',()=>{
 const code=read('leda-3d/avatar.js');
 assert.ok(code.includes('DESK_BODY_CUTOFF_Y = 0.64'));assert.ok(code.includes('renderer.localClippingEnabled = true'));
 for(const match of code.matchAll(/"\.\.\/(assets\/[^"?]+|blender\/[^"?]+)(?:\?[^\"]*)?"/g)) assert.ok(existsSync(new URL(match[1],root)),match[1]);
});

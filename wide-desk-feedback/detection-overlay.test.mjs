import test from 'node:test';
import assert from 'node:assert/strict';
import { displayBox } from './detection-overlay.mjs';
import { originalPersonBoxes } from './person-presence.mjs';
import { readFileSync } from 'node:fs';
test('mirrored face coordinates and contain letterboxing match video',()=>{
 const b={originX:100,originY:50,width:80,height:100};
 assert.deepEqual(displayBox(b,640,480,320,240),{left:230,top:25,width:40,height:50});
 assert.deepEqual(displayBox({originX:0,originY:0,width:1920,height:1080},1920,1080,160,120),{left:0,top:15,width:160,height:90});
 assert.equal(displayBox(b,0,480,320,240),null);
 assert.equal(displayBox({...b,originX:900},640,480,320,240),null);
});
test('body crop and resize are mapped back before drawing',()=>{
 assert.deepEqual(originalPersonBoxes([{originX:10,originY:20,width:50,height:80}],{x:320,y:0,width:640,height:720},320,360),[{originX:340,originY:40,width:100,height:160}]);
});
test('both camera views draw accepted detections; reset clears stale boxes',()=>{
 const src=readFileSync(new URL('./visitor-recognition.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.match(src,/createDetectionOverlay\(video\), createDetectionOverlay\(q\('\.identity-preview'\)\)/);
 assert.match(app,/updatePeople\(people, bodyBoxes\)/);
 assert.match(src,/overlays.forEach\(o=>o.clear\(\)\)/);
 assert.match(src,/枠は本人確認済みの意味ではありません/);
});

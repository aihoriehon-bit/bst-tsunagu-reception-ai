import test from 'node:test';
import assert from 'node:assert/strict';
import {proposedRegion,createAutoRegion,cameraRegion} from './camera-region.mjs';
import {detectFaces} from './face-detection.mjs';
import {readFileSync} from 'node:fs';
const face=(x,w=60)=>({boundingBox:{originX:x,originY:120,width:w,height:80}});
test('focus selection fits a single face with padding and never chooses between people',()=>{
 assert.equal(proposedRegion([face(290)],1,640,480),'center50');
 assert.equal(proposedRegion([face(240,160)],1,640,480),'center70');
 assert.equal(proposedRegion([face(70)],1,640,480),'left');
 assert.equal(proposedRegion([face(510)],1,640,480),'right');
 for(const [faces,people] of [[[],0],[[face(100),face(420)],1],[[face(290)],2],[[face(0)],1]]) assert.equal(proposedRegion(faces,people,640,480),'full');
});
test('focus requires sustained frames; loss, multiple people and camera size changes reopen the full view',()=>{
 const c=createAutoRegion(), input={faces:[face(290)],people:1,width:640,height:480};
 assert.equal(c.observe({...input,now:0}),'full');assert.equal(c.observe({...input,now:500}),'full');
 assert.equal(c.observe({...input,now:1000}),'center50');
 assert.equal(c.observe({...input,people:2,now:1100}),'full');
 c.observe({...input,now:2000});c.observe({...input,now:2500});assert.equal(c.observe({...input,now:3000}),'center50');
 assert.equal(c.observe({...input,faces:[face(510)],now:3100}),'full');
 assert.equal(c.observe({...input,faces:[],now:3200}),'full');
 assert.equal(c.observe({...input,width:1280,now:3300}),'full');
});
test('automatic focus retains all original search regions and detects someone outside focus',async()=>{
 const frame={getContext:()=>({drawImage(){}})},tile={getContext:()=>({drawImage(){}})};
 let calls=0;
 const api={TinyFaceDetectorOptions:class{},async detectAllFaces(){
  const n=calls++;
  if(n===0)return [{score:.99,box:{x:290,y:120,width:60,height:80}}];
  if(n===1)return [{score:.98,box:{x:30,y:50,width:30,height:40}}];
  if(n===5)return [{score:.99,box:{x:130,y:120,width:60,height:80}}];
  return [];
 }};
 const result=await detectFaces(api,{readyState:2,videoWidth:640,videoHeight:480},{frame,tile},null,cameraRegion(640,480,'center50'));
 assert.equal(calls,6);assert.equal(result.length,2);assert.ok(result.some(f=>f.boundingBox.originX===30));
 assert.equal(new Set(result.map(f=>f.capturedAt)).size,1);
});
test('auto is default, manual choices remain and body detection stays full-frame',()=>{
 const src=readFileSync(new URL('./visitor-recognition.js',import.meta.url),'utf8');
 assert.match(src,/regionMode = 'auto'/);assert.match(src,/value="auto">自動/);
 assert.match(src,/get region\(\).*regionMode === 'auto' \? cameraRegion\(video.videoWidth, video.videoHeight, 'full'\)/);
 assert.match(src,/automatic \? null : region\(\)/);
});

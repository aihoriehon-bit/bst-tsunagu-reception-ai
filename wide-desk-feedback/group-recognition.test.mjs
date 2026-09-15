import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createGroupConfirmation,targetDescriptor,overlap} from './group-recognition.mjs';
import {matchFace} from './visitor-matching.mjs';
import {faceQuality} from './face-detection.mjs';
import {frameLifetime} from './camera-region.mjs';
const box={originX:100,originY:100,width:100,height:100};
const person=id=>({id,name:id,role:'guest',source:'face'});
test('each distinct registered identity requires three separate matching frames',()=>{
  const c=createGroupConfirmation(), results=[{person:person('a'),box},{person:person('b'),box:{...box,originX:400}},{person:null,box}];
  assert.equal(c.update(results,1).length,0);assert.equal(c.update(results,1).length,0);
  assert.equal(c.update(results,2).length,0);assert.deepEqual(c.update(results,3).map(p=>p.id),['a','b']);
  assert.deepEqual(c.update(results.slice(1),4).map(p=>p.id),['b']);
  c.reset();assert.equal(c.update(results,5).length,0);
});
test('one identity on two different faces is withheld, including after previous confirmation',()=>{
  const c=createGroupConfirmation(), r={person:person('a'),box};
  for(let i=1;i<=3;i++)c.update([r],i);
  assert.equal(c.update([r,{...r,box:{...box,originX:400}}],4).length,0);
  assert.equal(c.update([r],5).length,0);
});
test('crop descriptors must belong to the target, never to a nearby detected face',()=>{
  const target={originX:50,originY:50,width:100,height:100};
  const r={detection:{box:{x:50,y:50,width:100,height:100}},descriptor:[1,2]};
  assert.deepEqual(targetDescriptor([r],target),[1,2]);
  assert.equal(targetDescriptor([{...r,detection:{box:{x:200,y:50,width:100,height:100}}}],target),null);
  assert.equal(targetDescriptor([r,r],target),null);
});

const source=readFileSync(new URL('./visitor-recognition.js',import.meta.url),'utf8');
const groupCode=source.slice(source.indexOf('function groupFacesReady()'),source.indexOf('async function scan()'));
test('actual group scan confirms two faces even with another unknown face and extra body detection',async()=>{
  const vector=x=>[x,...Array(127).fill(0)];
  let sample=0;
  const state={video:{readyState:2,videoWidth:1280,videoHeight:720},faces:[0,1,2].map(i=>({boundingBox:{...box,originX:100+i*250}})),
    facesAt:Date.now(),detectionMs:0,peopleCount:4,dialog:{open:false},document:{hidden:false,createElement:()=>({getContext:()=>({drawImage(){}})})},
    groupIdentities:[],groupAt:0,groupConfirmation:createGroupConfirmation(),identity:null,candidate:'',hits:0,lastSampleFrame:0,
    epoch:0,retryAt:0,busy:false,descriptorFrame:{width:1280,height:720},live:{},ROLES:{guest:'お客様'},shouldCallName:()=>true,
    db:{people:[{...person('a'),descriptors:[vector(0)]},{...person('b'),descriptors:[vector(1)]}]},
    faceQuality,frameLifetime,targetDescriptor,overlap,matchFace,FACE_DESCRIPTOR_OPTIONS:{},
    ensureApi:async()=>({TinyFaceDetectorOptions:class{},detectAllFaces:()=>({withFaceLandmarks:()=>({withFaceDescriptors:async()=>[{detection:{box:{x:320/7,y:320/7,width:320/1.4,height:320/1.4}},descriptor:vector([0,1,4][sample++%3])}]})})}),
  };
  vm.createContext(state);vm.runInContext(groupCode,state);
  for(let i=0;i<3;i++){state.facesAt=Date.now()-10+i;await state.scanGroup();}
  assert.deepEqual(Array.from(state.currentGroup(),p=>p.id),['a','b']);assert.match(state.live.textContent,/a.*b/);
  state.faces=[{boundingBox:{...box,originX:900}}];assert.equal(state.currentGroup().length,0);
  state.document.hidden=true;assert.equal(state.currentGroup().length,0);
});

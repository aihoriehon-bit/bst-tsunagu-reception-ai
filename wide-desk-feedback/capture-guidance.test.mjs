import test from 'node:test';
import assert from 'node:assert/strict';
import {captureProblem,faceMoved,CAPTURE_STABLE_MS,CAPTURE_TURN_MS} from './capture-guidance.mjs';
const box={originX:100,originY:100,width:100,height:120};
const good={ready:true,faces:[{boundingBox:box}],people:1,light:120};
test('capture feedback distinguishes actionable conditions without guessing an identity',()=>{
 assert.equal(captureProblem(good),null);
 for(const [changes,code] of [[{ready:false},'camera'],[{modelError:true},'model'],[{people:2},'multiple'],[{fresh:false},'frame'],[{age:3000},'frame'],[{light:20},'dark'],[{light:245},'bright'],[{faces:[]},'no-face'],[{faces:[{boundingBox:{...box,width:25}}]},'small'],[{moved:true},'moving']]) assert.equal(captureProblem({...good,...changes}).code,code);
 assert.equal(captureProblem({...good,light:null}),null);
 assert.equal(faceMoved(box,{...box,originX:101}),false);
 assert.equal(faceMoved(box,{...box,originX:140}),true);
 assert.ok(CAPTURE_STABLE_MS>=500);assert.ok(CAPTURE_TURN_MS>=1000);
});

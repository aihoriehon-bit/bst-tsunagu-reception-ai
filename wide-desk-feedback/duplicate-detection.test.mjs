import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDetections } from './face-detection.mjs';
import { personBoxes } from './person-presence.mjs';
const face=(x,y,w,h,region='full',time=1)=>({capturedAt:time,sourceRegion:region,score:.9,boundingBox:{originX:x,originY:y,width:w,height:h}});
test('same centered face in full image and a crop is one even when box sizes differ',()=>{
  assert.equal(mergeDetections([face(100,100,100,100),face(125,125,50,50,'tile')]).length,1);
});
test('adjacent faces, off-center smaller faces, same-crop faces and different frames stay separate',()=>{
  for(const other of [face(200,100,70,70,'tile'),face(105,105,45,45,'tile'),face(125,125,50,50),face(125,125,50,50,'tile',2)])
    assert.equal(mergeDetections([face(100,100,100,100),other]).length,2);
});
test('nearly identical body boxes count once, while two nearby people remain two',()=>{
  const body=(x,score=.9)=>({categories:[{categoryName:'person',score}],boundingBox:{originX:x,originY:10,width:100,height:300}});
  assert.equal(personBoxes({detections:[body(100),body(104,.8)]},640,480).length,1);
  assert.equal(personBoxes({detections:[body(100),body(170)]},640,480).length,2);
});

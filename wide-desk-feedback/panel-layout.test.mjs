import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPanelSize} from './panel-layout.mjs';
test('panel width and height change independently while staying within the viewport',()=>{
  assert.deepEqual(fitPanelSize(700,240,1280,800),{width:700,height:240});
  assert.deepEqual(fitPanelSize(320,600,1280,800),{width:320,height:600});
  assert.deepEqual(fitPanelSize(700,900,390,844),{width:362,height:774});
  assert.deepEqual(fitPanelSize(460,null,1280,800),{width:460,height:null});
  assert.deepEqual(fitPanelSize(10,10,1280,800),{width:260,height:160});
  assert.deepEqual(fitPanelSize(460,600,240,200),{width:212,height:130});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./automatic-conversation.js',import.meta.url),'utf8');
const start=source.indexOf('  function close() {');
const end=source.indexOf("  q('[data-enable]').addEventListener",start);
function fixture() {
  const events=[];
  const c={active:true,present:true,completed:true,epoch:3,state:{step:'done',visitor:'山田太郎',recipient:'平井さん',purpose:'相談'},speaking:true,issue:'',
    document:{hidden:false},available:()=>true,
    confirmation:{clear(){events.push('clearCard')}},listener:{update(){events.push('stopListener')}},
    log:{replaceChildren(){events.push('clearLog')}},input:{value:'前回の内容'},renderReception(){},sync(){},
    onInterrupt(){events.push('interrupt')},onRestart(){events.push('restart');c.active=true},
  };
  vm.createContext(c);vm.runInContext(source.slice(start,end),c);
  return {c,events};
}
test('restart clears the completed visit and invalidates old speech before the greeting',async()=>{
  const {c,events}=fixture();await c.restartReception();
  assert.equal(c.completed,false);assert.equal(c.epoch,4);assert.equal(c.input.value,'');
  assert.equal(Object.keys(c.state).length,0);assert.equal(c.speaking,false);
  assert.deepEqual(events,['clearCard','stopListener','clearLog','interrupt','restart']);
  await c.restartReception(); assert.equal(events.filter(e=>e==='restart').length,1);
});
test('disabled, unavailable, absent and hidden visits cannot be restarted',async()=>{
  for(const change of [{completed:false},{active:false},{present:false},{document:{hidden:true}},{available:()=>false},{onRestart:undefined}]) {
    const {c,events}=fixture();Object.assign(c,change);await c.restartReception();assert.equal(events.length,0);
  }
});
test('failed restart is retryable, but failure after departure does not revive the visit',async()=>{
  const {c}=fixture();c.onRestart=async()=>{throw Error('failed')};await c.restartReception();
  assert.equal(c.completed,true);assert.match(c.issue,/再開できません/);
  c.onRestart=async()=>{c.present=false;throw Error('departed')};await c.restartReception();
  assert.equal(c.active,false);assert.equal(c.completed,false);
});
test('restart uses the real camera greeting and never reopens the microphone on completion alone',()=>{
  const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
  assert.match(app,/onRestart\(\) \{ return beginSensorGreeting\(\); \}/);
  assert.match(source,/active: active && !completed/);
  assert.match(source,/panel.insertBefore\(restartButton, panel.querySelector\('\.conversation-panel-content'\)\)/);
});
test('confirmation disabling never disables the completion restart button',()=>{
  const card=readFileSync(new URL('./reception-card.mjs',import.meta.url),'utf8');
  const body=card.slice(card.indexOf('    setEnabled(value) {')+'    setEnabled(value) {'.length,card.indexOf('    setRestartEnabled'));
  let touched=0;
  const c={mode:'complete',value:false,enabled:false,panel:{querySelectorAll(){touched++;return []}}};
  vm.runInNewContext('(function(){'+body.slice(0,body.lastIndexOf('},'))+'})()',c);
  assert.equal(touched,0);
  c.mode='confirm';vm.runInNewContext('(function(){'+body.slice(0,body.lastIndexOf('},'))+'})()',c);assert.equal(touched,1);
});

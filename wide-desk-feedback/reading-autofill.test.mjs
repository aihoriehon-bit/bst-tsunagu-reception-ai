import test from 'node:test';
import assert from 'node:assert/strict';
import {predictReading,bindReadingAutofill} from './reading-autofill.mjs';
test('kana is copied intact and dictionary guesses remain explicitly predictions',()=>{
 assert.equal(predictReading('くさま').reading,'くさま');
 assert.equal(predictReading('まっきぃ').reading,'まっきぃ');
 assert.equal(predictReading('サトウ').reading,'さとう');
 assert.equal(predictReading('山田').reading,'やまだ');
 assert.ok(predictReading('山田').choices.length>1);
 assert.equal(predictReading('太郎','given').reading,'たろう');
 assert.equal(predictReading('髙𠮷').kind,'unknown');
 assert.equal(predictReading('山田太郎').reading,'');
});
class Field {
 value='';textContent='';hidden=false;handlers={};children=[];
 addEventListener(k,f){(this.handlers[k]||=[]).push(f)}
 fire(k,e={}){for(const f of this.handlers[k]||[])f(e)}
 replaceChildren(){this.children=[]} append(e){this.children.push(e)}
}
test('IME, manual correction, name change, candidate selection and saved values',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new Field()};
 try {
  const name=new Field(),reading=new Field(),hint=new Field(),choice=new Field();let refreshes=0;
  const b=bindReadingAutofill({name,reading,hint,choice,category:()=> 'surname',onChange(){refreshes++}});
  name.fire('compositionstart');name.value='やま';name.fire('input',{isComposing:true});assert.equal(reading.value,'');
  name.value='山田';name.fire('compositionend');assert.equal(reading.value,'やまだ');assert.equal(choice.hidden,false);
  reading.value='やまた';reading.fire('input');b.refresh();assert.equal(reading.value,'やまた');
  choice.value='くまだ';choice.fire('change');assert.equal(reading.value,'くまだ');
  name.value='ひらい';name.fire('input');assert.equal(reading.value,'ひらい');
  name.value='不明な姓名';name.fire('input');assert.equal(reading.value,'');
  name.value='山田';reading.value='やまがた';b.adopt();assert.equal(reading.value,'やまがた');
  name.value='';reading.value='';b.adopt();assert.equal(reading.value,'');assert.equal(hint.textContent,'');assert.ok(refreshes>0);
 } finally {globalThis.document=previous}
});

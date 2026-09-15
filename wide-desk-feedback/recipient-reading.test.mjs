import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { recipientReading } from './recipient-reading.mjs';
const read = (recipient, people = []) => recipientReading({ recipient }, people);
test('spoken kana is displayed as hiragana without inventing kanji', () => {
  assert.equal(read('ヤマダ タロウさん').text, 'やまだたろうさん');
  assert.equal(read('くさま').text, 'くさま');
  assert.equal(read('総務担当者').kind, 'department');
});
test('registered employee readings override predictions, including first/last names', () => {
  const people = [{ role: 'employee', name: '山崎 誠', reading: 'やまさきまこと', nameParts: [{ name: '山崎', reading: 'やまさき' }, { name: '誠', reading: 'まこと' }] }];
  assert.deepEqual(read('山崎さん', people), { text: 'やまさきさん', kind: 'registered' });
  assert.equal(read('山崎誠様', people).text, 'やまさきまことさま');
  assert.equal(read('誠さん', people).text, 'まことさん');
  assert.equal(read('山崎', [...people, { role: 'employee', name: '山崎', reading: 'やまざき' }]).kind, 'unknown');
});
test('dictionary predictions are labelled and unknown readings never invented', () => {
  assert.deepEqual(read('平井さん'), { text: 'ひらいさん', kind: 'predicted' });
  assert.equal(read('山田太郎さん').text, 'やまだたろうさん');
  assert.equal(read('龘龘龘さん').kind, 'unknown');
});
test('manual kana overrides persist only for the same recipient, and invalid input stays invalid', () => {
  const state = { recipient: '山崎さん', recipientReadingFor: '山崎さん', recipientReading: 'ヤマサキさん' };
  assert.deepEqual(recipientReading(state), { text: 'やまさきさん', kind: 'confirmed' });
  assert.equal(recipientReading({ ...state, recipient: '平井さん' }).text, 'ひらいさん');
  assert.equal(recipientReading({ ...state, recipientReading: '' }).kind, 'unknown');
});
test('confirmation disables only yes for missing reading, not correction or completed-demo restart', () => {
  const source = readFileSync(new URL('./reception-card.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('    setEnabled(value) {') + '    setEnabled(value) {'.length, source.indexOf('    setRestartEnabled'));
  const buttons = ['はい', '訂正'].map(answer => ({ dataset: { answer }, disabled: false }));
  const c = { mode: 'confirm', value: true, enabled: false, readingValid: false, panel: { querySelectorAll: () => buttons } };
  const run = () => vm.runInNewContext('(function(){' + body.slice(0, body.lastIndexOf('},')) + '})()', c);
  run(); assert.equal(buttons[0].disabled, true); assert.equal(buttons[1].disabled, false);
  c.readingValid = true; run(); assert.equal(buttons[0].disabled, false);
});

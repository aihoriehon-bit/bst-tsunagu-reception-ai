import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameAvailability, bindNameAvailability } from './name-availability.mjs';

test('requested names show the true recording status without registration', () => {
  for (const name of ['たけき', 'タケキ', 'たけきさん', 'ひらい', 'くさま', 'さん']) {
    assert.equal(nameAvailability({ name }).state, 'recorded', name);
  }
  const missing = nameAvailability({ name: 'おおふさ' });
  assert.equal(missing.state, 'missing');
  assert.match(missing.detail, /おおふささん/);
  assert.match(missing.detail, /以前のAI音声/);
  assert.doesNotMatch(missing.detail, /1音ずつ|単音/);
  assert.match(nameAvailability({ name: 'たけき' }).detail, /たけきさん/);
});
test('empty, ambiguous kanji, full names, invalid and explicit readings are distinct', () => {
  assert.equal(nameAvailability({ name: ' ', reading: '' }).state, 'empty');
  assert.equal(nameAvailability({ name: '山崎' }).state, 'reading-needed');
  assert.equal(nameAvailability({ name: '未登録漢字' }).state, 'reading-needed');
  assert.equal(nameAvailability({ name: '平井たけき' }).state, 'reading-needed');
  assert.equal(nameAvailability({ name: '平井', reading: 'おおふさ' }).state, 'missing');
  assert.equal(nameAvailability({ name: '山崎', reading: 'やまざき' }).state, 'recorded');
  assert.equal(nameAvailability({ reading: 'たけき' }).state, 'recorded');
  assert.equal(nameAvailability({ reading: 'ABC' }).state, 'reading-needed');
  assert.equal(nameAvailability({ reading: 'ひらいたけき' }).state, 'missing');
});
function field(value = '') {
  const events = new Map();
  return { value, addEventListener(type, fn) { (events.get(type) || events.set(type, []).get(type)).push(fn); },
    emit(type, event = {}) { for (const fn of events.get(type) || []) fn(event); } };
}
test('both inputs update immediately, clear stale status, respect IME and support saved edits', () => {
  const nameInput = field(), readingInput = field();
  const title = { textContent: '' }, detail = { textContent: '' };
  const panel = { dataset: {}, querySelector: s => s === '[data-availability-title]' ? title : detail };
  const refresh = bindNameAvailability({ nameInput, readingInput, panel });
  assert.equal(panel.dataset.state, 'empty');
  nameInput.value = 'たけき'; nameInput.emit('input');
  assert.equal(title.textContent, '収録済み');
  nameInput.value = 'おおふさ'; nameInput.emit('input');
  assert.equal(panel.dataset.state, 'missing');
  readingInput.emit('compositionstart'); readingInput.value = 'た'; readingInput.emit('input', { isComposing: true }); refresh();
  assert.match(detail.textContent, /おおふささん/);
  readingInput.value = 'たけき'; readingInput.emit('compositionend');
  assert.equal(panel.dataset.state, 'recorded');
  nameInput.value = ''; readingInput.value = ''; readingInput.emit('input');
  assert.equal(panel.dataset.state, 'empty');
  nameInput.value = '山崎'; readingInput.value = 'やまざき'; refresh();
  assert.equal(panel.dataset.state, 'recorded');
  nameInput.value = '<img src=x onerror=alert(1)>'; readingInput.value = ''; refresh();
  assert.equal(panel.dataset.state, 'reading-needed');
  assert.ok(!detail.textContent.includes('<img'));
});
test('registration places the accessible result next to the fields and refreshes reopened forms', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  assert.match(source, /id="nameAvailability"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/);
  assert.equal((source.match(/aria-describedby="nameAvailability"/g) || []).length, 4);
  assert.ok(source.indexOf('id="nameAvailability"') < source.indexOf('data-test-name'));
  assert.match(source, /render\(\); refreshVoiceType\(\)/);
  assert.match(source, /refreshVoiceType\(\); refreshReadingSuggestions\(\)/);
  assert.doesNotMatch(source, /q\('\[data-voice-type\]'\)\.textContent/);
});

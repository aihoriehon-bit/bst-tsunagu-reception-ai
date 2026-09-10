import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { NAME_RECORDINGS, recordedName, nameVoiceDescription } from './name-library.mjs';
import { nameLine } from './name-voice.js';

test('5000 surname and 5000 given readings share complete verified MP3 recordings', () => {
  const catalog = JSON.parse(readFileSync(new URL('./audio/name-bank/catalog.json', import.meta.url)));
  for (const key of ['surname', 'given']) {
    assert.equal(catalog.categories[key].length, 5000);
    assert.equal(new Set(catalog.categories[key]).size, 5000);
  }
  const readings = new Set([...catalog.categories.surname, ...catalog.categories.given]);
  assert.equal(NAME_RECORDINGS.length, readings.size);
  assert.equal(new Set(NAME_RECORDINGS.map(x => x.reading)).size, NAME_RECORDINGS.length);
  const checked = new Map(catalog.entries.map(e => [e.reading, e]));
  for (const entry of NAME_RECORDINGS) {
    const bytes = readFileSync(new URL(entry.audio, import.meta.url));
    const report = checked.get(entry.reading);
    assert.ok(readings.has(entry.reading));
    assert.match(entry.audio, /^\.\/audio\/name-bank\/n-[a-f0-9-]+\.mp3$/);
    assert.equal(bytes.subarray(0,3).toString(), 'ID3');
    assert.equal(bytes.length, report.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.sha256);
    assert.ok(report.seconds > .35 && report.seconds < 8, entry.reading);
    assert.ok(report.peak > 100 && report.peak < 32767, entry.reading);
  }
  const old = JSON.parse(readFileSync(new URL('./audio/names/catalog.json', import.meta.url)));
  for (const e of old.entries) assert.ok(checked.has(e.reading), `lost existing ${e.reading}`);
});
test('explicit readings control pronunciation; ambiguous kanji and full names are never guessed', () => {
  assert.equal(recordedName({ name: '鈴木' }), null);
  assert.equal(recordedName({ name: '鈴木', reading: 'すずき' }).reading, 'すずき');
  assert.equal(recordedName({ name: '鈴木', reading: 'すすき' }).reading, 'すすき');
  assert.equal(recordedName({ name: '山崎' }), null);
  assert.equal(recordedName({ name: '山崎', reading: 'ヤマサキ' }).reading, 'やまさき');
  assert.equal(recordedName({ name: '山崎', reading: 'やまざき' }).reading, 'やまざき');
  assert.equal(recordedName({ name: '高橋太郎' }), null);
  assert.equal(recordedName({ name: '鈴木', reading: 'みしゅうろく' }), null);
  assert.match(nameVoiceDescription({ name: '鈴木', reading: 'すずき' }), /収録済み/);
  assert.match(nameVoiceDescription({ name: '鈴木' }), /読みがなを入力/);
  assert.match(nameVoiceDescription({ name: '未収録' }), /未収録/);
});
test('requested Hirai and Makio readings select complete recordings for all visitor roles', async () => {
  for (const reading of ['ひらい', 'まきお']) {
    const entry = recordedName({ reading });
    assert.ok(entry, reading);
    assert.equal(NAME_RECORDINGS.filter(x => x.reading === reading).length, 1);
    for (const role of ['employee', 'guest', 'delivery']) {
      const line = await nameLine({ name: reading, reading, role });
      assert.equal(line.audio, entry.audio);
      assert.equal(line.text, reading + 'さん。');
    }
  }
  assert.equal(recordedName({ name: '平井' }).reading, 'ひらい');
  assert.equal(recordedName({ name: 'まきお' }).reading, 'まきお');
});
test('whole-name audio is selected without building kana for every visitor role', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const line = await nameLine({ name: '絵美太', reading: 'えみた', role });
    assert.equal(line.audio, recordedName({ reading: 'えみた' }).audio);
    assert.equal(line.text, '絵美太さん。');
    assert.ok(!line.audio.startsWith('blob:'));
  }
});
test('every bank reading is available without network synthesis for every visitor role', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('The prerecorded name must not need network synthesis'); };
  try {
    for (const entry of NAME_RECORDINGS) for (const role of ['employee', 'guest', 'delivery']) {
      const line = await nameLine({ name: entry.reading, reading: entry.reading, role });
      assert.equal(line.audio, entry.audio);
      assert.equal(line.text, entry.reading + 'さん。');
    }
  } finally { globalThis.fetch = previous; }
});
test('large name suggestions stay bounded and match the entered reading', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  const start = source.indexOf('function refreshReadingSuggestions()');
  const end = source.indexOf("q('#identityReading').addEventListener('input', refreshReadingSuggestions)", start);
  const field = { value: '' }; let options = [];
  const ctx = { NAME_RECORDINGS, normalizeNameReading: s => s,
    q: selector => selector === '#identityReading' ? field : { replaceChildren: fragment => { options = fragment.items; } },
    document: { createDocumentFragment: () => ({ items: [], append(node) { this.items.push(node); } }), createElement: () => ({}) },
  };
  vm.createContext(ctx); vm.runInContext(source.slice(start, end), ctx);
  ctx.refreshReadingSuggestions(); assert.equal(options.length, 80);
  field.value = 'ひら'; ctx.refreshReadingSuggestions();
  assert.ok(options.length > 0 && options.length <= 80);
  assert.ok(options.every(o => o.value.startsWith('ひら')));
  assert.ok(options.some(o => o.value === 'ひらい'));
  field.value = 'まきお'; ctx.refreshReadingSuggestions();
  assert.ok(options.some(o => o.value === 'まきお'));
});
test('complete readings ending in honorific-like sounds are never shortened', async () => {
  for (const reading of ['くさま', 'はさま', 'あさま', 'さん']) {
    const entry = recordedName({ reading });
    assert.equal(entry.reading, reading);
    assert.equal(recordedName({ name: reading }).reading, reading);
    const line = await nameLine({ name: reading, reading });
    assert.equal(line.audio, entry.audio);
    assert.equal(line.text, reading + 'さん。');
  }
  assert.equal(recordedName({ name: '' }), null);
  assert.equal(recordedName({ name: '平井', reading: 'さま' }), null);
});

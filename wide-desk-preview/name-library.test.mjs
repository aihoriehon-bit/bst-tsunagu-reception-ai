import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAME_RECORDINGS, recordedName, nameVoiceDescription } from './name-library.mjs';
import { nameLine } from './name-voice.js';
import { decodePCM16 } from './kana-name.mjs';

test('over 300 complete name recordings exist and have bounded audible PCM', () => {
  assert.ok(NAME_RECORDINGS.length >= 300);
  assert.equal(new Set(NAME_RECORDINGS.map(x => x.reading)).size, NAME_RECORDINGS.length);
  for (const entry of NAME_RECORDINGS) {
    const bytes = readFileSync(new URL(entry.audio, import.meta.url));
    const pcm = decodePCM16(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const seconds = pcm.samples.length / pcm.rate;
    let peak = 0; for (const n of pcm.samples) peak = Math.max(peak, Math.abs(n));
    assert.ok(seconds > .4 && seconds < 6, entry.reading);
    assert.ok(peak > 100 && peak < 32767, entry.reading);
  }
});
test('explicit readings control pronunciation; ambiguous kanji and full names are never guessed', () => {
  assert.equal(recordedName({ name: '鈴木' }).reading, 'すずき');
  assert.equal(recordedName({ name: '山崎' }), null);
  assert.equal(recordedName({ name: '山崎', reading: 'ヤマサキ' }).reading, 'やまさき');
  assert.equal(recordedName({ name: '山崎', reading: 'やまざき' }).reading, 'やまざき');
  assert.equal(recordedName({ name: '高橋太郎' }), null);
  assert.equal(recordedName({ name: '鈴木', reading: 'みしゅうろく' }), null);
  assert.match(nameVoiceDescription({ name: '鈴木' }), /収録済み/);
  assert.match(nameVoiceDescription({ name: '未収録' }), /未収録/);
});
test('whole-name audio is selected without building kana for every visitor role', async () => {
  for (const role of ['employee', 'guest', 'delivery']) {
    const line = await nameLine({ name: '絵美太', reading: 'えみた', role });
    assert.equal(line.audio, recordedName({ reading: 'えみた' }).audio);
    assert.equal(line.text, '絵美太さん。');
    assert.ok(!line.audio.startsWith('blob:'));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembleName, tokenizeReading, readingFor, normalizeReading, decodePCM16, kanaNameAudio } from './kana-name.mjs';
const manifest = JSON.parse(readFileSync(new URL('./audio/kana/bank.json', import.meta.url)));
const file = readFileSync(new URL('./audio/kana/bank.wav', import.meta.url));
const { samples, rate } = decodePCM16(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
test('all recorded units have complete audible PCM without clipping', () => {
  assert.equal(rate, 24000); assert.equal(Object.keys(manifest.entries).length, 140);
  for (const [token, entry] of Object.entries(manifest.entries)) {
    assert.ok(entry.start >= 0 && entry.frames > 0 && entry.start + entry.frames <= samples.length, token);
    const pcm = samples.slice(entry.start, entry.start + entry.frames);
    const peak = pcm.reduce((n, x) => Math.max(n, Math.abs(x)), 0);
    assert.ok(peak > 100 && peak < 32767, token);
  }
});
test('kana names, compounds, voiced sounds, long vowels and geminates are supported', () => {
  for (const [reading, expected] of [
    ['えみた', ['え', 'み', 'た']], ['ｷｮｳｺ', ['きょ', 'う', 'こ']], ['ジョージ', ['じょ', 'お', 'じ']],
    ['りゅういち', ['りゅ', 'う', 'い', 'ち']], ['はっとり', ['は', 'っ', 'と', 'り']],
    ['ウィリアム', ['うぃ', 'り', 'あ', 'む']], ['ぢゅん', ['じゅ', 'ん']], ['ゑみ', ['え', 'み']],
  ]) assert.deepEqual(tokenizeReading(reading, manifest.entries), expected);
});
test('names never need a WAV upload; kana names themselves provide the reading', () => {
  assert.equal(readingFor({ name: 'えみた' }), 'えみた');
  assert.equal(readingFor({ name: '山本', reading: 'ヤマモト' }), 'やまもと');
  assert.equal(readingFor({ name: '佐藤' }), 'さとう');
  assert.equal(normalizeReading(' えみたさん。 '), 'えみた');
  assert.equal(normalizeReading(' エミタサン。 '), 'えみた');
});
test('unreadable input is rejected instead of dropping sounds or reading kanji incorrectly', () => {
  for (const value of ['山本', '', 'a', 'ーえ', 'えっ', 'ゃま', 'え'.repeat(41)]) assert.throws(() => tokenizeReading(value, manifest.entries));
});
test('names assemble into a single WAV including honorific with quiet boundaries', () => {
  for (const name of ['えみた', 'きょうこ', 'はっとり', 'ジョージ']) {
    const wav = assembleName(name, manifest, samples), decoded = decodePCM16(wav.buffer);
    assert.equal(decoded.rate, 24000);
    assert.ok(decoded.samples.length > 20000 && decoded.samples.length < 100000);
    assert.equal(decoded.samples[0], 0); assert.equal(decoded.samples.at(-1), 0);
  }
});
test('runtime needs only static bank files, retries failed loading and caches locally assembled names', async () => {
  const originalFetch = globalThis.fetch; const requested = [];
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(kanaNameAudio({ name: 'えみた' }), /offline/);
    globalThis.fetch = async url => {
      requested.push(String(url));
      return new Response(String(url).includes('bank.json') ? JSON.stringify(manifest) : file);
    };
    const url = await kanaNameAudio({ name: '絵美太', reading: 'えみた' });
    assert.match(url, /^blob:/);
    assert.equal(await kanaNameAudio({ name: 'えみた' }), url);
    assert.equal(requested.length, 2);
    assert.ok(requested.every(url => /audio\/kana\/bank\.(json|wav)\?v=3$/.test(url)));
    const wav = await (await originalFetch(url)).arrayBuffer();
    assert.ok(decodePCM16(wav).samples.length > 10000);
    await assert.rejects(kanaNameAudio({ name: '未指定' }), /読みがな/);
  } finally { globalThis.fetch = originalFetch; }
});

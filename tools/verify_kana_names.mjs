import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePCM16, encodePCM16, assembleName } from '../wide-desk-preview/kana-name.mjs';
const root = new URL('../', import.meta.url);
const file = readFileSync(new URL('wide-desk-preview/audio/kana/bank.wav', root));
const { samples } = decodePCM16(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const manifest = JSON.parse(readFileSync(new URL('wide-desk-preview/audio/kana/bank.json', root)));
const withGreeting = process.argv.includes('--greeting');
const out = new URL(withGreeting ? 'qa/kana-names-greetings/' : 'qa/kana-names/', root); mkdirSync(out, { recursive: true });
const greetingFile = readFileSync(new URL('assets/motion-preview/audio/voicevox-20260909/employeeGeneric.wav', root));
const greeting = decodePCM16(greetingFile.buffer.slice(greetingFile.byteOffset, greetingFile.byteOffset + greetingFile.byteLength));
for (const name of ['えみた', 'やまもとはなこ', 'きょうこ', 'しょうた', 'りゅういち', 'しんじ', 'はっとり', 'ジョージ', 'ウィリアム', 'おおの', 'さとう', 'ふくだ']) {
  let wav = assembleName(name, manifest, samples);
  if (withGreeting) {
    const decoded = decodePCM16(wav.buffer);
    if (greeting.rate !== decoded.rate) throw Error('Sample rate mismatch');
    const joined = new Int16Array(decoded.samples.length + 7200 + greeting.samples.length);
    joined.set(decoded.samples); joined.set(greeting.samples, decoded.samples.length + 7200);
    wav = encodePCM16(joined, decoded.rate);
  }
  const pcm = decodePCM16(wav.buffer);
  const peak = pcm.samples.reduce((n, x) => Math.max(n, Math.abs(x)), 0);
  if (peak <= 100 || peak >= 32767) throw Error('Invalid waveform: ' + name);
  writeFileSync(new URL(name + '.wav', out), wav);
  console.log(name, (pcm.samples.length / pcm.rate).toFixed(2), 'seconds', peak);
}

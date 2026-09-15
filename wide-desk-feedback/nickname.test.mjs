import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordedName, nameVoiceDescription } from './name-library.mjs';
import { nameLine } from './name-voice.js';
test('Makkii spelling variants select the whole VOICEVOX recording for all face roles', async () => {
  for (const name of ['まっきぃ','まっきい','まっきー','マッキィ','マッキイ','マッキー']) {
    for (const role of ['employee','guest','delivery']) {
      for (const person of [{name,role},{name:'登録名',reading:name,role}]) {
        assert.equal(recordedName(person)?.reading,'まっきぃ');
        assert.match(nameVoiceDescription(person),/収録済み/);
        const line=await nameLine(person);
        assert.equal(line.audio,'../wide-desk-feedback/audio/nameMakkii.mp3');
        assert.equal(line.spokenText,undefined);
      }
    }
  }
});
test('Makkii is a valid complete compressed recording, not single-kana synthesis', () => {
  const mp3=readFileSync(new URL('./audio/nameMakkii.mp3',import.meta.url));
  assert.equal(mp3.subarray(0,3).toString(),'ID3');
  const report=JSON.parse(readFileSync(new URL('./audio/generation.json',import.meta.url))).nameMakkii;
  assert.equal(report.speaker,'VOICEVOX:春日部つむぎ');
  assert.ok(report.seconds>.5 && report.seconds<4);
  assert.match(report.kana,/マ.*ッ.*キ/);
});

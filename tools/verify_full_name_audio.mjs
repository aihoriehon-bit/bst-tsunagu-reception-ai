import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recordedName } from '../wide-desk-preview/name-library.mjs';
import { NAME_JOIN_POINTS } from '../wide-desk-preview/name-join-data.mjs';
import { joinNameSamples } from '../wide-desk-preview/full-name-audio.mjs';
const out = new URL('../qa/full-name-audio/', import.meta.url); mkdirSync(out, { recursive: true });
for (const [surname, given] of [['ふくだ', 'たける'], ['ひらい', 'まきお'], ['すずき', 'えみた'], ['わだ', 'たかし'], ['くさま', 'たけき'], ['あんざい', 'さくら']]) {
  const parts = [surname, given].map(reading => {
    const path = new URL('../wide-desk-preview/' + recordedName({ reading }).audio, import.meta.url);
    const bytes = execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', fileURLToPath(path), '-ac', '1', '-ar', '24000', '-f', 'f32le', 'pipe:1']);
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  });
  const wav = joinNameSamples(...parts, NAME_JOIN_POINTS[surname], NAME_JOIN_POINTS[given], 24000);
  writeFileSync(new URL(surname + given + 'さん.wav', out), wav);
  console.log(surname + given + 'さん', (wav.length - 44) / 48000);
}

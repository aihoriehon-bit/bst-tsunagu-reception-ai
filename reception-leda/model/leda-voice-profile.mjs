// Production profile approved after the owner reviewed the local model/voice preview.
import { configureLedaNameBank } from '../app/name-library.mjs?v=20261006-leda-names-1';
if (!['localhost', '127.0.0.1', '[::1]', 'aihoriehon-bit.github.io'].includes(location.hostname)) {
  throw new Error('Leda音声の配置先が一致しません');
}
const response = await fetch(new URL('./leda-audio-manifest.json?v=20261006-leda-1', import.meta.url));
if (!response.ok) throw new Error('Leda音声の設定を読み込めません');
export const ledaProfile = await response.json();
const nameResponse = await fetch(new URL('./leda-name-manifest.json?v=20261006-leda-names-1', import.meta.url));
if (!nameResponse.ok) throw new Error('Leda名前音声の設定を読み込めません');
export const ledaNameProfile = await nameResponse.json();
configureLedaNameBank(ledaNameProfile.entries);
const available = new Map(ledaProfile.lines.map(line => [line.key, line]));

export function ledaAudioURL(key) {
  if (!available.has(key)) throw new Error(`Leda音声が未収録です: ${key}`);
  return new URL(`./leda-audio/${key}.wav?v=20261006-leda-1`, import.meta.url).href;
}

export function applyLedaSpeechLines(lines) {
  for (const [key, line] of Object.entries(lines)) {
    const recorded = available.get(key);
    if (!recorded) {
      if (ledaProfile.unusedLegacyKeys.includes(key)) {
        delete lines[key];
        continue;
      }
      throw new Error(`確認版のLeda音声が不足しています: ${key}`);
    }
    if (line.text !== recorded.text) throw new Error(`台本とLeda音声が一致しません: ${key}`);
    lines[key] = { ...line, audio: new URL(`./leda-audio/${key}.wav`, import.meta.url).href };
  }
}

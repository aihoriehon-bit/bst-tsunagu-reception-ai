import { NAME_JOIN_POINTS } from './name-join-data.mjs?v=20260911-fullname-1';
import { encodePCM16 } from './kana-name.mjs?v=20260909-5';

export function canJoinNames(first, last) {
  return Boolean(first && last && NAME_JOIN_POINTS[first.reading] && NAME_JOIN_POINTS[last.reading]);
}
export function joinNameSamples(first, last, firstPoints, lastPoints, rate) {
  const scale = rate / 24000;
  for (const [pcm, points] of [[first, firstPoints], [last, lastPoints]]) {
    if (!points || Math.abs(pcm.length - points[2] * scale) > rate * .025) throw new Error('名前音声の長さが一致しません。ページを再読み込みしてください。');
  }
  const prefix = first.slice(0, Math.round(firstPoints[1] * scale));
  const suffix = last.slice(Math.round(lastPoints[0] * scale));
  // Only remove the recorded surname honorific, not the surname's last mora.
  // A short pause and 4 ms edge fades avoid clicks without overlapping speech.
  const gap = Math.round(rate * .07), fade = Math.round(rate * .004);
  const joined = new Int16Array(prefix.length + gap + suffix.length);
  for (let i = 0; i < prefix.length; i++) joined[i] = Math.round(Math.max(-1, Math.min(1, prefix[i])) * 32767 * Math.min(1, (prefix.length - 1 - i) / fade));
  for (let i = 0; i < suffix.length; i++) joined[prefix.length + gap + i] = Math.round(Math.max(-1, Math.min(1, suffix[i])) * 32767 * Math.min(1, i / fade));
  return encodePCM16(joined, rate);
}
const cache = new Map();
export async function fullNameAudio(first, last) {
  if (!canJoinNames(first, last)) return null;
  const key = JSON.stringify([first.reading, last.reading]);
  if (cache.has(key)) return cache.get(key);
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) throw new Error('このブラウザではフルネーム音声を準備できません。Chrome等の対応ブラウザをご利用ください。');
  const context = new AudioContext();
  try {
    const decoded = await Promise.all([first, last].map(async part => {
      const response = await fetch(new URL(part.audio, import.meta.url), { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('名前音声を読み込めません。通信状態をご確認ください。');
      return context.decodeAudioData(await response.arrayBuffer());
    }));
    const wav = joinNameSamples(decoded[0].getChannelData(0), decoded[1].getChannelData(0), NAME_JOIN_POINTS[first.reading], NAME_JOIN_POINTS[last.reading], context.sampleRate);
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    cache.set(key, url);
    if (cache.size > 60) { const old = cache.keys().next().value; URL.revokeObjectURL(cache.get(old)); cache.delete(old); }
    return url;
  } finally { await context.close(); }
}

import { encodePCM16 } from './kana-name.mjs?v=20260909-5';

const validTiming = part => part?.voice === 'Gemini Leda'
  && Number.isFinite(part.joinTiming?.startSeconds)
  && Number.isFinite(part.joinTiming?.endSeconds)
  && Number.isFinite(part.joinTiming?.durationSeconds)
  && part.joinTiming.startSeconds >= 0
  && part.joinTiming.endSeconds > part.joinTiming.startSeconds
  && part.joinTiming.endSeconds <= part.joinTiming.durationSeconds;
export function canJoinNames(surname, given) {
  return Boolean(surname?.voice === 'Gemini Leda'
    && surname.surnameStem?.audio && surname.surnameStem?.sha256
    && Number.isFinite(surname.surnameStem.durationSeconds)
    && surname.surnameStem.durationSeconds > .1
    && validTiming(given) && given.audio && given.sha256);
}
export function joinLedaNameSamples(stem, given, stemInfo, timing, rate) {
  if (!Number.isFinite(rate) || rate <= 0
    || !Number.isFinite(stemInfo?.durationSeconds)
    || !Number.isFinite(timing?.durationSeconds)
    || !Number.isFinite(timing?.startSeconds) || !Number.isFinite(timing?.endSeconds)
    || timing.startSeconds < 0 || timing.endSeconds > timing.durationSeconds
    || Math.abs(stem.length / rate - stemInfo.durationSeconds) > .04
    || Math.abs(given.length / rate - timing.durationSeconds) > .04) {
    throw new Error('名前音声の長さが一致しません。ページを再読み込みしてください。');
  }
  const start = Math.round(timing.startSeconds * rate);
  const end = Math.min(given.length, Math.round(timing.endSeconds * rate));
  if (start < 0 || end <= start) throw new Error('名前の結合位置が正しくありません。');
  const gap = Math.round(rate * .060), fade = Math.round(rate * .004);
  const prefixLength = Math.min(stem.length, Math.round(stemInfo.durationSeconds * rate));
  const output = new Int16Array(prefixLength + gap + end - start);
  for (let i = 0; i < prefixLength; i++) {
    const gain = Math.min(1, (prefixLength - 1 - i) / fade);
    output[i] = Math.round(Math.max(-1, Math.min(1, stem[i])) * 32767 * gain);
  }
  for (let i = start; i < end; i++) {
    const gain = Math.min(1, (i - start) / fade);
    output[prefixLength + gap + i - start] = Math.round(Math.max(-1, Math.min(1, given[i])) * 32767 * gain);
  }
  return encodePCM16(output, rate);
}
const cache = new Map();
export async function fullNameAudio(surname, given) {
  if (!canJoinNames(surname, given)) return null;
  const key = JSON.stringify([surname.surnameStem.sha256, given.sha256, given.joinTiming]);
  if (cache.has(key)) return cache.get(key);
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw new Error('このブラウザではフルネーム音声を準備できません。');
  const context = new Context({ sampleRate: 24000 });
  try {
    const decoded = await Promise.all([surname.surnameStem, given].map(async part => {
      const response = await fetch(new URL(part.audio, import.meta.url), { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('フルネーム音声を読み込めません。');
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== part.sha256) throw new Error('名前音声の内容が一致しません。');
      const buffer = await context.decodeAudioData(bytes);
      if (buffer.numberOfChannels !== 1) throw new Error('名前音声の形式が一致しません。');
      return buffer;
    }));
    const wav = joinLedaNameSamples(decoded[0].getChannelData(0), decoded[1].getChannelData(0),
      surname.surnameStem, given.joinTiming, context.sampleRate);
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    if (cache.has(key)) { URL.revokeObjectURL(url); return cache.get(key); }
    cache.set(key, url);
    if (cache.size > 60) {
      const oldest = cache.keys().next().value;
      URL.revokeObjectURL(cache.get(oldest)); cache.delete(oldest);
    }
    return url;
  } finally { await context.close(); }
}

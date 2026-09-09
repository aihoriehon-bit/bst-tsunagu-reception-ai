const ALIASES = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', ゎ: 'わ', ゐ: 'い', ゑ: 'え', ゕ: 'か', ゖ: 'け', ぢゃ: 'じゃ', ぢゅ: 'じゅ', ぢょ: 'じょ', ぢぇ: 'じぇ' };
export const DEFAULT_READINGS = { 佐藤: 'さとう', 田中: 'たなか', 福田: 'ふくだ' };
export function normalizeReading(value) {
  return String(value || '').normalize('NFKC').trim()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/(?:さん|さま|様)[。\s]*$/, '').replace(/[\s・･。]/g, '');
}
export function readingFor(person) {
  const name = String(person?.name || '').normalize('NFKC').replace(/\s/g, '').replace(/(?:さん|様|さま)$/, '');
  return normalizeReading(person?.reading || DEFAULT_READINGS[name] || name);
}
export function tokenizeReading(reading, entries) {
  const text = normalizeReading(reading);
  if (!text || text.length > 40) throw new Error('読みがなを1〜40文字で入力してください。');
  if (!/^[ぁ-ゖー]+$/.test(text)) throw new Error('漢字のお名前は、読みがなをひらがな・カタカナで入力してください。');
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const pair = text.slice(i, i + 2), alias = ALIASES[pair];
    if (pair.length === 2 && (entries[pair] || (alias && entries[alias]))) { tokens.push(alias || pair); i += 2; continue; }
    const ch = ALIASES[text[i]] || text[i]; i++;
    if (ch === 'ー') {
      const vowel = entries[tokens.at(-1)]?.vowel;
      const token = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' }[vowel];
      if (!token) throw new Error('伸ばす音「ー」は、声の音の後に入力してください。');
      tokens.push(token);
    } else if (ch === 'っ') {
      if (!tokens.length || i === text.length) throw new Error('小さい「っ」は名前の途中に入力してください。');
      tokens.push('っ');
    } else if (entries[ch]) tokens.push(ch);
    else throw new Error(`「${ch}」の読みを確認してください。小さい「ゃ・ゅ・ょ」は前の文字と組み合わせます。`);
  }
  return tokens;
}
export function decodePCM16(buffer) {
  const view = new DataView(buffer), str = (at, n) => String.fromCharCode(...new Uint8Array(buffer, at, n));
  if (view.byteLength < 44 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') throw new Error('音声データの形式が正しくありません。');
  let rate = 0, samples;
  for (let at = 12; at + 8 <= view.byteLength;) {
    const size = view.getUint32(at + 4, true), start = at + 8;
    if (start + size > view.byteLength) throw new Error('音声データが途中で切れています。');
    const id = str(at, 4);
    if (id === 'fmt ') {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new Error('対応しない音声形式です。');
      rate = view.getUint32(start + 4, true);
    }
    if (id === 'data') {
      samples = new Int16Array(Math.floor(size / 2));
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(start + i * 2, true);
    }
    at = start + size + (size % 2);
  }
  if (!rate || !samples) throw new Error('音声データを読み込めません。');
  return { rate, samples };
}
export function encodePCM16(samples, rate = 24000) {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const str = (at, text) => [...text].forEach((c, i) => bytes[at + i] = c.charCodeAt(0));
  str(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x))), true));
  return bytes;
}
export function assembleName(reading, manifest, pcm) {
  const tokens = [...tokenizeReading(reading, manifest.entries), 'さん'];
  const parts = [new Int16Array(960)];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === 'っ') { parts.push(new Int16Array(2400)); continue; }
    const entry = manifest.entries[token];
    if (!entry || entry.start + entry.frames > pcm.length) throw new Error('名前の音声データが不足しています。');
    // A modest initial rise; preserve the recorded honorific's falling intonation.
    const speed = index === 0 && tokens.length > 2 ? .95 : 1;
    const part = new Int16Array(Math.floor(entry.frames / speed));
    for (let i = 0; i < part.length; i++) {
      const pos = Math.min(entry.frames - 1, i * speed), j = Math.floor(pos), f = pos - j;
      const sample = pcm[entry.start + j] * (1 - f) + pcm[entry.start + Math.min(j + 1, entry.frames - 1)] * f;
      const fade = Math.min(1, i / 48, (part.length - 1 - i) / 48);
      part[i] = Math.round(sample * fade);
    }
    parts.push(part);
  }
  parts.push(new Int16Array(2400));
  const joined = new Int16Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0;
  for (const p of parts) { joined.set(p, at); at += p.length; }
  const peak = joined.reduce((n, x) => Math.max(n, Math.abs(x)), 0);
  const gain = peak ? Math.min(2, 16000 / peak) : 1;
  for (let i = 0; i < joined.length; i++) joined[i] = Math.round(joined[i] * gain);
  return encodePCM16(joined, manifest.sampleRate);
}
let bankPromise = null;
export function loadKanaBank() {
  if (!bankPromise) bankPromise = (async () => {
    const responses = await Promise.all(['bank.json', 'bank.wav'].map(file => fetch(new URL('./audio/kana/' + file + '?v=3', import.meta.url), { signal: AbortSignal.timeout(12000) })));
    if (responses.some(r => !r.ok)) throw new Error('名前音声を読み込めません。通信状態をご確認ください。');
    const [manifest, buffer] = await Promise.all([responses[0].json(), responses[1].arrayBuffer()]);
    const pcm = decodePCM16(buffer);
    if (pcm.rate !== manifest.sampleRate) throw new Error('名前の音声形式が一致しません。');
    return { manifest, pcm: pcm.samples };
  })().catch(error => { bankPromise = null; throw error; });
  return bankPromise;
}
const cache = new Map();
export async function kanaNameAudio(person) {
  const reading = readingFor(person);
  const { manifest, pcm } = await loadKanaBank();
  if (!cache.has(reading)) {
    const wav = assembleName(reading, manifest, pcm);
    cache.set(reading, URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    if (cache.size > 60) { const key = cache.keys().next().value; URL.revokeObjectURL(cache.get(key)); cache.delete(key); }
  }
  return cache.get(reading);
}

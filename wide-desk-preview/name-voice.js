import { kanaNameAudio, readingFor } from './kana-name.mjs?v=20260909-5';
import { shouldCallName } from './name-confirmation.mjs?v=20260910-1';
import { recordedName } from './name-library.mjs?v=20260910-1';
// Existing uploaded WAVs stay stored, but reading alone now selects VOICEVOX audio.
const database = () => new Promise((resolve, reject) => {
  let expired = false;
  const timer = setTimeout(() => { expired = true; reject(new Error('音声の保存先を開けませんでした。')); }, 4000);
  const request = indexedDB.open('tsunagu-preview-name-voices-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('audio');
  request.onsuccess = () => { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result); };
  request.onerror = () => { clearTimeout(timer); reject(request.error); };
});
async function record(id, mode = 'readonly', value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('audio', mode), store = tx.objectStore('audio');
      const req = mode === 'readonly' ? store.get(id) : value ? store.put(value, id) : store.delete(id);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('音声を保存できませんでした。'));
    });
  } finally { db.close(); }
}
const urls = new Map();
export async function saveNameAudio(id, file) {
  if (file.size > 3 * 1024 * 1024 || !/\.wav$/i.test(file.name)) throw new Error('3MB以下のWAVを選んでください。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (at, n) => String.fromCharCode(...bytes.slice(at, at + n));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('WAV音声として読み込めません。');
  const context = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await context.decodeAudioData(bytes.buffer.slice(0));
    if (decoded.duration < 0.2 || decoded.duration > 15) throw new Error('名前だけを呼ぶ、15秒以内の音声を選んでください。');
  } finally { await context.close(); }
  await record(id, 'readwrite', new Blob([bytes], { type: 'audio/wav' }));
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}
export async function deleteNameAudio(id) {
  await record(id, 'readwrite');
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}
export const callName = value => String(value || '').trim().replace(/(?:さん|様|さま)[。\s]*$/, '') + 'さん';
export async function nameLine(person, { audition = false } = {}) {
  if (!person?.name) return null;
  if (!audition && !shouldCallName(person)) throw new Error('この方の名前呼びはOFFです。');
  let audio;
  const name = person.name.normalize('NFKC').replace(/\s/g, '').replace(/(?:さん|様|さま)$/, '');
  const usualReading = { 佐藤: 'さとう', 田中: 'たなか', 福田: 'ふくだ' };
  if (usualReading[name] && readingFor(person) === usualReading[name]) {
    audio = './audio/' + ({ 佐藤: 'nameSato', 田中: 'nameTanaka', 福田: 'nameFukuda' })[name] + '.wav';
  }
  audio ||= recordedName(person)?.audio;
  audio ||= await kanaNameAudio(person);
  return { text: callName(person.name) + '。', audio, group: 'named' };
}
let utterance = null, previewAudio = null, cancelPreview = null, previewRequest = 0;
export function cancelNameVoice() {
  previewRequest++;
  cancelPreview?.(); cancelPreview = null;
  if (utterance) { utterance.onend = utterance.onerror = utterance.onstart = null; window.speechSynthesis?.cancel(); utterance = null; }
  if (previewAudio) { previewAudio.pause(); previewAudio = null; }
}
export function speakDeviceName(text, { onstart, onend, onerror } = {}) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { onerror?.(); return; }
  const u = new SpeechSynthesisUtterance(text); utterance = u;
  u.lang = 'ja-JP'; u.rate = 0.95;
  const voices = window.speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang));
  u.voice = voices.find(v => v.localService) || voices[0] || null;
  u.onstart = onstart;
  u.onend = () => { if (utterance === u) utterance = null; onend?.(); };
  u.onerror = () => { if (utterance === u) utterance = null; onerror?.(); };
  window.speechSynthesis.speak(u);
}
export async function previewName(person) {
  cancelNameVoice();
  const own = previewRequest;
  const line = await nameLine(person, { audition: true });
  if (!line || own !== previewRequest) return false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('音声の再生を完了できませんでした。')); cancelNameVoice(); }, 18000);
    cancelPreview = () => { clearTimeout(timer); resolve(false); };
    const finish = failed => { if (own !== previewRequest) return; clearTimeout(timer); cancelPreview = null; failed ? reject(new Error('音声を再生できません。')) : resolve(true); };
    if (line.audio) {
      const audio = new Audio(line.audio); previewAudio = audio;
      audio.onended = () => finish(false); audio.onerror = () => finish(true);
      audio.play().catch(() => finish(true));
    } else speakDeviceName(line.spokenText, { onend: () => finish(false), onerror: () => finish(true) });
  });
}

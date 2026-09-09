import { respond } from './dialogue.mjs?v=20260909-3';
import { createHandsfree } from './handsfree.mjs?v=20260909-6';
import { conversationCue } from './conversation-cue.mjs?v=20260909-6';
const texts = await fetch(new URL('./dialogue-lines.json?v=20260909-2', import.meta.url)).then(r => {
  if (!r.ok) throw new Error('会話の台本を読み込めません');
  return r.json();
});
export const DIALOGUE_LINES = Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, {
  text, audio: `./audio/${key}.wav`, group: 'attend',
}]));

export function createConversation({ onSpeak, onInterrupt, onEnableAudio, available }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const PREF = 'tsunagu-preview-handsfree-enabled';
  let enabled = false, active = false, present = false, speaking = false, audible = true, state = {}, epoch = 0, micStatus = 'waiting';
  let issue = '';
  try { enabled = localStorage.getItem(PREF) === 'true'; } catch { /* optional preference */ }
  const panel = document.createElement('section'); panel.className = 'conversation handsfree-conversation';
  panel.setAttribute('aria-label', '音声会話');
  panel.innerHTML = `<div class="turn-cue" role="status" aria-live="polite" aria-atomic="true"><span class="turn-label"></span><strong class="conversation-status"></strong><p class="turn-detail"></p></div>
    <div class="handsfree-summary"><button type="button" data-enable>マイクを許可</button><button type="button" data-disable hidden>音声会話を停止</button></div>
    <p class="conversation-note" data-setup>初回にマイクを許可すると、カメラの挨拶後にそのまま話せます。音声入力はブラウザの認識サービスへ送信される場合があります。</p>
    <details><summary>会話内容・文字入力</summary><div id="conversationBody">
      <p class="conversation-note">用件・配達・会社案内などの会話デモです。実際の呼び出し・予約・伝言送信は行いません。会話内容は保存しません。</p>
      <div class="conversation-log" role="log" aria-label="会話内容" aria-live="polite"></div>
      <form><label class="sr-only" for="conversationInput">つなぐへのメッセージ</label><input id="conversationInput" maxlength="300" placeholder="挨拶のあと、ご用件を入力" autocomplete="off"><button type="submit">送信</button></form>
    </div></details>`;
  document.body.append(panel);
  const q = s => panel.querySelector(s), log = q('.conversation-log'), status = q('.conversation-status'), input = q('input');
  function renderCue() {
    const cue = conversationCue({ speaking, enabled, supported: Boolean(Recognition), audible, active, present, visible: !document.hidden, micStatus, issue });
    panel.dataset.turn = cue.mode;
    // Avoid repeated live-region announcements when the cue has not changed.
    if (status.textContent === cue.title && q('.turn-detail').textContent === cue.detail) return;
    q('.turn-label').textContent = cue.label; status.textContent = cue.title; q('.turn-detail').textContent = cue.detail;
  }
  function append(who, text) {
    const p = document.createElement('p'); p.className = who === 'あなた' ? 'from-visitor' : 'from-tsunagu';
    const label = document.createElement('strong'); label.textContent = who + '：';
    p.append(label, document.createTextNode(text)); log.append(p);
    while (log.children.length > 30) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  const listener = createHandsfree({ Recognition, onText: submit, onStatus(code) {
    micStatus = code;
    renderCue();
    if (['permission', 'network', 'unavailable'].includes(code)) {
      q('[data-enable]').hidden = false;
      q('[data-enable]').textContent = code === 'network' ? '再接続' : 'マイクを許可';
    }
  } });
  function sync() {
    listener.update({ enabled, active, present, speaking, audible, visible: !document.hidden });
    input.disabled = !active || !present; q('form button').disabled = !active || !present;
    q('[data-disable]').hidden = !enabled || !Recognition;
    q('[data-enable]').hidden = !Recognition || (enabled && !listener.blocked);
    q('[data-setup]').hidden = enabled;
    renderCue();
  }
  function submit(text) {
    text = String(text).trim().slice(0, 300);
    if (!text || !active || !present || !available() || document.hidden) return;
    issue = ''; speaking = true; sync(); onInterrupt(); input.value = ''; append('あなた', text);
    const result = respond(text, state); state = result.state;
    const own = ++epoch; append('つなぐ', texts[result.key]);
    onSpeak(result.key, () => {
      if (own !== epoch || !active) return;
      speaking = false; sync();
    }, () => {
      if (own !== epoch || !active) return;
      speaking = true; sync();
      issue = '返答音声を再生できません。右上の音声ボタンをご確認ください。'; renderCue();
    });
  }
  function close() {
    active = false; epoch++; state = {}; speaking = false; issue = ''; listener.update({ active: false });
    log.replaceChildren(); input.value = ''; sync();
  }
  q('[data-enable]').addEventListener('click', async () => {
    if (!Recognition) return;
    q('[data-enable]').disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      stream.getTracks().forEach(track => track.stop());
      enabled = true; issue = ''; micStatus = 'preparing';
      try { localStorage.setItem(PREF, 'true'); } catch { /* This session still works. */ }
      listener.retry(); onEnableAudio(); sync();
    } catch { issue = 'マイクを許可できませんでした。ブラウザのマイク設定をご確認ください。'; renderCue(); }
    finally { q('[data-enable]').disabled = false; }
  });
  q('[data-disable]').addEventListener('click', () => {
    enabled = false; issue = '';
    try { localStorage.setItem(PREF, 'false'); } catch { /* Always stop. */ }
    sync();
  });
  q('form').addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { close(); onInterrupt(); } else sync(); });
  window.addEventListener('pagehide', close);
  sync();
  return {
    get active() { return active; },
    close,
    beginReception() { if (!active) { state = {}; log.replaceChildren(); } active = true; speaking = false; sync(); },
    setPresence(value) { if (present !== value) { present = value; sync(); } },
    setAudible(value) { audible = value; issue = ''; sync(); },
    speechStarted() { speaking = true; issue = ''; micStatus = 'preparing'; sync(); },
    speechFinished() { speaking = false; sync(); },
  };
}

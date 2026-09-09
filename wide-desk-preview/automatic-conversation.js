import { respond } from './dialogue.mjs?v=20260909-3';
import { createHandsfree } from './handsfree.mjs?v=20260909-3';
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
  try { enabled = localStorage.getItem(PREF) === 'true'; } catch { /* optional preference */ }
  const panel = document.createElement('section'); panel.className = 'conversation handsfree-conversation';
  panel.setAttribute('aria-label', '音声会話');
  panel.innerHTML = `<div class="handsfree-summary"><span class="conversation-status" role="status"></span><button type="button" data-enable>マイクを許可</button><button type="button" data-disable hidden>音声会話を停止</button></div>
    <p class="conversation-note" data-setup>初回にマイクを許可すると、カメラの挨拶後にそのまま話せます。音声入力はブラウザの認識サービスへ送信される場合があります。</p>
    <details><summary>会話内容・文字入力</summary><div id="conversationBody">
      <p class="conversation-note">用件・配達・会社案内などの会話デモです。実際の呼び出し・予約・伝言送信は行いません。会話内容は保存しません。</p>
      <div class="conversation-log" role="log" aria-label="会話内容" aria-live="polite"></div>
      <form><label class="sr-only" for="conversationInput">つなぐへのメッセージ</label><input id="conversationInput" maxlength="300" placeholder="挨拶のあと、ご用件を入力" autocomplete="off"><button type="submit">送信</button></form>
    </div></details>`;
  document.body.append(panel);
  const q = s => panel.querySelector(s), log = q('.conversation-log'), status = q('.conversation-status'), input = q('input');
  const labels = { listening: 'お話しください', waiting: 'お話をお待ちしています', permission: '「マイクを許可」を押してください', unavailable: '音声入力を利用できません。文字入力でも確認できます', network: '聞き取りの接続が切れました。再接続してください' };
  function append(who, text) {
    const p = document.createElement('p'); p.className = who === 'あなた' ? 'from-visitor' : 'from-tsunagu';
    const label = document.createElement('strong'); label.textContent = who + '：';
    p.append(label, document.createTextNode(text)); log.append(p);
    while (log.children.length > 30) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  const listener = createHandsfree({ Recognition, onText: submit, onStatus(code) {
    micStatus = code;
    status.textContent = labels[code] || code;
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
    if (!Recognition) status.textContent = 'このブラウザは音声入力非対応です。文字入力をご利用ください';
    else if (!enabled) status.textContent = '自動の音声会話：停止中';
    else if (!audible) status.textContent = '右上の音声をONにすると会話できます';
    else if (!active) status.textContent = 'カメラの挨拶後に聞き取ります';
    else if (!present) status.textContent = '来訪者を確認中…';
    else if (speaking) status.textContent = 'つなぐが話しています…';
    else if (!listener.blocked) status.textContent = labels[micStatus] || '聞き取りを準備しています…';
  }
  function submit(text) {
    text = String(text).trim().slice(0, 300);
    if (!text || !active || !present || !available() || document.hidden) return;
    speaking = true; sync(); onInterrupt(); input.value = ''; append('あなた', text);
    const result = respond(text, state); state = result.state;
    const own = ++epoch; append('つなぐ', texts[result.key]);
    onSpeak(result.key, () => {
      if (own !== epoch || !active) return;
      speaking = false; sync();
    }, () => {
      if (own !== epoch || !active) return;
      speaking = true; sync();
      status.textContent = '返答音声を再生できません。右上の音声ボタンをご確認ください';
    });
  }
  function close() {
    active = false; epoch++; state = {}; speaking = false; listener.update({ active: false });
    log.replaceChildren(); input.value = ''; sync();
  }
  q('[data-enable]').addEventListener('click', async () => {
    if (!Recognition) return;
    q('[data-enable]').disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      stream.getTracks().forEach(track => track.stop());
      enabled = true;
      try { localStorage.setItem(PREF, 'true'); } catch { /* This session still works. */ }
      listener.retry(); onEnableAudio(); sync();
    } catch { status.textContent = 'マイクを許可できませんでした。ブラウザのマイク設定をご確認ください'; }
    finally { q('[data-enable]').disabled = false; }
  });
  q('[data-disable]').addEventListener('click', () => {
    enabled = false;
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
    setAudible(value) { audible = value; sync(); },
    speechStarted() { speaking = true; micStatus = 'preparing'; sync(); },
    speechFinished() { speaking = false; sync(); },
  };
}

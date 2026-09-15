import { respond, initialReceptionState, recognizeLateGuest, recognizeLateEmployee } from './dialogue.mjs?v=20260915-delivery-addressee-1';
import { createHandsfree } from './handsfree.mjs?v=20260911-distance-1';
import { conversationCue } from './conversation-cue.mjs?v=20260909-6';
import { createReceptionCard } from './reception-card.mjs?v=20260915-turn-cue-1';
import { attachPanelLayout } from './panel-layout.mjs?v=20260915-panel-size-1';
import { createTurnIndicator } from './turn-indicator.mjs?v=20260915-turn-bottom-1';
import { createMicLevel } from './mic-level.mjs?v=20260915-turn-cue-1';
const texts = await fetch(new URL('./dialogue-lines.json?v=20260915-delivery-addressee-1', import.meta.url)).then(r => {
  if (!r.ok) throw new Error('会話の台本を読み込めません');
  return r.json();
});
export const DIALOGUE_LINES = Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, {
  text, audio: `../wide-desk-feedback/audio/${key}.wav`, group: 'attend',
}]));

export function createConversation({ onSpeak, onInterrupt, onEnableAudio, onRestart, available }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const PREF = 'tsunagu-feedback-handsfree-enabled';
  let enabled = false, active = false, present = false, speaking = false, audible = true, state = {}, epoch = 0, micStatus = 'waiting';
  let issue = '';
  let voiceActivityAt = 0;
  let visitorSpeaking = false;
  let completed = false;
  const confirmation = createReceptionCard({ onAnswer: submit, onRestart: restartReception });
  const turnIndicator = createTurnIndicator();
  const micLevel = createMicLevel({ onLevel: turnIndicator.setLevel, onReady: turnIndicator.setMeterReady });
  try { enabled = localStorage.getItem(PREF) === 'true'; } catch { /* optional preference */ }
  const panel = document.createElement('section'); panel.className = 'conversation handsfree-conversation';
  panel.setAttribute('aria-label', '音声会話');
  panel.innerHTML = `<div class="turn-cue" role="status" aria-live="polite" aria-atomic="true"><span class="turn-label"></span><strong class="conversation-status"></strong><p class="turn-detail"></p></div>
    <p class="reception-question" data-question hidden></p>
    <div class="reception-summary" data-reception-summary hidden aria-live="polite"></div>
    <p class="conversation-note">確認用デモ：実際の電話・通知は行いません。</p>
    <div class="handsfree-summary"><button type="button" data-enable>マイクを許可</button><button type="button" data-disable hidden>音声会話を停止</button></div>
    <p class="conversation-note" data-setup>初回にマイクを許可すると、カメラの挨拶後にそのまま話せます。音声入力はブラウザの認識サービスへ送信される場合があります。</p>
    <details><summary>会話内容・文字入力</summary><div id="conversationBody">
      <p class="conversation-note">用件・配達・会社案内などの会話デモです。実際の呼び出し・予約・伝言送信は行いません。会話内容は保存しません。</p>
      <div class="conversation-log" role="log" aria-label="会話内容" aria-live="polite"></div>
      <form><label class="sr-only" for="conversationInput">つなぐへのメッセージ</label><input id="conversationInput" maxlength="300" placeholder="挨拶のあと、ご用件を入力" autocomplete="off"><button type="submit">送信</button></form>
    </div></details>`;
  document.body.append(panel);
  attachPanelLayout(panel);
  // Keep restart outside the collapsible/scrollable content so it remains
  // reachable after the large completion card has faded out.
  const restartButton = document.createElement('button');
  restartButton.type = 'button'; restartButton.className = 'conversation-restart';
  restartButton.textContent = 'もう一度受付を試す'; restartButton.hidden = true;
  panel.insertBefore(restartButton, panel.querySelector('.conversation-panel-content'));
  restartButton.addEventListener('click', restartReception);
  const q = s => panel.querySelector(s), log = q('.conversation-log'), status = q('.conversation-status'), input = q('input');
  function renderReception() {
    if (!completed) confirmation.show(state);
    const labels = { employee: '社員の方へのご挨拶が終わりました。お取次ぎが必要なときはお声がけください。', delivery: 'お荷物の宛先をお答えください（例：山田太郎さん）', recipient: 'お取次ぎ先をお答えください（例：山田太郎さん／誰でもいい）', visitorName: 'あなたのお名前をお答えください', purpose: 'ご用件をお答えください', confirm: '内容は合っていますか？「はい」または「訂正」', correction: '「自分の名前」「担当者」「用件」とお答えください', done: '受付完了（確認用デモ）', cancelled: '今回の受付を取り消しました', finished: 'ご用件がありましたらお声がけください' };
    const prompt = q('[data-question]'); prompt.textContent = labels[state.step] || ''; prompt.hidden = !prompt.textContent;
    const summary = q('[data-reception-summary]'); summary.replaceChildren();
    for (const [label, value] of [['お取次ぎ先', state.recipient], ['お名前', state.visitor], ['ご用件', state.purpose]]) {
      if (!value) continue;
      const row = document.createElement('p'); row.textContent = `${label}：${value}`; summary.append(row);
    }
    summary.hidden = !summary.children.length;
    if (state.step === 'done') { const note = document.createElement('p'); note.textContent = '実際の電話・通知は送信していません。受付スタッフへお声がけください。'; summary.append(note); summary.hidden = false; }
  }
  function renderCue() {
    confirmation.setSpeaking(speaking);
    if (completed) {
      turnIndicator.hide(); micLevel.setListening(false);
      q('.turn-cue').hidden = false;
      q('.turn-cue').setAttribute('aria-live', 'polite');
      panel.dataset.turn = 'waiting'; q('.turn-label').textContent = 'デモ終了';
      status.textContent = '受付デモが終了しました'; q('.turn-detail').textContent = issue || '「もう一度受付を試す」ボタンで、挨拶から再開できます。'; return;
    }
    const cue = conversationCue({ speaking, enabled, supported: Boolean(Recognition), audible, active, present, visible: !document.hidden, micStatus, issue });
    const visible = !document.hidden && (active && present || speaking);
    turnIndicator.show(cue, { visible, host: confirmation.cueHost });
    micLevel.setListening(visible && cue.mode === 'listening');
    q('.turn-cue').hidden = visible;
    q('.turn-cue').setAttribute('aria-live', visible ? 'off' : 'polite');
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
  const listener = createHandsfree({ Recognition, onText: submit, onVoiceActivity(value) { visitorSpeaking = value; voiceActivityAt = Date.now(); turnIndicator.setVoiceActivity(value); }, onStatus(code) {
    micStatus = code;
    renderCue();
    if (['permission', 'network', 'unavailable'].includes(code)) {
      q('[data-enable]').hidden = false;
      q('[data-enable]').textContent = code === 'network' ? '再接続' : 'マイクを許可';
    }
  } });
  function sync() {
    const canRestart = completed && active && present && !document.hidden && available() && typeof onRestart === 'function';
    restartButton.hidden = !completed; restartButton.disabled = !canRestart;
    confirmation.setRestartEnabled(canRestart);
    confirmation.setEnabled(active && present && !completed && !document.hidden);
    listener.update({ enabled, active: active && !completed, present, speaking, audible, visible: !document.hidden });
    input.disabled = !active || !present || completed; q('form button').disabled = !active || !present || completed;
    q('[data-disable]').hidden = !enabled || !Recognition;
    q('[data-enable]').hidden = !Recognition || (enabled && !listener.blocked);
    q('[data-setup]').hidden = enabled;
    renderCue();
  }
  function submit(text) {
    text = String(text).trim().slice(0, 300);
    if (!text || !active || !present || completed || !available() || document.hidden) return;
    voiceActivityAt = Date.now();
    issue = ''; speaking = true; sync(); onInterrupt(); input.value = ''; append('あなた', text);
    const result = respond(text, state);
    if (state.step === 'confirm' && ['chatReceived', 'chatGeneralComplete', 'chatDeliveryCall'].includes(result.key)) {
      completed = true;
      if (result.key !== 'chatDeliveryCall') result.key = 'chatDemoComplete';
      confirmation.complete();
    }
    state = result.state; renderReception(); sync();
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
    active = false; epoch++; state = {}; speaking = false; completed = false; confirmation.clear(); issue = ''; listener.update({ active: false });
    log.replaceChildren(); input.value = ''; renderReception(); sync();
  }
  async function restartReception() {
    if (!completed || !active || !present || document.hidden || !available() || typeof onRestart !== 'function') return;
    // Clear completion before invoking external callbacks: double clicks and
    // stale completion audio must not finish the newly started reception.
    close(); onInterrupt();
    try { await onRestart(); }
    catch {
      if (!present || document.hidden || active) return;
      active = true; completed = true;
      issue = '再開できませんでした。もう一度ボタンを押してください。'; sync();
    }
  }
  q('[data-enable]').addEventListener('click', async () => {
    if (!Recognition) return;
    q('[data-enable]').disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      stream.getTracks().forEach(track => track.stop());
      micLevel.permissionGranted();
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
    get canAnnounceName() { return !completed && !speaking && !visitorSpeaking && micStatus !== 'processing' && !input.value.trim() && Date.now() - voiceActivityAt > 4000; },
    close,
    recognizeVisitor(identity) {
      if (!active || !present || completed || document.hidden) return null;
      const result = recognizeLateEmployee(state, identity) || recognizeLateGuest(state, identity);
      if (!result) return null;
      state = result.state; renderReception();
      append('つなぐ', texts[result.key]);
      return result.key;
    },
    beginReception(role, identity) { if (!active) { state = initialReceptionState(role, identity); log.replaceChildren(); renderReception(); } active = true; speaking = false; sync(); },
    setPresence(value) { if (present !== value) { present = value; sync(); } },
    setAudible(value) { audible = value; issue = ''; sync(); },
    speechStarted() { speaking = true; issue = ''; micStatus = 'preparing'; sync(); },
    speechFinished() { speaking = false; sync(); },
  };
}

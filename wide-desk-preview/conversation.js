import { respond } from './dialogue.mjs?v=20260909-2';
// The generator and UI use the same approved transcript.
const texts = await fetch(new URL('./dialogue-lines.json?v=20260909-2', import.meta.url)).then(r => {
  if (!r.ok) throw new Error('会話の台本を読み込めません');
  return r.json();
});
export const DIALOGUE_LINES = Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, {
  text, audio: `./audio/${key}.wav`, group: 'attend',
}]));

export function createConversation({ onBegin, onEnd, onSpeak, onInterrupt, available }) {
  let state = {}, active = false, recognition = null, listening = false, epoch = 0;
  let micTimer = null;
  const panel = document.createElement('section'); panel.className = 'conversation';
  panel.innerHTML = `<button class="conversation-toggle" type="button" aria-expanded="false" aria-controls="conversationBody">つなぐと会話する</button>
    <div id="conversationBody" hidden>
      <div class="conversation-heading"><strong>つなぐと会話</strong><button type="button" data-close>閉じる</button></div>
      <p class="conversation-note">受付の簡単な会話デモです。実際の担当者呼び出し・予約・伝言送信は行いません。</p>
      <div class="conversation-log" role="log" aria-label="会話内容" aria-live="polite"></div>
      <div class="conversation-examples"><button type="button" data-example="担当者に会いたいです">お取次ぎ</button><button type="button" data-example="配達です">配達</button><button type="button" data-example="どんな会社ですか">会社案内</button></div>
      <form><label class="sr-only" for="conversationInput">つなぐへのメッセージ</label><input id="conversationInput" maxlength="300" placeholder="ご用件を入力してください" autocomplete="off"><button type="submit">送信</button></form>
      <div class="conversation-footer"><button type="button" data-mic>マイクで話す</button><button type="button" data-reset>最初から</button></div>
      <p class="conversation-status" role="status"></p>
      <p class="conversation-note" data-mic-note>音声入力はブラウザのサービスへ音声が送られる場合があります。会話内容はこのページを閉じると消えます。</p>
    </div>`;
  document.body.append(panel);
  const q = s => panel.querySelector(s), log = q('.conversation-log'), status = q('.conversation-status');
  const toggle = q('.conversation-toggle'), input = q('input');
  function append(who, text) {
    const p = document.createElement('p'); p.className = who === 'あなた' ? 'from-visitor' : 'from-tsunagu';
    const label = document.createElement('strong'); label.textContent = who + '：';
    p.append(label, document.createTextNode(text)); log.append(p);
    while (log.children.length > 30) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function stopMic() {
    clearTimeout(micTimer); recognition?.abort(); recognition = null; listening = false;
    q('[data-mic]').textContent = 'マイクで話す';
  }
  function reply(key) {
    const own = ++epoch; onInterrupt();
    append('つなぐ', texts[key]); status.textContent = 'つなぐが話しています…';
    onSpeak(key, () => { if (own === epoch && active) status.textContent = '続けて入力するか、マイクのボタンを押して話してください。'; }, () => {
      if (own === epoch && active) status.textContent = '音声を再生できませんでした。右上の音声ボタンをご確認ください。';
    });
  }
  function submit(text) {
    text = String(text).trim().slice(0, 300); if (!text || !active) return;
    stopMic(); input.value = ''; append('あなた', text);
    const result = respond(text, state); state = result.state; reply(result.key);
  }
  function close() {
    if (!active) return;
    active = false; epoch++; stopMic(); onInterrupt(); onEnd();
    q('#conversationBody').hidden = true; toggle.hidden = false; toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
    log.replaceChildren(); state = {}; status.textContent = '';
  }
  toggle.addEventListener('click', () => {
    if (!available()) { toggle.textContent = '読み込み完了後に会話できます'; return; }
    active = true; state = {}; onBegin();
    q('#conversationBody').hidden = false; toggle.hidden = true; toggle.setAttribute('aria-expanded', 'true');
    reply('chatHello'); input.focus();
  });
  q('[data-close]').addEventListener('click', close);
  q('form').addEventListener('submit', e => { e.preventDefault(); submit(input.value); });
  panel.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => submit(button.dataset.example)));
  q('[data-reset]').addEventListener('click', () => { stopMic(); state = {}; log.replaceChildren(); reply('chatHello'); });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { q('[data-mic]').disabled = true; q('[data-mic-note]').textContent = 'このブラウザでは文字入力で会話できます。音声入力は対応するChromeなどでお試しください。'; }
  q('[data-mic]').addEventListener('click', () => {
    if (listening) { stopMic(); status.textContent = '音声入力を停止しました。'; return; }
    epoch++; onInterrupt(); const own = epoch;
    const r = new Recognition(); recognition = r; listening = true;
    r.lang = 'ja-JP'; r.continuous = false; r.interimResults = true;
    status.textContent = 'お話しください…'; q('[data-mic]').textContent = '聞き取りを停止';
    r.onresult = event => {
      if (own !== epoch || !active || recognition !== r) return;
      const result = event.results[event.resultIndex]; input.value = result[0].transcript;
      if (result.isFinal) submit(result[0].transcript);
    };
    r.onerror = event => {
      if (own !== epoch || !active || recognition !== r) return;
      status.textContent = event.error === 'not-allowed' ? 'マイクが許可されていません。文字入力でも会話できます。' : '聞き取れませんでした。もう一度話すか、文字で入力してください。';
    };
    r.onend = () => { if (recognition !== r) return; clearTimeout(micTimer); recognition = null; listening = false; q('[data-mic]').textContent = 'マイクで話す'; if (status.textContent === 'お話しください…') status.textContent = '聞き取りを終了しました。もう一度話すか、文字で入力してください。'; };
    try { r.start(); micTimer = setTimeout(() => { if (recognition === r) { stopMic(); status.textContent = '聞き取りを終了しました。'; } }, 20000); }
    catch { stopMic(); status.textContent = '音声入力を開始できません。文字入力をご利用ください。'; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  window.addEventListener('pagehide', close);
  return { get active() { return active; }, close, stopMic };
}

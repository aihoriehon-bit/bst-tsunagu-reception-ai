import { recipientReading, toRecipientKana } from './recipient-reading.mjs?v=20260915-recipient-kana-1';

export function createReceptionCard({ onAnswer = () => {}, onRestart = () => {}, onRecipientReading = () => {} } = {}) {
  const panel = document.createElement('section');
  panel.className = 'reception-card'; panel.hidden = true;
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', '受付内容の確認'); panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-atomic', 'true');
  document.body.append(panel);
  let fadeTimer, hideTimer, mode = '', enabled = false, readingValid = true;
  function clear() {
    clearTimeout(fadeTimer); clearTimeout(hideTimer);
    mode = ''; panel.hidden = true; panel.classList.remove('is-fading'); panel.replaceChildren();
  }
  function text(tag, content, className) {
    const el = document.createElement(tag); el.textContent = content;
    if (className) el.className = className;
    return el;
  }
  return {
    get cueHost() { return mode === 'confirm' ? panel : null; },
    get canConfirm() { return mode === 'confirm' && readingValid; },
    show(state, recipient = recipientReading(state)) {
      if (state.step !== 'confirm') { if (mode !== 'complete') clear(); return; }
      clear(); mode = 'confirm'; panel.hidden = false; panel.dataset.mode = mode;
      panel.append(text('p', '受付内容の確認', 'reception-card-kicker'), text('h2', 'こちらの内容でよろしいですか？'));
      const list = document.createElement('dl');
      readingValid = !state.recipient || Boolean(recipient.text);
      let recipientValue;
      for (const [label, value] of [[state.role === 'delivery' ? 'お荷物の宛先' : 'お呼びする担当者', state.recipient ? recipient.text || '読みがなを入力してください' : ''], [state.role === 'delivery' ? '配達の方のお名前' : 'お客様のお名前', state.visitor], ['ご用件', state.purpose]]) {
        if (!value) continue;
        const row = document.createElement('div'), description = text('dd', value); row.append(text('dt', label), description); list.append(row);
        if (!recipientValue) recipientValue = description;
      }
      panel.append(list, text('p', '', 'reception-card-answer'));
      if (state.recipient && recipient.kind !== 'department') {
        const label = text('label', '担当者の読みがな（修正できます）', 'recipient-reading-label');
        const input = document.createElement('input'); input.type = 'text'; input.maxLength = 80;
        input.value = recipient.text; input.placeholder = '例：やまだたろうさん'; input.autocomplete = 'off';
        input.setAttribute('aria-invalid', String(!readingValid));
        const note = text('p', recipient.kind === 'predicted' ? '予測した読みです。話した名前と合っているか確認してください。' : recipient.kind === 'unknown' ? '読みを確定できません。ひらがなで入力してください。' : '漢字の表記ではなく、読みがなで確認します。', 'recipient-reading-note');
        const update = event => {
          if (event.isComposing) return;
          const reading = toRecipientKana(input.value);
          readingValid = /^[ぁ-ゖー]+$/.test(reading) && reading.length <= 80;
          input.setAttribute('aria-invalid', String(!readingValid));
          recipientValue.textContent = readingValid ? reading : '読みがなを入力してください';
          note.textContent = readingValid ? '入力した読みがなで確認します。' : 'ひらがな、またはカタカナで入力してください。';
          panel.querySelector('[data-answer="はい"]').disabled = !enabled || !readingValid;
          onRecipientReading(readingValid ? reading : '');
        };
        input.addEventListener('input', update); input.addEventListener('compositionend', update);
        label.append(input); panel.append(label, note);
      }
      const actions = document.createElement('div'); actions.className = 'reception-card-actions';
      for (const answer of ['はい', '訂正']) {
        const button = text('button', answer); button.type = 'button'; button.disabled = true; button.dataset.answer = answer;
        button.addEventListener('click', () => {
          if (mode !== 'confirm' || button.disabled) return;
          actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
          onAnswer(answer);
        });
        actions.append(button);
      }
      panel.append(actions);
    },
    setEnabled(value) {
      if (mode !== 'confirm') return;
      enabled = value;
      panel.querySelectorAll('.reception-card-actions button').forEach(b => { b.disabled = !enabled || b.dataset.answer === 'はい' && !readingValid; });
    },
    setRestartEnabled(enabled) {
      const restart = panel.querySelector('[data-restart]');
      if (restart) restart.disabled = !enabled;
    },
    setSpeaking(speaking) {
      if (mode !== 'confirm') return;
      const message = speaking ? '内容を確認し、下のボタンでも選べます。音声で答える場合は案内のあとにお願いします。' : '合っていれば「はい」、変更する場合は「訂正」を選んでください。音声でもお答えいただけます。';
      const hint = panel.querySelector('.reception-card-answer');
      if (hint.textContent !== message) hint.textContent = message;
    },
    complete() {
      clear(); mode = 'complete'; panel.hidden = false; panel.dataset.mode = mode;
      panel.append(text('p', '✓', 'reception-card-check'), text('h2', 'ここまでが受付デモです'),
        text('p', 'ご協力ありがとうございました。', 'reception-card-thanks'),
        text('p', '実際の担当者への電話・通知は行っていません。', 'reception-card-note'));
      const actions = document.createElement('div'); actions.className = 'reception-card-actions';
      const restart = text('button', 'もう一度受付を試す'); restart.type = 'button';
      restart.dataset.restart = ''; restart.disabled = true;
      restart.addEventListener('click', () => {
        if (mode !== 'complete' || restart.disabled) return;
        restart.disabled = true; onRestart();
      });
      actions.append(restart); panel.append(actions);
      fadeTimer = setTimeout(() => {
        panel.classList.add('is-fading'); hideTimer = setTimeout(clear, 700);
      }, 4500);
    },
    clear,
  };
}

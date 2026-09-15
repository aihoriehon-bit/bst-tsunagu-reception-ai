export function createReceptionCard({ onAnswer = () => {}, onRestart = () => {} } = {}) {
  const panel = document.createElement('section');
  panel.className = 'reception-card'; panel.hidden = true;
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', '受付内容の確認'); panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-atomic', 'true');
  document.body.append(panel);
  let fadeTimer, hideTimer, mode = '';
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
    show(state) {
      if (state.step !== 'confirm') { if (mode !== 'complete') clear(); return; }
      clear(); mode = 'confirm'; panel.hidden = false; panel.dataset.mode = mode;
      panel.append(text('p', '受付内容の確認', 'reception-card-kicker'), text('h2', 'こちらの内容でよろしいですか？'));
      const list = document.createElement('dl');
      for (const [label, value] of [[state.role === 'delivery' ? 'お荷物の宛先' : 'お呼びする担当者', state.recipient], [state.role === 'delivery' ? '配達の方のお名前' : 'お客様のお名前', state.visitor], ['ご用件', state.purpose]]) {
        if (!value) continue;
        const row = document.createElement('div'); row.append(text('dt', label), text('dd', value)); list.append(row);
      }
      panel.append(list, text('p', '', 'reception-card-answer'));
      const actions = document.createElement('div'); actions.className = 'reception-card-actions';
      for (const answer of ['はい', '訂正']) {
        const button = text('button', answer); button.type = 'button'; button.disabled = true;
        button.addEventListener('click', () => {
          if (mode !== 'confirm' || button.disabled) return;
          actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
          onAnswer(answer);
        });
        actions.append(button);
      }
      panel.append(actions);
    },
    setEnabled(enabled) {
      if (mode !== 'confirm') return;
      panel.querySelectorAll('.reception-card-actions button').forEach(b => { b.disabled = !enabled; });
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

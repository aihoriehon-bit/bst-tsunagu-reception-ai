export function createReceptionCard() {
  const panel = document.createElement('section');
  panel.className = 'reception-card'; panel.hidden = true;
  panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
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
    show(state) {
      if (state.step !== 'confirm') { if (mode !== 'complete') clear(); return; }
      clear(); mode = 'confirm'; panel.hidden = false; panel.dataset.mode = mode;
      panel.append(text('p', '受付内容の確認', 'reception-card-kicker'), text('h2', 'こちらの内容でよろしいですか？'));
      const list = document.createElement('dl');
      for (const [label, value] of [['お呼びする担当者', state.recipient], ['お客様のお名前', state.visitor], ['ご用件', state.purpose]]) {
        if (!value) continue;
        const row = document.createElement('div'); row.append(text('dt', label), text('dd', value)); list.append(row);
      }
      panel.append(list, text('p', '', 'reception-card-answer'));
    },
    setSpeaking(speaking) {
      if (mode !== 'confirm') return;
      const message = speaking ? '案内を聞いてからお答えください' : '合っていれば「はい」、変更する場合は「訂正」とお答えください';
      const hint = panel.querySelector('.reception-card-answer');
      if (hint.textContent !== message) hint.textContent = message;
    },
    complete() {
      clear(); mode = 'complete'; panel.hidden = false; panel.dataset.mode = mode;
      panel.append(text('p', '✓', 'reception-card-check'), text('h2', 'ここまでが受付デモです'),
        text('p', 'ご協力ありがとうございました。', 'reception-card-thanks'),
        text('p', '実際の担当者への電話・通知は行っていません。', 'reception-card-note'));
      fadeTimer = setTimeout(() => {
        panel.classList.add('is-fading'); hideTimer = setTimeout(clear, 700);
      }, 4500);
    },
    clear,
  };
}

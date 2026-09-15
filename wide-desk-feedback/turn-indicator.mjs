const mic = '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>';
const speaker = '<path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>';

export function createTurnIndicator() {
  const el = document.createElement('section');
  el.className = 'turn-indicator'; el.hidden = true;
  el.innerHTML = `<div class="turn-orb" aria-hidden="true"><i></i><i></i><span class="turn-orb-core"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${mic}</svg></span></div>
    <div class="turn-indicator-copy" role="status" aria-live="polite" aria-atomic="true"><span class="turn-indicator-label"></span><strong></strong><p></p></div>
    <span class="turn-meter-caption" aria-hidden="true"></span>`;
  document.body.append(el);
  let mode = '', meterReady = false, voiceActive = false, amplitude = 0;
  let observedPanel;
  // Anchor below the character, but clear the adjustable conversation controls.
  function positionNearBottom() {
    if (el.hidden || el.classList.contains('is-in-card')) return;
    const panel = document.querySelector('.handsfree-conversation');
    if (panel && panel !== observedPanel) { observer?.observe(panel); observedPanel = panel; }
    const box = el.getBoundingClientRect(), controls = panel?.getBoundingClientRect();
    let bottom = 32;
    if (controls && controls.height && box.left < controls.right && box.right > controls.left) {
      bottom = Math.max(bottom, window.innerHeight - controls.top + 16);
    }
    bottom = Math.min(bottom, Math.max(16, window.innerHeight - box.height - 16));
    el.style.setProperty('--turn-bottom', `${bottom}px`);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(positionNearBottom) : null;
  observer?.observe(el);
  window.addEventListener('resize', positionNearBottom);
  const title = el.querySelector('strong'), detail = el.querySelector('p'), label = el.querySelector('.turn-indicator-label');
  function paint() {
    const level = mode === 'listening' ? (meterReady ? amplitude : (voiceActive ? .35 : 0)) : 0;
    el.style.setProperty('--mic-level', level.toFixed(3));
    el.dataset.receiving = String(level > .06);
    const caption = mode === 'listening'
      ? (meterReady ? 'マイクの音に合わせて光ります' : '聞き取り中') : ' ';
    const captionElement = el.querySelector('.turn-meter-caption');
    if (captionElement.textContent !== caption) captionElement.textContent = caption;
  }
  return {
    show(cue, { visible = true, host = null } = {}) {
      const parent = host || document.body;
      if (el.parentElement !== parent) parent.prepend(el);
      el.classList.toggle('is-in-card', Boolean(host));
      el.hidden = !visible;
      if (mode !== cue.mode) {
        mode = cue.mode; amplitude = 0; voiceActive = false;
        el.dataset.turn = mode;
        el.querySelector('svg').innerHTML = mode === 'speaking' ? speaker : mic;
      }
      const heading = mode === 'listening' ? 'どうぞ、お話しください' : cue.title;
      const explanation = mode === 'listening' ? '緑のマイクが目印です。普通の声でお話しください。'
        : mode === 'speaking' ? 'いまは聞き取りをお休みしています。少しお待ちください。' : cue.detail;
      if (title.textContent !== heading) title.textContent = heading;
      if (detail.textContent !== explanation) detail.textContent = explanation;
      if (label.textContent !== cue.label) label.textContent = cue.label;
      paint();
      positionNearBottom();
    },
    setLevel(value) { amplitude = value; paint(); },
    setMeterReady(value) { meterReady = value; paint(); },
    setVoiceActivity(value) { voiceActive = value; paint(); },
    hide() { el.hidden = true; mode = ''; amplitude = 0; paint(); },
  };
}

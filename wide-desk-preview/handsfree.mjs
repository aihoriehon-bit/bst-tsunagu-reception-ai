// Invalidate every recognition session before playback to discard echo/late results.
export function createHandsfree({ Recognition, onText, onStatus, schedule = setTimeout, unschedule = clearTimeout }) {
  let enabled = false, active = false, present = false, audible = true, visible = true, speaking = false;
  let current = null, restart = null, watchdog = null, token = 0, failures = 0, blocked = false;
  const eligible = () => Recognition && enabled && active && present && audible && visible && !speaking && !blocked;
  function stop() {
    token++; unschedule(restart); unschedule(watchdog); restart = watchdog = null;
    const old = current; current = null;
    try { old?.abort(); } catch { /* already stopped */ }
  }
  function queue(delay = 650) {
    unschedule(restart); restart = null;
    if (eligible() && !current) { onStatus('preparing'); restart = schedule(start, delay); }
  }
  function start() {
    restart = null;
    if (!eligible() || current) return;
    const own = ++token, r = new Recognition(); current = r;
    let started = false, error = '';
    r.lang = 'ja-JP'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
    const valid = () => own === token && current === r && eligible();
    r.onstart = () => { if (valid()) { started = true; onStatus('listening'); } };
    r.onspeechend = () => { if (valid()) onStatus('processing'); };
    r.onaudioend = () => { if (valid()) onStatus('processing'); };
    r.onresult = event => {
      if (!valid()) return;
      const result = event.results[event.resultIndex];
      const text = result?.isFinal ? String(result[0]?.transcript || '').trim() : '';
      if (!text) return;
      failures = 0; stop(); onStatus('processing'); onText(text.slice(0, 300));
    };
    r.onerror = event => {
      if (!valid()) return;
      error = event.error;
      onStatus('preparing');
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(error)) {
        blocked = true; stop(); onStatus(error === 'not-allowed' || error === 'service-not-allowed' ? 'permission' : 'unavailable');
      } else if (error !== 'no-speech' && ++failures >= 3) { blocked = true; stop(); onStatus('network'); }
    };
    r.onend = () => {
      if (own !== token || current !== r) return;
      current = null; unschedule(watchdog); watchdog = null;
      if (!started && !error && ++failures >= 3) { blocked = true; onStatus('permission'); return; }
      if (eligible()) { onStatus('waiting'); queue(error && error !== 'no-speech' ? 2000 : 650); }
    };
    try {
      r.start();
      watchdog = schedule(() => {
        if (own !== token || current !== r) return;
        stop();
        if (!started && ++failures >= 3) { blocked = true; onStatus('unavailable'); }
        else queue();
      }, 25000);
    } catch { blocked = true; stop(); onStatus('permission'); }
  }
  return {
    update(next = {}) {
      ({ enabled = enabled, active = active, present = present, audible = audible, visible = visible, speaking = speaking } = next);
      if (!eligible()) stop(); else if (!current && restart === null) queue();
    },
    retry() { failures = 0; blocked = false; stop(); queue(0); },
    stop,
    get blocked() { return blocked; },
  };
}

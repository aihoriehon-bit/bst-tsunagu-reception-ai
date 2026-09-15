// Invalidate every recognition session before playback to discard echo/late results.
export function createHandsfree({ Recognition, onText, onStatus, onVoiceActivity = () => {}, input = null, schedule = setTimeout, unschedule = clearTimeout }) {
  let enabled = false, active = false, present = false, audible = true, visible = true, speaking = false;
  let current = null, restart = null, watchdog = null, token = 0, failures = 0, blocked = false;
  let voiceActive = false;
  let warm = Boolean(input), preparing = false, started = false, inputUnsupported = false;
  const voiceActivity = value => { if (voiceActive !== value) { voiceActive = value; onVoiceActivity(value); } };
  const baseEligible = () => Recognition && enabled && active && present && audible && visible && !blocked;
  const eligible = () => baseEligible() && (!speaking || warm);
  function stop() {
    input?.setOpen(false); preparing = false; started = false;
    voiceActivity(false);
    token++; unschedule(restart); unschedule(watchdog); restart = watchdog = null;
    const old = current; current = null;
    try { old?.abort(); } catch { /* already stopped */ }
  }
  function queue(delay = 650) {
    unschedule(restart); restart = null;
    if (eligible() && !current && !preparing) { onStatus('preparing'); restart = schedule(start, delay); }
  }
  function start() {
    restart = null;
    if (!eligible() || current || preparing) return;
    const own = ++token;
    if (!warm) { run(null, own); return; }
    preparing = true;
    input.getTrack().then(track => {
      if (own !== token || !eligible()) return;
      preparing = false;
      if (!track) { warm = false; input.release(); }
      if (eligible()) run(track, own);
    }).catch(() => {
      if (own !== token) return;
      preparing = false; warm = false; input.release();
      if (eligible()) run(null, own);
    });
  }
  function run(track, own) {
    const r = new Recognition(); current = r;
    let error = '';
    started = false;
    r.lang = 'ja-JP'; r.continuous = Boolean(track); r.interimResults = false; r.maxAlternatives = 1;
    const valid = () => own === token && current === r && eligible();
    r.onstart = () => { if (valid()) {
      started = true;
      // The first ordinary session may just have obtained microphone permission.
      // Retry preparing a gated track on the next AI turn, never mid-session.
      if (!track && input && !inputUnsupported) warm = true;
      input?.setOpen(!speaking); onStatus(speaking ? 'preparing' : 'listening');
    } };
    r.onspeechstart = () => { if (valid() && !speaking) voiceActivity(true); };
    r.onspeechend = () => { if (valid() && !speaking) { voiceActivity(false); onStatus('processing'); } };
    r.onaudioend = () => { if (valid() && !speaking) onStatus('processing'); };
    r.onresult = event => {
      if (!valid() || speaking) return;
      const result = event.results[event.resultIndex];
      const text = result?.isFinal ? String(result[0]?.transcript || '').trim() : '';
      if (!text) return;
      failures = 0; stop(); onStatus('processing'); onText(text.slice(0, 300));
      if (eligible() && !current && !preparing && restart === null) queue(0);
    };
    r.onerror = event => {
      if (!valid()) return;
      error = event.error;
      onStatus('preparing');
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(error)) {
        blocked = true; stop(); input?.release(); onStatus(error === 'not-allowed' || error === 'service-not-allowed' ? 'permission' : 'unavailable');
      } else if (error !== 'no-speech' && ++failures >= 3) { blocked = true; stop(); input?.release(); onStatus('network'); }
    };
    r.onend = () => {
      if (own !== token || current !== r) return;
      voiceActivity(false);
      current = null; unschedule(watchdog); watchdog = null;
      input?.setOpen(false);
      if (!started && !error && ++failures >= 3) { blocked = true; input?.release(); onStatus('permission'); return; }
      started = false;
      if (eligible()) { onStatus('waiting'); queue(error && error !== 'no-speech' ? 2000 : warm ? 100 : 650); }
    };
    try {
      if (track) r.start(track); else r.start();
      watchdog = schedule(() => {
        if (own !== token || current !== r) return;
        const wasStarted = started;
        stop();
        if (!wasStarted && ++failures >= 3) { blocked = true; input?.release(); onStatus('unavailable'); }
        else queue(warm ? 0 : 650);
      }, 25000);
    } catch {
      stop(); input?.release();
      if (track) { warm = false; inputUnsupported = true; if (eligible()) queue(0); }
      else { blocked = true; onStatus('permission'); }
    }
  }
  return {
    update(next = {}) {
      const wasSpeaking = speaking;
      ({ enabled = enabled, active = active, present = present, audible = audible, visible = visible, speaking = speaking } = next);
      if (!eligible()) { stop(); if (!baseEligible()) input?.release(); return; }
      // Discard the previous visitor's session, then prepare the next one with
      // SILENT input while AI audio plays. Never leave the raw mic on the service.
      if (warm && speaking && !wasSpeaking) stop();
      input?.setOpen(!speaking && started);
      if (warm && wasSpeaking && !speaking && current && started) onStatus('listening');
      else if (!current && !preparing && restart === null) queue(0);
    },
    retry() { failures = 0; blocked = false; inputUnsupported = false; warm = Boolean(input); stop(); input?.release(); queue(0); },
    stop() { stop(); input?.release(); },
    get blocked() { return blocked; },
  };
}

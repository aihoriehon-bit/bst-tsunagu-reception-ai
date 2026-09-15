// Local, transient amplitude only: no recorder, upload or audio output.
export function microphoneLevel(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.max(0, (Math.sqrt(sum / samples.length) - .008) * 12));
}

export function createMicLevel({ onLevel, onReady = () => {},
  mediaDevices = globalThis.navigator?.mediaDevices,
  permissions = globalThis.navigator?.permissions,
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
  let listening = false, token = 0, stream, context, source, frame;
  let explicitlyGranted = false, failed = false, ready = false;
  const setReady = value => { if (ready !== value) { ready = value; onReady(value); } };
  const release = value => value?.getTracks().forEach(track => track.stop());
  function stop() {
    token++; cancelFrame?.(frame); frame = undefined;
    source?.disconnect(); source = undefined;
    release(stream); stream = undefined;
    context?.close().catch(() => {}); context = undefined;
    setReady(false); onLevel(0);
  }
  async function start(own) {
    let acquired;
    try {
      // A visual enhancement must never cause a new permission prompt.
      let permitted = explicitlyGranted;
      try { permitted = (await permissions.query({ name: 'microphone' })).state === 'granted'; }
      catch { /* Safari may not expose microphone permission queries. */ }
      if (!permitted || !listening || own !== token) return;
      acquired = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!listening || own !== token) { release(acquired); return; }
      stream = acquired;
      context = new AudioContext();
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      source = context.createMediaStreamSource(stream); source.connect(analyser);
      // Do not connect to destination: that would feed the mic back to speakers.
      context.resume().catch(() => {});
      const samples = new Float32Array(analyser.fftSize);
      let smoothed = 0;
      const tick = () => {
        if (!listening || own !== token) return;
        if (stream.getAudioTracks().every(track => track.readyState === 'ended')) {
          failed = true; stop(); return;
        }
        setReady(context.state === 'running');
        if (ready) {
          analyser.getFloatTimeDomainData(samples);
          const level = microphoneLevel(samples);
          smoothed += (level - smoothed) * (level > smoothed ? .5 : .15);
          onLevel(smoothed);
        }
        frame = requestFrame(tick);
      };
      tick();
    } catch {
      release(acquired);
      if (own === token) { failed = true; stop(); }
      // Speech recognition remains usable even without the visual meter.
    }
  }
  return {
    permissionGranted() { explicitlyGranted = true; failed = false; },
    setListening(value) {
      value = Boolean(value);
      if (listening === value) return;
      listening = value;
      stop();
      if (value && !failed && mediaDevices?.getUserMedia && AudioContext && requestFrame) void start(token);
    },
    stop() { listening = false; stop(); },
  };
}

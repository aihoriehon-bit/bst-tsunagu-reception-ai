// Chrome 135 added SpeechRecognition.start(MediaStreamTrack).
// Other engines can silently ignore that argument, so never enable by duck typing.
export function supportsPreparedInput(navigator = globalThis.navigator) {
  const ua = navigator?.userAgent || '';
  return /Google Inc/.test(navigator?.vendor || '') && Number(ua.match(/Chrome\/(\d+)/)?.[1]) >= 135 && !/Android|CriOS|Edg\/|OPR\//.test(ua);
}

export function createRecognitionInput({ mediaDevices = globalThis.navigator?.mediaDevices,
  permissions = globalThis.navigator?.permissions, AudioContext = globalThis.AudioContext,
  schedule = setTimeout, unschedule = clearTimeout,
} = {}) {
  let generation = 0, pending = null, resource = null, open = false;
  const dispose = r => {
    r?.raw?.getTracks().forEach(track => track.stop());
    r?.output?.stream.getTracks().forEach(track => track.stop());
    r?.source?.disconnect(); r?.gain?.disconnect();
    r?.context?.close().catch(() => {});
  };
  const live = () => resource?.context.state === 'running' && resource.raw.getAudioTracks().some(t => t.readyState === 'live') && resource.output.stream.getAudioTracks()[0]?.readyState === 'live';
  function setOpen(value) {
    open = Boolean(value);
    if (resource) resource.gain.gain.value = open && live() ? 1 : 0;
  }
  function release() {
    generation++; pending = null; open = false;
    if (resource) resource.gain.gain.value = 0;
    dispose(resource); resource = null;
  }
  return {
    setOpen, release,
    get stream() { return live() ? resource.raw : null; },
    getTrack() {
      if (live()) return Promise.resolve(resource.output.stream.getAudioTracks()[0]);
      if (pending) return pending;
      if (resource) release();
      const own = generation;
      pending = (async () => {
        const r = {}; let timer;
        try {
          // Preparing input must not create an additional permission prompt.
          if ((await permissions.query({ name: 'microphone' })).state !== 'granted') return null;
          if (own !== generation) return null;
          r.raw = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
          if (own !== generation) { dispose(r); return null; }
          r.context = new AudioContext();
          r.gain = r.context.createGain(); r.gain.gain.value = 0;
          r.output = r.context.createMediaStreamDestination();
          r.source = r.context.createMediaStreamSource(r.raw);
          r.source.connect(r.gain); r.gain.connect(r.output);
          // No speaker connection. The only output goes to speech recognition.
          await Promise.race([r.context.resume(), new Promise((_, reject) => { timer = schedule(() => reject(Error('Audio context unavailable')), 1200); })]);
          if (own !== generation || r.context.state !== 'running') { dispose(r); return null; }
          resource = r; setOpen(open);
          r.raw.getAudioTracks().forEach(track => track.addEventListener?.('ended', () => {
            if (resource === r) release();
          }, { once: true }));
          return r.output.stream.getAudioTracks()[0];
        } catch { dispose(r); return null; }
        finally { unschedule(timer); }
      })().finally(() => { if (own === generation) pending = null; });
      return pending;
    },
  };
}

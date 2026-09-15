export function captureDirection(step, uniform = false) {
  return uniform || step === 0 ? { arrow: '◎', label: '正面を向いてください' }
    : step === 1 ? { arrow: '→', label: 'ご自身の右へ少し' }
    : { arrow: '←', label: 'ご自身の左へ少し' };
}
export const mirroredRegionLeft = area => 100 - area.x - area.width;

// Short locally synthesized shutter: no microphone, download or external service.
export function createShutterSound(AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context = null;
  return {
    unlock() {
      try { context ||= AudioContext ? new AudioContext() : null; context?.resume()?.catch(() => {}); } catch {}
    },
    play() {
      if (!context || context.state !== 'running') return false;
      try {
        const length = Math.round(context.sampleRate * .18);
        const buffer = context.createBuffer(1, length, context.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * .16));
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 1200; gain.gain.value = .22;
        source.connect(filter); filter.connect(gain); gain.connect(context.destination);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
        source.start(); return true;
      } catch { return false; }
    },
    close() { try { context?.close()?.catch(() => {}); } catch {} context = null; },
  };
}

export function needsAudioGesture(nav = globalThis.navigator) {
  return /iPhone|iPad|iPod|Android/.test(nav?.userAgent || '') ||
    (nav?.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

// Call directly inside a click, BEFORE animation, loading or permission awaits.
// Reuse the speech element: WebKit playback permission is per media element.
export function primeSpeechPlayer(audio) {
  const bytes = new Uint8Array(44 + 4800), view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 4800, true);
  const src = 'data:audio/wav;base64,' + btoa(String.fromCharCode(...bytes));
  audio.src = src; audio.muted = false; audio.volume = 1; audio.preload = 'auto';
  // The samples are silent, but the element is deliberately NOT muted.
  const promise = audio.play();
  return Promise.resolve(promise).then(() => {
    if (audio.src !== src) return false; // A newer request owns this element.
    audio.pause(); audio.currentTime = 0;
    return true;
  });
}

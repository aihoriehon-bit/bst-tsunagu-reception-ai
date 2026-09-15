export const REGION_MODES = ['auto', 'full', 'center70', 'center50', 'left', 'right'];
export const REGION_LABELS = { full: '画面全体', center70: '中央70％', center50: '中央50％', left: '映像の右半分', right: '映像の左半分' };
export function cameraRegion(width, height, mode = 'full') {
  const fraction = mode === 'center70' ? .7 : ['center50', 'left', 'right'].includes(mode) ? .5 : 1;
  const w = Math.round(width * fraction);
  const x = mode === 'left' ? 0 : mode === 'right' ? width - w : Math.round((width - w) / 2);
  return { x, y: 0, width: w, height };
}
// Account for completed inference on slower PCs, without retaining a face indefinitely.
export const frameLifetime = detectionMs => Math.min(6000, Math.max(1800, detectionMs + 1500));

// A focus area supplements, never replaces, whole-frame checks in automatic mode.
export function proposedRegion(faces, people, width, height) {
  if (faces.length !== 1 || people > 1 || !width || !height) return 'full';
  const b = faces[0]?.boundingBox;
  if (!b || ![b.originX,b.originY,b.width,b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) return 'full';
  const margin = Math.max(8, b.width * .6);
  for (const mode of ['center50', 'center70', 'left', 'right']) {
    const r = cameraRegion(width, height, mode);
    if (b.originX - margin >= r.x && b.originX + b.width + margin <= r.x + r.width) return mode;
  }
  return 'full';
}
export function createAutoRegion() {
  let mode = 'full', pending = '', since = 0, hits = 0, size = '';
  return {
    get mode() { return mode; },
    reset() { mode = 'full'; pending = ''; hits = 0; since = 0; },
    observe({ faces = [], people = 0, width, height, now = Date.now() }) {
      const nextSize = `${width}x${height}`;
      if (size !== nextSize) { this.reset(); size = nextSize; }
      const next = proposedRegion(faces, people, width, height);
      if (next === 'full') { this.reset(); return mode; }
      if (mode !== next) mode = 'full';
      if (next !== pending) { pending = next; since = now; hits = 1; }
      else hits++;
      if (hits >= 3 && now - since >= 900) mode = next;
      return mode;
    },
  };
}

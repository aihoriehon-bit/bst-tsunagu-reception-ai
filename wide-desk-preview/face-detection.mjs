// Higher input resolution finds smaller faces without loosening identity matching.
export const CAMERA_CONSTRAINTS = {
  video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
  audio: false,
};
export const FACE_DETECTION_OPTIONS = { inputSize: 608, scoreThreshold: 0.5 };
export const FACE_DESCRIPTOR_OPTIONS = { inputSize: 416, scoreThreshold: 0.35 };

export function searchRegions(width, height) {
  const w = Math.round(width * .6), h = Math.round(height * .6);
  return [{ x: 0, y: 0, width, height }, ...[0, height - h].flatMap(y =>
    [0, width - w].map(x => ({ x, y, width: w, height: h })))];
}

export function mergeDetections(detections) {
  const result = [];
  for (const d of [...detections].sort((a, b) => (b.score || 0) - (a.score || 0))) {
    const a = d.boundingBox;
    const duplicate = result.some(({ boundingBox: b }) => {
      const intersection = Math.max(0, Math.min(a.originX + a.width, b.originX + b.width) - Math.max(a.originX, b.originX))
        * Math.max(0, Math.min(a.originY + a.height, b.originY + b.height) - Math.max(a.originY, b.originY));
      return intersection / (a.width * a.height + b.width * b.height - intersection) > .4;
    });
    if (!duplicate) result.push(d);
  }
  return result;
}

export function faceQuality(faces, width, height) {
  const b = faces.length === 1 ? faces[0].boundingBox : null;
  const pixels = b ? Math.round(Math.min(b.width, b.height)) : 0;
  return { pixels, usable: pixels >= 40, text: `${width}×${height}${b ? `／顔 ${pixels}px` : ''}` };
}

export async function detectFaces(api, video, { frame, tile } = {}) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return [];
  frame ||= document.createElement('canvas'); tile ||= document.createElement('canvas');
  const width = video.videoWidth, height = video.videoHeight;
  const capturedAt = Date.now();
  frame.width = width; frame.height = height;
  frame.getContext('2d').drawImage(video, 0, 0, width, height);
  const all = [];
  // All regions use the SAME frame, so a moving person cannot become several people.
  for (const [index, region] of searchRegions(width, height).entries()) {
    let input = frame;
    if (index) {
      tile.width = region.width; tile.height = region.height;
      tile.getContext('2d').drawImage(frame, region.x, region.y, region.width, region.height, 0, 0, tile.width, tile.height);
      input = tile;
    }
    const detections = await api.detectAllFaces(input, new api.TinyFaceDetectorOptions(FACE_DETECTION_OPTIONS));
    all.push(...detections.filter(d => [d.box.x, d.box.y, d.box.width, d.box.height].every(Number.isFinite)
      && d.box.width > 0 && d.box.height > 0).map(d => ({ capturedAt, score: d.score, boundingBox: {
      originX: d.box.x + region.x, originY: d.box.y + region.y, width: d.box.width, height: d.box.height,
    } })));
  }
  // Keep every distinct face, including a small second person near the edge.
  return mergeDetections(all);
}

// Schedule after completion so slower PCs cannot accumulate expensive inference work.
export function createDetectionLoop({ detect, ready, update, onError, interval = 500,
  schedule = setTimeout, cancel = clearTimeout }) {
  let epoch = 0, timer = null, active = false, busy = false;
  function stop() { active = false; epoch++; if (timer !== null) cancel(timer); timer = null; }
  async function tick(own) {
    if (!active || own !== epoch) return;
    try {
      if (!busy && ready()) {
        busy = true;
        try {
          const faces = await detect();
          if (active && own === epoch && ready()) update(faces);
        } finally { busy = false; }
      }
    } catch (error) {
      if (active && own === epoch) { update([]); onError(error); }
    } finally {
      if (active && own === epoch) timer = schedule(() => tick(own), interval);
    }
  }
  return { start() { stop(); active = true; void tick(epoch); }, stop };
}

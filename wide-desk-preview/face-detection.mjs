// Higher input resolution finds smaller faces without loosening identity matching.
export const CAMERA_CONSTRAINTS = {
  video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
  audio: false,
};
export const FACE_DETECTION_OPTIONS = { inputSize: 608, scoreThreshold: 0.5 };
export const FACE_DESCRIPTOR_OPTIONS = { inputSize: 416, scoreThreshold: 0.35 };

export async function detectFaces(api, video) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return [];
  const detections = await api.detectAllFaces(video, new api.TinyFaceDetectorOptions(FACE_DETECTION_OPTIONS));
  // Keep every face: choosing only the largest would wrongly permit personal names in a group.
  return detections.filter(d => [d.box.x, d.box.y, d.box.width, d.box.height].every(Number.isFinite)
    && d.box.width > 0 && d.box.height > 0).map(d => ({ boundingBox: {
    originX: d.box.x, originY: d.box.y, width: d.box.width, height: d.box.height,
  } }));
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

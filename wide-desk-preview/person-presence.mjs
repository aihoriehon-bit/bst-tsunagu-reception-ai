// Body detection is presence only: never use clothing/body shape to name a person.
const PACKAGE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export const PERSON_MODEL = 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';
export function personBoxes(result, width, height) {
  return (result?.detections || []).filter(d => d.categories?.some(c => c.categoryName === 'person' && c.score >= .6)
    && d.boundingBox && [d.boundingBox.originX, d.boundingBox.originY, d.boundingBox.width, d.boundingBox.height].every(Number.isFinite)
    && d.boundingBox.width >= width * .025 && d.boundingBox.height >= height * .12).map(d => d.boundingBox);
}
export function createBodyConfirmation() {
  let hits = 0, first = 0, last = 0;
  return {
    update(count, now = Date.now()) {
      if (!count) { hits = 0; first = last = 0; return 0; }
      if (!hits || now - last > 2500) { hits = 0; first = now; }
      hits++; last = now;
      return hits >= 3 && now - first >= 600 ? count : 0;
    },
    reset() { hits = 0; first = last = 0; },
  };
}
export function createPersonDetector() {
  let detector = null, preparing = null, failedAt = 0, canvas = null;
  return {
    prepare() {
      if (detector) return Promise.resolve();
      if (preparing) return preparing;
      if (failedAt && Date.now() - failedAt < 30000) return Promise.resolve();
      preparing = (async () => {
        const { FilesetResolver, ObjectDetector } = await import(PACKAGE + '/vision_bundle.mjs');
        const files = await FilesetResolver.forVisionTasks(PACKAGE + '/wasm');
        detector = await ObjectDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: PERSON_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE',
          categoryAllowlist: ['person'], scoreThreshold: .6, maxResults: 8,
        });
        failedAt = 0;
      })().catch(() => { failedAt = Date.now(); }).finally(() => { preparing = null; });
      return preparing;
    },
    detect(video) {
      if (!detector) { void this.prepare(); return 0; }
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return 0;
      canvas ||= document.createElement('canvas');
      canvas.width = Math.min(640, video.videoWidth);
      canvas.height = Math.round(video.videoHeight / video.videoWidth * canvas.width);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      try { return personBoxes(detector.detect(canvas), canvas.width, canvas.height).length; }
      catch { detector.close(); detector = null; failedAt = Date.now(); return 0; }
    },
    get status() { return detector ? '全身からも検知' : failedAt ? '全身検知は再準備中・顔検出で受付' : '全身検知を準備中'; },
  };
}

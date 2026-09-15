// Body detection is presence only: never use clothing/body shape to name a person.
const PACKAGE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export const PERSON_MODEL = 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';
export function personBoxes(result, width, height) {
  const candidates = (result?.detections || []).filter(d => d.categories?.some(c => c.categoryName === 'person' && c.score >= .6)
    && d.boundingBox && [d.boundingBox.originX, d.boundingBox.originY, d.boundingBox.width, d.boundingBox.height].every(Number.isFinite)
    && d.boundingBox.width >= width * .025 && d.boundingBox.height >= height * .12)
    .sort((a,b) => Math.max(...b.categories.filter(c=>c.categoryName==='person').map(c=>c.score)) - Math.max(...a.categories.filter(c=>c.categoryName==='person').map(c=>c.score)));
  const boxes = [];
  for (const { boundingBox: a } of candidates) {
    const duplicate = boxes.some(b => {
      const overlap = Math.max(0, Math.min(a.originX+a.width,b.originX+b.width)-Math.max(a.originX,b.originX))
        * Math.max(0, Math.min(a.originY+a.height,b.originY+b.height)-Math.max(a.originY,b.originY));
      // Suppress only nearly coincident full-body boxes, not two adjacent people.
      return overlap / (a.width*a.height+b.width*b.height-overlap) > .75;
    });
    if (!duplicate) boxes.push(a);
  }
  return boxes;
}
export function createBodyConfirmation() {
  let hits = 0, first = 0, last = 0;
  return {
    update(count, now = Date.now()) {
      if (!count) { hits = 0; first = last = 0; return 0; }
      if (!hits || now - last > 6000) { hits = 0; first = now; }
      hits++; last = now;
      return hits >= 3 && now - first >= 600 ? count : 0;
    },
    reset() { hits = 0; first = last = 0; },
  };
}
export function createPersonDetector() {
  let detector = null, preparing = null, failedAt = 0, canvas = null, boxes = [];
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
    detect(video, area = null) {
      boxes = [];
      if (!detector) { void this.prepare(); return 0; }
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return 0;
      canvas ||= document.createElement('canvas');
      area ||= { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
      canvas.width = Math.min(960, area.width);
      canvas.height = Math.round(area.height / area.width * canvas.width);
      canvas.getContext('2d').drawImage(video, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
      try {
        boxes = originalPersonBoxes(personBoxes(detector.detect(canvas), canvas.width, canvas.height), area, canvas.width, canvas.height);
        return boxes.length;
      }
      catch { detector.close(); detector = null; failedAt = Date.now(); return 0; }
    },
    get boxes() { return boxes; },
    get status() { return detector ? '全身からも検知' : failedAt ? '全身検知は再準備中・顔検出で受付' : '全身検知を準備中'; },
  };
}

export function originalPersonBoxes(boxes, area, width, height) {
  return boxes.map(b => ({ originX: area.x + b.originX * area.width / width,
    originY: area.y + b.originY * area.height / height,
    width: b.width * area.width / width, height: b.height * area.height / height }));
}

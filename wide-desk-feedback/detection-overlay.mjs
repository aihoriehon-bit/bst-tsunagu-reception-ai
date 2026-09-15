// Map original camera coordinates to the mirrored displayed video, including letterboxing.
export function displayBox(box, sourceWidth, sourceHeight, width, height, fit = 'contain') {
  if (![box?.originX, box?.originY, box?.width, box?.height, sourceWidth, sourceHeight, width, height].every(Number.isFinite)
    || Math.min(sourceWidth, sourceHeight, width, height, box.width, box.height) <= 0) return null;
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / sourceWidth, height / sourceHeight);
  const ox = (width - sourceWidth * scale) / 2, oy = (height - sourceHeight * scale) / 2;
  const left = Math.max(0, ox + (sourceWidth - box.originX - box.width) * scale);
  const top = Math.max(0, oy + box.originY * scale);
  const right = Math.min(width, ox + (sourceWidth - box.originX) * scale);
  const bottom = Math.min(height, oy + (box.originY + box.height) * scale);
  return right > left && bottom > top ? { left, top, width: right-left, height: bottom-top } : null;
}

export function createDetectionOverlay(video) {
  const layer = document.createElement('div'); layer.className = 'detection-overlay';
  layer.setAttribute('aria-hidden', 'true'); video.parentElement.append(layer);
  let faces = [], bodies = [], expiry;
  function draw() {
    layer.style.left = `${video.offsetLeft}px`; layer.style.top = `${video.offsetTop}px`;
    layer.style.width = `${video.clientWidth}px`; layer.style.height = `${video.clientHeight}px`;
    const fragment = document.createDocumentFragment();
    for (const [kind, boxes] of [['body', bodies], ['face', faces.map(f=>f.boundingBox)]]) {
      [...boxes].sort((a,b)=>b.originX-a.originX).forEach((box, i) => {
        const area = displayBox(box, video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight, getComputedStyle(video).objectFit);
        if (!area) return;
        const frame = document.createElement('div'); frame.className = `detection-box detection-${kind}`;
        for (const [key,value] of Object.entries(area)) frame.style[key] = `${value}px`;
        const label = document.createElement('span'); label.textContent = `${kind === 'face' ? '顔' : '姿'}${i+1}`;
        frame.append(label); fragment.append(frame);
      });
    }
    layer.replaceChildren(fragment);
  }
  const observer = new ResizeObserver(draw); observer.observe(video);
  function clear() { clearTimeout(expiry); faces = []; bodies = []; layer.replaceChildren(); }
  return {
    update(nextFaces, nextBodies) {
      faces = nextFaces; bodies = nextBodies; draw(); clearTimeout(expiry);
      // Never leave an old detection painted indefinitely if the camera/loop stops.
      expiry = setTimeout(clear, 6000);
    },
    clear,
    destroy() { clear(); observer.disconnect(); layer.remove(); },
  };
}

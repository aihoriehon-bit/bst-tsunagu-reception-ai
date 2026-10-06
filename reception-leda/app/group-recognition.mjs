// Keep the target face tied to its crop; never use a neighbour's descriptor.
export function overlap(a, b) {
  const w = Math.max(0, Math.min(a.originX+a.width,b.originX+b.width)-Math.max(a.originX,b.originX));
  const h = Math.max(0, Math.min(a.originY+a.height,b.originY+b.height)-Math.max(a.originY,b.originY));
  return w*h / Math.max(1, a.width*a.height+b.width*b.height-w*h);
}
export function targetDescriptor(results, target) {
  const matches = results.filter(r => {
    const b = r.detection?.box;
    return b && overlap(target,{originX:b.x,originY:b.y,width:b.width,height:b.height}) >= .35;
  });
  return matches.length === 1 ? Array.from(matches[0].descriptor) : null;
}
export function createGroupConfirmation() {
  let counts = new Map(), frame = null, confirmed = [];
  return {
    reset() { counts.clear(); frame = null; confirmed = []; },
    update(results, capturedAt) {
      if (frame === capturedAt) return confirmed;
      frame = capturedAt;
      const frequency = new Map();
      for (const r of results) if (r.person?.source === 'face') frequency.set(r.person.id,(frequency.get(r.person.id)||0)+1);
      const next = new Map(); confirmed = [];
      for (const r of results) {
        // The same identity on two different faces is ambiguous, not two visitors.
        if (!r.person?.id || frequency.get(r.person.id) !== 1) continue;
        const n = (counts.get(r.person.id)||0)+1; next.set(r.person.id,n);
        if (n >= 3) confirmed.push({...r.person, boundingBox:r.box});
      }
      counts = next;
      return confirmed;
    },
  };
}

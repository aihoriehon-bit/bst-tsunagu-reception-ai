import { WRITE, STRETCH, MEMO, smooth } from './idle-motion.mjs?v=20261005-idle-6';
export { smooth };
// 長さは動きの台本（idle-motion.mjs）から決まる。メモ約12秒・伸び7秒
export const IDLE_LENGTHS = { write: WRITE.duration, stretch: STRETCH.duration };
export function envelope(elapsed, duration) {
  return Math.min(smooth(elapsed / 1.4), smooth((duration - elapsed) / 1.3));
}

// Only eligible, settled PC work may start an action. Reception always wins.
export function createIdleDirector(random = Math.random) {
  let active = null, requested = null, nextAt = 90 + random() * 60, wasAllowed = true;
  const postpone = now => { nextAt = now + 90 + random() * 60; };
  const snapshot = now => {
    if (!active) return { kind: null, weight: 0, fade: 0, elapsed: 0, writing: false };
    const elapsed = active.frozen ?? (now - active.start);
    const weight = active.fadeAt == null ? envelope(elapsed, active.duration)
      : active.fadeWeight * (1 - smooth((now - active.fadeAt) / 0.55));
    // fade: 中断されたときだけ 1→0 に下がる（動きの台本はそのまま、全体をキーボードの姿勢へ戻す）
    const fade = active.fadeAt == null ? 1 : 1 - smooth((now - active.fadeAt) / 0.55);
    return { kind: active.kind, elapsed, weight, fade,
      writing: active.kind === 'write' && elapsed > MEMO.keys[0].t && elapsed < MEMO.writingEnd && active.fadeAt == null };
  };
  function cancel(now) {
    requested = null;
    if (active && active.fadeAt == null) {
      const current = snapshot(now);
      active = { ...active, frozen: current.elapsed, fadeAt: now, fadeWeight: current.weight };
    }
    postpone(now);
  }
  return {
    request(kind) { if (!(kind in IDLE_LENGTHS)) return false; requested = kind; return true; },
    cancel,
    tick(now, allowed, ready = true) {
      if (!allowed) { if (wasAllowed || requested) cancel(now); }
      else if (!wasAllowed) postpone(now);
      wasAllowed = allowed;
      if (active && ((active.fadeAt != null && now >= active.fadeAt + 0.55) || (active.fadeAt == null && now >= active.start + active.duration))) {
        active = null; postpone(now);
      }
      if (allowed && ready && !active && (requested || now >= nextAt)) {
        const kind = requested || (random() < 0.7 ? 'write' : 'stretch');
        requested = null; active = { kind, start: now, duration: IDLE_LENGTHS[kind] };
      }
      return snapshot(now);
    },
  };
}

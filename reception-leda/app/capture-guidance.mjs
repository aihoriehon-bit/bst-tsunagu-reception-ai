export const CAPTURE_STABLE_MS = 700;
export const CAPTURE_TURN_MS = 1100;

export function captureProblem({ ready, modelError, faces = [], people = 0, age = 0, lifetime = 1800, fresh = true, light = null, moved = false }) {
  if (!ready) return { code: 'camera', text: 'カメラが停止しています。登録画面を閉じて「カメラ開始」を押してください。' };
  if (modelError) return { code: 'model', text: '顔の検出を準備できません。通信状態を確認し、登録画面を開き直してください。' };
  if (faces.length > 1 || people > 1) return { code: 'multiple', text: '複数人らしい反応があります。1人だけ写る位置へ移動し、背景のモニターは検知範囲から外してください。' };
  if (!fresh || age > lifetime) return { code: 'frame', text: '新しい映像を確認中です。カメラの前でそのままお待ちください。' };
  if (light !== null && light < 42) return { code: 'dark', text: '顔付近が暗く映っています。顔の正面を明るくするか、明るい場所へ移動してください。' };
  if (light !== null && light > 235) return { code: 'bright', text: '顔付近が白く飛んで見えます。強い照明や窓の光が直接当たらない位置へ移動してください。' };
  if (!faces.length) return { code: 'no-face', text: '顔が見つかりません。顔を緑枠の中に入れ、カメラへ顔を向けてください。' };
  const box = faces[0].boundingBox;
  if (!box || Math.min(box.width, box.height) < 40) return { code: 'small', text: '顔が小さく映っています。もう少しカメラに近づいてください。' };
  if (moved) return { code: 'moving', text: '顔が動いています。その向きで少しだけ止まってください。' };
  return null;
}
export function faceMoved(a, b) {
  if (!a || !b) return false;
  const scale = Math.max(a.width, a.height, 1);
  return Math.hypot(b.originX + b.width / 2 - a.originX - a.width / 2, b.originY + b.height / 2 - a.originY - a.height / 2) > scale * .16
    || Math.abs(b.width - a.width) > scale * .18;
}

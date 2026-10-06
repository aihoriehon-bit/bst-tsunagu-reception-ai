// 待機動作（メモを書く・伸びをする）のキーフレーム。
// three.js に依存しない純粋な関数だけを置き、worker-avatar.js が毎フレーム読み出して骨に当てる。
// 座標の約束:
//   体の座標  … x=キャラクターの左(+) y=上 z=前（来客側）。座った姿勢の肩・頭の位置を基準にした相対値。
//   メモ帳の座標 … u=書く人から見て右(+) v=紙の上（奥）(+) 単位メートル。メモ帳の中心が原点。

export const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export const smoother = x => { x = Math.max(0, Math.min(1, x)); return x * x * x * (x * (6 * x - 15) + 10); };
export const window01 = (t, a, b, c, d) => Math.min(smooth((t - a) / (b - a)), 1 - smooth((t - c) / (d - c)));

/**
 * キーフレームの補間（エルミート曲線）。keys = [[時刻, 値 or 配列, {stop:true}?], ...]
 * 途中のキーは前後をなめらかにつなぎ（Catmull-Rom）、先頭・末尾と stop のキーで速度0になる。
 * 一定の速さで止まらず流れる動きになり、キーごとにカクッと止まるロボットっぽさが出ない。
 */
export function track(keys) {
  const n = keys.length;
  const vec = Array.isArray(keys[0][1]);
  const get = (i) => (vec ? keys[i][1] : [keys[i][1]]);
  const tangent = (i) => {
    if (i === 0 || i === n - 1 || keys[i][2]?.stop) return get(i).map(() => 0);
    const dt = keys[i + 1][0] - keys[i - 1][0];
    return get(i).map((_, k) => (get(i + 1)[k] - get(i - 1)[k]) / dt);
  };
  const tans = keys.map((_, i) => tangent(i));
  return (t) => {
    let out;
    if (t <= keys[0][0]) out = get(0);
    else if (t >= keys[n - 1][0]) out = get(n - 1);
    else {
      let i = 0;
      while (t > keys[i + 1][0]) i += 1;
      const t0 = keys[i][0], t1 = keys[i + 1][0], h = t1 - t0, s = (t - t0) / h;
      const s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      const a = get(i), b = get(i + 1);
      out = a.map((_, k) => h00 * a[k] + h10 * h * tans[i][k] + h01 * b[k] + h11 * h * tans[i + 1][k]);
    }
    return vec ? out : out[0];
  };
}

// ---------------------------------------------------------------------------
// メモ書き（11秒）
// ---------------------------------------------------------------------------

export const WRITE = {
  pad: { width: 0.105, depth: 0.148 },
  // ペンの置き場所（メモ帳の右の余白に、先を奥へ向けて置いてある）
  penRest: { tip: [0.043, 0.050], axis: [0.13, -0.99] }, // axis = 先 → 後ろ（u, v）
  lines: [0.036, 0.011, -0.014], // 罫線（文字の下端）
  grasp: 1.62, // ペンをつまんだ瞬間
  // putdown / release / duration は台本から下で計算する
};

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 漢字・かなっぽい画（横画・縦画・はらい・点・折れ）を組み合わせて1文字を作る。セルは 7mm角。
const GLYPH_PARTS = [
  (r) => [[0.1, 0.62 + r() * 0.2], [0.9, 0.66 + r() * 0.2]], // 横画
  (r) => [[0.15, 0.3 + r() * 0.1], [0.85, 0.34 + r() * 0.1]], // 低い横画
  (r) => { const x = 0.35 + r() * 0.3; return [[x, 0.95], [x + 0.02, 0.45], [x - 0.02, 0.05]]; }, // 縦画
  (r) => [[0.55, 0.9], [0.4, 0.5], [0.08, 0.1 + r() * 0.1]], // 左はらい
  (r) => [[0.45, 0.55], [0.7, 0.3], [0.95, 0.12]], // 右はらい
  (r) => { const x = 0.2 + r() * 0.6; return [[x, 0.85], [x + 0.08, 0.72]]; }, // 点
  (r) => [[0.15, 0.85], [0.85, 0.85], [0.8, 0.45], [0.55, 0.15]], // 折れ
  (r) => [[0.25, 0.75], [0.2, 0.3], [0.45, 0.12], [0.85, 0.3]], // 曲がり（かな）
];

function makeGlyph(r) {
  const count = 2 + Math.floor(r() * 2.4);
  const strokes = [];
  for (let i = 0; i < count; i += 1) strokes.push(GLYPH_PARTS[Math.floor(r() * GLYPH_PARTS.length)](r));
  // 書き順っぽく、上→下・左→右に並べる
  return strokes.sort((a, b) => (b[0][1] - a[0][1]) * 2 + (a[0][0] - b[0][0]));
}

/** 折れ線を約0.6mm間隔の点に細かく分ける（筆跡をペン先の動きどおりに少しずつ描くため）。 */
function densify(points, step = 0.0006) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k += 1) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
  }
  return out;
}

/**
 * 書く内容を、ペン先の時刻つき経路（keys）と筆跡（ink）にする。
 * 3行（8文字・7文字・考えてから5文字）＋最後に下線。左から右へ書き、行は手前へ下がる。
 */
const WRITE_START = 2.40; // ペンを持ち上げて書く角度へ起こし終える時刻

export function buildMemoScript() {
  const r = rng(20261005);
  const keys = []; // {t, u, v, lift}
  const ink = []; // {t, a:[u,v], b:[u,v]}  t = その線分を書き終えた時刻
  const CELL = 0.0068, ADV = 0.0083;
  let t = WRITE_START;
  let pen = null; // 直前のペン先 {u,v}

  const airMove = (u, v, height, speed = 0.11) => {
    // ペンを浮かせて次の画の書き始めへ（距離に応じた時間、低い弧をひと続きで）
    const d = pen ? Math.hypot(u - pen.u, v - pen.v) : 0;
    t += Math.max(0.045, d / speed + 0.028);
    keys.push({ t, u, v, lift: 0, air: height + d * 0.12 });
    pen = { u, v };
  };
  const drawStroke = (pts, speed) => {
    const fine = densify(pts);
    const times = [t];
    for (let i = 1; i < fine.length; i += 1) {
      const d = Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
      t += d / speed;
      times.push(t);
      ink.push({ t, a: fine[i - 1], b: fine[i] });
    }
    for (let i = 3; i < fine.length - 1; i += 3) keys.push({ t: times[i], u: fine[i][0], v: fine[i][1], lift: 0 });
    const last = fine[fine.length - 1];
    keys.push({ t, u: last[0], v: last[1], lift: 0 });
    pen = { u: last[0], v: last[1] };
  };

  const writeLine = (lineIndex, chars, startU, pace) => {
    const base = WRITE.lines[lineIndex];
    let u = startU;
    for (let c = 0; c < chars; c += 1) {
      const glyph = makeGlyph(r);
      const jitterV = (r() - 0.5) * 0.0008;
      for (const stroke of glyph) {
        const pts = stroke.map(([x, y]) => [u + x * CELL, base + 0.0006 + jitterV + y * CELL]);
        airMove(pts[0][0], pts[0][1], 0.0028);
        drawStroke(pts, pace * (0.85 + r() * 0.3));
      }
      u += ADV * (0.92 + r() * 0.16);
    }
  };

  keys.push({ t: WRITE_START - 0.001, u: -0.040, v: WRITE.lines[0] + 0.004, lift: 0.004 });
  pen = { u: -0.040, v: WRITE.lines[0] + 0.004 };
  writeLine(0, 6, -0.040, 0.078);
  const line1End = t;
  writeLine(1, 5, -0.040, 0.080);
  const line2End = t;
  // 考える間：ペンを少し浮かせて手前へ引き、画面をちらっと見る
  keys.push({ t: t + 0.30, u: pen.u + 0.004, v: pen.v - 0.004, lift: 0.010 });
  keys.push({ t: t + 0.75, u: pen.u + 0.003, v: pen.v - 0.006, lift: 0.012 });
  keys.push({ t: t + 1.05, u: pen.u + 0.001, v: pen.v - 0.005, lift: 0.011 });
  t += 1.05; pen = { u: pen.u + 0.001, v: pen.v - 0.005 };
  const thinkEnd = t + 0.05;
  airMove(-0.040, WRITE.lines[2] + 0.004, 0.006, 0.12);
  writeLine(2, 3, -0.040, 0.082);
  // 最後に下線を引いて締める
  const lineEndU = pen.u;
  airMove(-0.041, WRITE.lines[2] - 0.0016, 0.003);
  drawStroke([[-0.041, WRITE.lines[2] - 0.0016], [lineEndU + 0.004, WRITE.lines[2] - 0.0022]], 0.11);
  const writingEnd = t;
  // ペンを上げる
  keys.push({ t: t + 0.18, u: pen.u + 0.002, v: pen.v - 0.002, lift: 0.010 });
  return { keys, ink, line1End, line2End, thinkStart: line2End, thinkEnd, writingEnd, liftEnd: t + 0.18 };
}

export const MEMO = buildMemoScript();
// 書き終わり以降の時刻（置く → 指を離す → キーボードへ戻る）は台本の長さから決める
WRITE.putdown = MEMO.liftEnd;
WRITE.release = MEMO.liftEnd + 0.85;
WRITE.duration = Math.ceil((WRITE.release + 1.75) * 10) / 10;

/** ペン先の位置（メモ帳の座標、lift=紙からの高さ）。書いていないときは null。 */
export function memoTip(elapsed, script = MEMO) {
  const k = script.keys;
  if (elapsed < k[0].t || elapsed > k[k.length - 1].t) return null;
  let i = 0;
  while (i < k.length - 2 && elapsed > k[i + 1].t) i += 1;
  const a = k[i], b = k[i + 1];
  const s = b.t > a.t ? Math.max(0, Math.min(1, (elapsed - a.t) / (b.t - a.t))) : 1;
  if (b.air) {
    // 空中の移動：位置はなめらかに加減速、高さは弧を描く
    const e = smooth(s);
    return { u: a.u + (b.u - a.u) * e, v: a.v + (b.v - a.v) * e, lift: a.lift + (b.lift - a.lift) * e + b.air * Math.sin(Math.PI * s) };
  }
  const e = a.lift > 0 || b.lift > 0 ? smooth(s) : s;
  return { u: a.u + (b.u - a.u) * e, v: a.v + (b.v - a.v) * e, lift: a.lift + (b.lift - a.lift) * e };
}

/** 書いた筆跡の線分の数（elapsed までに書き終えた分）。 */
export function memoInkCount(elapsed, script = MEMO) {
  const ink = script.ink;
  let lo = 0, hi = ink.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ink[mid].t <= elapsed) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * メモ書きの各チャンネル（0〜1 の重みと注視先など）。
 * reach … 右手がキーボード→ペンへ（0→1）、戻り（1→0）
 * held  … ペンが手に付いている度合い（つまむ→持ち上げで1、置くと0）
 * write … 書く手の構え（ペンを立てて紙へ）
 */
export function writeChannels(e) {
  const R = WRITE.release, D = WRITE.duration, P = WRITE.putdown;
  const reach = window01(e, 0.30, 1.40, R + 0.10, D - 0.20);
  const left = window01(e, 0.55, 1.55, R - 0.15, D - 0.45);
  const held = window01(e, WRITE.grasp - 0.02, WRITE.grasp + 0.06, R - 0.06, R);
  const write = window01(e, 1.72, WRITE_START, P - 0.02, P + 0.62); // 持ち上げ・置くはゆっくり
  const body = window01(e, 0.35, 1.70, R - 0.05, D - 0.10);
  // 考える間に画面へ目線を上げる
  const think = window01(e, MEMO.thinkStart + 0.05, MEMO.thinkStart + 0.55, MEMO.thinkEnd - 0.45, MEMO.thinkEnd + 0.05);
  // 目線: キーボードから先にメモ帳へ（手より先に目が動く）、終わりは手より先に画面へ
  const gaze = window01(e, 0.05, 0.55, R - 0.35, R + 0.45);
  const phase = e < 1.40 ? 'reach' : e < WRITE_START ? 'pickup' : e < P ? 'write' : e < R + 0.1 ? 'putdown' : 'return';
  return { reach, left, held, write, body, think, gaze, phase };
}

// ---------------------------------------------------------------------------
// 伸び（7秒）
// ---------------------------------------------------------------------------
// 手首の位置は「座った肩の中央」からの相対（x は外側が+、左右で符号を反転して使う）。
// 胸の前で指を組む → 手のひらを前へ返しながら押し出す → 頭の上へ（手のひらは天井） →
// 少し左へ傾いて背中を伸ばす → 指をほどき、腕を横へ大きく回して下ろす → 肩の力を抜く → キーボードへ

export const STRETCH = { duration: 7 };

// [時刻, [外側x, 上y, 前z]]
const STRETCH_WRIST = track([
  [0.55, [0.075, -0.17, 0.205]],
  [1.15, [0.090, -0.080, 0.200]], // 胸の前で手のひらを向かい合わせ、指を組む
  [1.58, [0.076, 0.040, 0.320]], // 組んだまま前へ押し出しながら上へ（手のひらを前へ返す）
  [2.02, [0.072, 0.275, 0.200]], // 顔の前は前方へ離して通り、上へ
  [2.45, [0.075, 0.352, 0.072]], // 頭の上（手のひらは天井へ）
  [3.00, [0.072, 0.378, 0.052]], // さらにぐっと伸ばす（止めずにじわっと）
  [3.45, [0.080, 0.368, 0.055]], // 少しゆるめる
  [3.75, [0.135, 0.360, 0.055]], // 指をほどく（手を少し離す）
  // 息を吐きながら肘を曲げて脇の方へ引き下ろす（肩甲骨を寄せて胸を開く）。手は耳の横を通る
  [4.15, [0.235, 0.150, 0.010]],
  [4.60, [0.190, -0.075, 0.120]], // 肘が脇へ下り、手は肩の前へ（力が抜けていく）
  [5.05, [0.165, -0.145, 0.185]], // 胸の前から机へ
  [5.45, [0.160, -0.180, 0.200], { stop: true }], // 机の上で一息
]);

// 肘の向き（肩からの相対・外側x）。腕を横へ出すときは肘を下・後ろへ向け、肘が裏返らないようにする
const STRETCH_POLE = track([
  [0.55, [0.40, -0.30, -0.20]],
  [1.15, [0.45, -0.35, -0.05]],
  [1.58, [0.50, -0.25, 0.05]],
  [2.45, [0.55, 0.05, 0.10]],
  [3.75, [0.55, 0.00, 0.08]],
  [4.15, [0.55, -0.55, -0.35]], // 肘は下・外・後ろへ（脇へ引く）
  [4.60, [0.45, -0.60, -0.25]],
  [5.05, [0.40, -0.45, -0.20]],
  [5.45, [0.40, -0.30, -0.20]],
]);

// 手の向き: [指の向き(外側x,y,z), 手のひらの向き(外側x,y,z)]  x は外側が+
const STRETCH_HAND = track([
  [0.55, [-0.10, -0.14, 1.0, 0.0, -1.0, 0.12]],
  [1.15, [-0.80, 0.15, 0.55, -1.0, 0.0, 0.10]], // 手のひら同士を向かい合わせて指を組む
  [1.58, [-1.0, 0.10, 0.05, 0.0, 0.25, 1.0]], // 手のひらを前へ返す
  [2.02, [-1.0, 0.12, 0.0, 0.0, 0.75, 0.65]],
  [2.45, [-1.0, 0.05, 0.0, 0.0, 1.0, 0.10]], // 手のひらは天井へ
  [3.45, [-1.0, 0.05, 0.0, 0.0, 1.0, 0.10]],
  [3.75, [0.15, 0.98, 0.05, -0.95, 0.20, 0.15]], // ほどいた手は指先を上、手のひらは内側（頭の方）
  [4.15, [0.05, 0.97, 0.20, -0.92, 0.05, 0.38]], // 肘を曲げて下ろす途中: 指先は上、手のひらは内側・前
  [4.60, [-0.15, 0.75, 0.64, -0.85, -0.25, 0.45]],
  [5.05, [-0.20, -0.30, 0.93, -0.30, -0.90, 0.20]],
  [5.45, [-0.10, -0.25, 1.0, 0.0, -1.0, 0.15]],
]);

// 組んだ指の曲げ（胸の前ではしっかり組み、頭の上では手のひらを平らに天井へ向ける）と、ほどいた後の力の抜け
const STRETCH_CURL = track([
  [0.55, 0.12], [1.15, 0.34], [1.58, 0.26], [2.45, 0.10], [3.45, 0.10], [3.75, 0.22], [4.15, 0.28], [4.60, 0.28], [5.05, 0.22], [5.45, 0.14],
]);

// 肩甲骨を寄せる量（肩を後ろへ引く）。肘を引き下ろすときにぎゅっと寄せ、息を吐いてゆるめる
const STRETCH_SQUEEZE = track([[0, 0], [3.60, 0], [4.15, 0.16], [4.55, 0.10], [5.10, 0], [7, 0]]);

const STRETCH_BODY = track([
  // [背中の反り, 胸の反り, 横の傾き(左+), 肩の上がり, 頭の上下(上向き+)]
  [0.00, [0, 0, 0, 0, 0]],
  [0.60, [0.01, 0.025, 0, 0.0, 0.08]], // 息を吸い始め、画面から顔を上げる
  [1.25, [0.02, 0.05, 0, 0.03, 0.10]],
  [2.40, [0.075, 0.120, 0.0, 0.16, 0.26]],
  [3.00, [0.090, 0.140, 0.050, 0.19, 0.30]], // ぐっと伸ばしながら左へ少し傾く
  [3.50, [0.082, 0.128, -0.015, 0.175, 0.27]],
  [4.15, [0.055, 0.105, 0.0, 0.01, 0.12]], // 引き下ろしで胸を開き、肩は下げる
  [4.60, [0.020, 0.045, 0.0, -0.04, 0.03]],
  [5.05, [-0.010, -0.015, 0.0, -0.05, -0.05]], // 力を抜いて肩を落とす（ふぅ）
  [5.60, [0, 0.0, 0, -0.01, -0.01]],
  [7.00, [0, 0, 0, 0, 0]],
]);

/** 伸びの各チャンネル。arm = 腕を伸びの軌道に乗せる度合い（0=キーボード）。 */
export function stretchChannels(e, armLag = 0) {
  const arm = window01(e - armLag, 0.25, 0.80, 5.30, 6.65);
  // 左右の腕は少しだけずらす（指を組んでいる間はそろえる）。鏡に映したような完全な左右対称を避ける
  const lockNow = window01(e, 0.95, 1.25, 3.50, 3.85);
  const ea = e - armLag * (1 - lockNow);
  const wrist = STRETCH_WRIST(Math.max(0.55, ea));
  const hand = STRETCH_HAND(Math.max(0.55, ea));
  const pole = STRETCH_POLE(Math.max(0.55, ea));
  const [back, chest, lean, shoulder, headUp] = STRETCH_BODY(e);
  const interlock = window01(e, 0.95, 1.25, 3.50, 3.85); // 指を組んでいる
  // 目は伸びのピークで閉じる（気持ちよさそうに）
  const eyesClosed = e > 2.15 && e < 3.72;
  const eyesHalf = (e > 2.00 && e <= 2.15) || (e >= 3.72 && e < 3.86);
  const mouthSmall = e > 4.30 && e < 4.90; // 引き下ろしながら「ふぅ」と息を吐く // 下ろしながら「ふぅ」と息を吐く
  const gazeMonitor = 1 - window01(e, 0.15, 0.75, 5.50, 6.40);
  return { arm, wrist, pole, finger: hand.slice(0, 3), palm: hand.slice(3), curl: STRETCH_CURL(ea), squeeze: STRETCH_SQUEEZE(e), back, chest, lean, shoulder, headUp,
    interlock, eye: eyesClosed ? 'closed' : eyesHalf ? 'half' : null, mouth: mouthSmall ? 'small' : null, gazeMonitor };
}

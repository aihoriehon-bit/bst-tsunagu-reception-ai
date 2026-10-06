import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildReception, createEnvironmentMap, MEMO_SURFACE } from './environment.js?v=20261005-idle-6';
import { createIdleDirector } from './idle-actions.mjs?v=20261005-idle-6';
import { WRITE, MEMO, memoTip, memoInkCount, writeChannels, stretchChannels } from './idle-motion.mjs?v=20261005-idle-6';
// Derived from the supplied worker model runtime. Reception and audio stay in the host app.
export async function createWorkerAvatar({scene, camera, renderer, clockNow = () => performance.now()}) {
const MODEL_URL = new URL('./model-assets/worker.glb', import.meta.url).href;
const FACE_DIR = new URL('./model-assets/face/', import.meta.url).href;
const DECAL_DIR = new URL('./model-assets/decals/', import.meta.url).href;
const AX = new THREE.Vector3(1,0,0), AY = new THREE.Vector3(0,1,0), AZ = new THREE.Vector3(0,0,1);
let autoBlink = true, time = 0, transition = null, fallbackSpeech = false;
const startedAt = clockNow();
const idleDirector = createIdleDirector();
let idlePose = { kind: null, weight: 0, fade: 0, elapsed: 0, writing: false };
const _pq = new THREE.Quaternion();
const _q = new THREE.Quaternion();

/** 骨をワールド空間の回転 worldQ で、骨の根元を中心に回す（子も一緒に回る）。 */
function rotateWorld(bone, worldQ) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_pq);
  _q.copy(_pq).invert().multiply(worldQ).multiply(_pq);
  bone.quaternion.premultiply(_q);
  bone.updateWorldMatrix(false, true);
}

function rotateAxis(bone, axis, angle) {
  if (Math.abs(angle) < 1e-6) return;
  rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle));
}

/** 骨をワールド空間で平行移動する（子も一緒に動く）。 */
function translateWorld(bone, delta) {
  const p = bone.getWorldPosition(new THREE.Vector3()).add(delta);
  bone.parent.updateWorldMatrix(true, false);
  bone.position.copy(bone.parent.worldToLocal(p));
  bone.updateWorldMatrix(false, true);
}

const worldPos = (obj, out = new THREE.Vector3()) => obj.getWorldPosition(out);

/** 2関節IK: 手首を target へ。肘は pole の方向へ曲げる。 */
function solveArm(arm, target, pole) {
  const a = worldPos(arm.upper);
  const b = worldPos(arm.fore);
  const c = worldPos(arm.hand);
  const lenA = a.distanceTo(b);
  const lenB = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const dist = THREE.MathUtils.clamp(toT.length(), Math.abs(lenA - lenB) + 1e-4, lenA + lenB - 1e-4);
  const dir = toT.normalize();
  const cosA = (lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = pole.clone().sub(a);
  p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  // Keep the sleeve outside the vest even when the hand target changes.
  // Adjust on the IK elbow circle, preserving both arm segment lengths.
  const radius = sinA * lenA;
  if (arm.elbowOutset > 0 && radius > 1e-4) {
    const center = a.clone().addScaledVector(dir, cosA * lenA);
    const outside = new THREE.Vector3(arm.sign, 0, 0).addScaledVector(dir, -arm.sign * dir.x);
    const available = outside.length();
    if (available > 1e-4) {
      outside.divideScalar(available);
      const required = THREE.MathUtils.clamp((arm.sign * a.x + arm.elbowOutset - arm.sign * center.x) / (radius * available), -1, 0.999);
      const projection = p.dot(outside);
      if (projection < required) {
        const tangent = p.clone().addScaledVector(outside, -projection);
        if (tangent.lengthSq() < 1e-8) tangent.crossVectors(dir, outside);
        tangent.normalize();
        p.copy(outside).multiplyScalar(required).addScaledVector(tangent, Math.sqrt(1 - required * required));
      }
    }
  }
  const elbow = a.clone().addScaledVector(dir, cosA * lenA).addScaledVector(p, sinA * lenA);

  rotateWorld(arm.upper, new THREE.Quaternion().setFromUnitVectors(
    b.clone().sub(a).normalize(), elbow.clone().sub(a).normalize()));

  worldPos(arm.fore, b);
  worldPos(arm.hand, c);
  rotateWorld(arm.fore, new THREE.Quaternion().setFromUnitVectors(
    c.clone().sub(b).normalize(), target.clone().sub(b).normalize()));
}

/** 手の向きを「指の方向」と「手のひらの向き」で指定する。 */
function orientHand(arm, fingerDir, palmDir) {
  const hq = arm.hand.getWorldQuaternion(new THREE.Quaternion());
  const f = arm.fingerLocal.clone().applyQuaternion(hq);
  const n = arm.palmLocal.clone().applyQuaternion(hq);
  const now = basis(f, n);
  const want = basis(fingerDir, palmDir);
  rotateWorld(arm.hand, want.multiply(now.invert()));
}

/**
 * 手首の曲がりを前腕に対して maxDeg 度までに抑える（手のひらの向きは保ったまま、手全体を前腕の方へ戻す）。
 * 角度は「前腕の向き」と「手首→中指の付け根」の間で測る（キーボードを打つ姿勢で約28°）。
 */
function limitWrist(arm, maxDeg) {
  if (maxDeg >= 179) return;
  const forearm = worldPos(arm.hand).sub(worldPos(arm.fore)).normalize();
  const hand = worldPos(arm.fingers[1][0]).sub(worldPos(arm.hand)).normalize();
  const ang = Math.acos(THREE.MathUtils.clamp(forearm.dot(hand), -1, 1));
  const max = THREE.MathUtils.degToRad(maxDeg);
  if (ang <= max) return;
  const axis = new THREE.Vector3().crossVectors(hand, forearm).normalize();
  rotateWorld(arm.hand, new THREE.Quaternion().setFromAxisAngle(axis, ang - max));
}

/** 手の向きを basis() の回転で直接指定する（向き同士をなめらかに補間するため）。 */
function orientHandQ(arm, wantQ) {
  const hq = arm.hand.getWorldQuaternion(new THREE.Quaternion());
  const now = basis(arm.fingerLocal.clone().applyQuaternion(hq), arm.palmLocal.clone().applyQuaternion(hq));
  rotateWorld(arm.hand, wantQ.clone().multiply(now.invert()));
}

function basis(f, n) {
  const x = f.clone().normalize();
  const y = n.clone().sub(x.clone().multiplyScalar(n.dot(x))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * 開いている指を中指の方向へ寄せて閉じる（モデルの初期姿勢は指が大きく開いている）。
 * amount: 0=そのまま 1=中指と平行
 */
function closeFingers(arm, amount, thumbAmount) {
  const hq = arm.hand.getWorldQuaternion(new THREE.Quaternion());
  const n = arm.palmLocal.clone().applyQuaternion(hq).normalize();
  const flat = (v) => v.sub(n.clone().multiplyScalar(v.dot(n))).normalize();
  const dirOf = (chain) => flat(worldPos(chain[1]).sub(worldPos(chain[0])));
  const middle = dirOf(arm.fingers[1]);
  for (const fi of [0, 2, 3]) {
    const chain = arm.fingers[fi];
    const d = dirOf(chain);
    const want = d.clone().lerp(middle, amount).normalize();
    rotateWorld(chain[0], new THREE.Quaternion().setFromUnitVectors(d, want));
  }
  // 親指は人差し指に沿わせる
  const index = dirOf(arm.fingers[0]);
  const t = dirOf(arm.thumb);
  rotateWorld(arm.thumb[0], new THREE.Quaternion().setFromUnitVectors(t, t.clone().lerp(index, thumbAmount).normalize()));
}

/** 指を手のひら側へ曲げる。curls は人差し指〜小指の [付け根, 第二, 第三] の角度。 */
function curlFingers(arm, curls, thumbCurl) {
  const hq = arm.hand.getWorldQuaternion(new THREE.Quaternion());
  const f = arm.fingerLocal.clone().applyQuaternion(hq);
  const n = arm.palmLocal.clone().applyQuaternion(hq);
  const axis = new THREE.Vector3().crossVectors(f, n).normalize();
  arm.fingers.forEach((chain, fi) => {
    chain.forEach((bone, ji) => rotateAxis(bone, axis, curls[fi][ji]));
  });
  arm.thumb.forEach((bone, ji) => rotateAxis(bone, axis, thumbCurl * (ji === 0 ? 0.4 : 0.8)));
}

// ---------------------------------------------------------------------------
// 顔の表情レイヤー（シェーダーで顔の肌に重ねる）
// ---------------------------------------------------------------------------

const face = {
  uniforms: null,
  textures: {},
  eye: "open",
  mouth: "close",
  manualEye: null,
  manualMouth: null,
};

async function loadFaceLayers() {
  const proj = await (await fetch(`${FACE_DIR}projection.json`)).json();
  const loader = new THREE.TextureLoader();
  const load = (name) => loader.loadAsync(`${FACE_DIR}${name}.png`).then((tex) => {
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  });
  const names = ["eyes-open", "eyes-half", "eyes-closed", "mouth-small", "mouth-open", "mouth-wide"];
  const loaded = await Promise.all(names.map(load));
  names.forEach((n, i) => { face.textures[n] = loaded[i]; });
  const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  empty.needsUpdate = true;
  face.textures.none = empty;
  // 顔の肌の奥行き（ミップマップや色変換はかけない）
  const depth = await loader.loadAsync(`${FACE_DIR}face-depth.png`);
  depth.flipY = false;
  depth.colorSpace = THREE.NoColorSpace;
  depth.generateMipmaps = false;
  // 補間すると、奥行きが急に変わる境目で中間の値になり判定がぶれるので最近傍で読む
  depth.minFilter = THREE.NearestFilter;
  depth.magFilter = THREE.NearestFilter;
  face.textures.depth = depth;

  // 制服の胸元ロゴ（元テクスチャでは「BST」が崩れているので描き直したレイヤー）
  face.chest = await (await fetch(`${DECAL_DIR}chest-logo.json`)).json();
  face.textures.chestLogo = await load("../decals/chest-logo");
  const chestDepth = await loader.loadAsync(`${DECAL_DIR}chest-depth.png`);
  chestDepth.flipY = false;
  chestDepth.colorSpace = THREE.NoColorSpace;
  chestDepth.generateMipmaps = false;
  chestDepth.minFilter = THREE.NearestFilter;
  chestDepth.magFilter = THREE.NearestFilter;
  face.textures.chestDepth = chestDepth;
  return proj;
}

function installFaceOverlay(material, proj) {
  const chest = face.chest;
  const uniforms = {
    uFaceEye: { value: face.textures.none },
    uEyeFlatten: { value: 0 },
    uFaceMouth: { value: face.textures.none },
    uFaceRect: { value: new THREE.Vector4(proj.x0, proj.x1, proj.y0, proj.y1) },
    uFaceZMin: { value: proj.zMin },
    uFaceDepth: { value: face.textures.depth },
    uFaceDepthRange: { value: new THREE.Vector3(proj.depthZ0, proj.depthZ1, proj.depthTolerance) },
    uChestLogo: { value: face.textures.chestLogo },
    uChestRect: { value: new THREE.Vector4(chest.x0, chest.x1, chest.y0, chest.y1) },
    uChestZMin: { value: chest.zMin },
    uChestDepth: { value: face.textures.chestDepth },
    uChestDepthRange: { value: new THREE.Vector3(chest.depthZ0, chest.depthZ1, chest.depthTolerance) },
    uHairOffset: { value: new THREE.Vector3() },
    uHairBreeze: { value: new THREE.Vector3() },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying vec3 vFaceBind;
attribute float hairWeight;
uniform vec3 uHairOffset;
uniform vec3 uHairBreeze;`)
      // position はスキニング前（バインドポーズ）の座標。骨が動いてもレイヤーは体に貼り付いたままになる
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vFaceBind = position;
{
  // 髪の揺れ: 毛先ほど大きく、頭の骨で回る前（頭の向きに対する相対）でずらす
  vec3 off = uHairOffset * hairWeight;
  // 頭へめり込まないよう、内側へ向かう動きを弱める
  // 前髪 → 後ろ向き、横髪 → 顔の中心向き、後ろ髪 → 前向き
  if (position.z > 0.035 && position.y > 0.885) off.z = max(off.z, 0.0) + min(off.z, 0.0) * 0.2;
  if (abs(position.x) > 0.03 && off.x * position.x < 0.0) off.x *= 0.25;
  if (position.z < -0.02 && off.z > 0.0) off.z *= 0.3;
  // 束ごとに少しずれる、ごく小さなそよぎ
  off += uHairBreeze * hairWeight * sin(position.x * 140.0 + position.z * 90.0);
  transformed += off;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D uFaceEye;
uniform float uEyeFlatten;
uniform sampler2D uFaceMouth;
uniform vec4 uFaceRect;
uniform float uFaceZMin;
uniform sampler2D uFaceDepth;
uniform vec3 uFaceDepthRange;
uniform sampler2D uChestLogo;
uniform vec4 uChestRect;
uniform float uChestZMin;
uniform sampler2D uChestDepth;
uniform vec3 uChestDepthRange;
varying vec3 vFaceBind;

// 正面投影したレイヤーを取り出す。正面から見た面と同じ奥行きの面だけに塗る
// （正面から隠れていた前髪の裏や、手前の名札などには塗らない）
vec4 projectedLayer(sampler2D tex, sampler2D depthTex, vec4 rect, vec3 depthRange, float zMin) {
  vec2 uv = vec2((vFaceBind.x - rect.x) / (rect.y - rect.x), (rect.w - vFaceBind.y) / (rect.w - rect.z));
  if (any(lessThanEqual(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return vec4(0.0);
  float z = mix(depthRange.x, depthRange.y, texture2D(depthTex, uv).r);
  if (vFaceBind.z <= zMin || abs(vFaceBind.z - z) >= depthRange.z) return vec4(0.0);
  return texture2D(tex, uv);
}`)
      .replace("#include <map_fragment>", `#include <map_fragment>
float faceMask = 0.0;
{
  vec4 e = projectedLayer(uFaceEye, uFaceDepth, uFaceRect, uFaceDepthRange, uFaceZMin);
  diffuseColor.rgb = mix(diffuseColor.rgb, e.rgb, e.a);
  vec4 m = projectedLayer(uFaceMouth, uFaceDepth, uFaceRect, uFaceDepthRange, uFaceZMin);
  diffuseColor.rgb = mix(diffuseColor.rgb, m.rgb, m.a);
  vec4 c = projectedLayer(uChestLogo, uChestDepth, uChestRect, uChestDepthRange, uChestZMin);
  diffuseColor.rgb = mix(diffuseColor.rgb, c.rgb, c.a);
  faceMask = max(max(e.a * uEyeFlatten, m.a), c.a);
}`)
      // 元の法線マップには目・口・崩れた文字の凹凸が焼き込まれていて、塗り替えても陰影で透ける。
      // レイヤーを塗った部分は凹凸を平らに戻す
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, faceMask));`);
  };
  material.customProgramCacheKey = () => "worker-face-overlay";
  material.needsUpdate = true;
  face.uniforms = uniforms;
}

function applyFace() {
  if (!face.uniforms) return;
  const eye = face.manualEye ?? face.eye;
  const mouth = face.manualMouth ?? face.mouth;
  // 開いた目も表情レイヤーで描く（元テクスチャの継ぎ目の白いにじみを隠すため）
  face.uniforms.uFaceEye.value = face.textures[`eyes-${eye}`];
  face.uniforms.uEyeFlatten.value = eye === "open" ? 0 : 1;
  face.uniforms.uFaceMouth.value = mouth === "close" ? face.textures.none : face.textures[`mouth-${mouth}`];
}

const avatar = {
  model: null,
  rest: new Map(),
  hipsRest: null,
  bones: {},
  arms: {},
  legs: {},
  claspLocal: {},
  layout: null,
};

const state = {
  mode: "work",
  sit: 1, // 1=座っている 0=立っている
  typing: 1, // 1=キーボードに手 0=手を前で重ねる
  bowAngle: 0,
  bow: null,
  look: { yaw: 0, pitch: 0, vy: 0, vp: 0 },
  speaking: false,
  mouthLevel: 0,
  nextBlinkAt: 1.5,
  blinkStart: -1,
  doubleBlink: false,
  taps: { Left: { next: 0, finger: 0, start: -10 }, Right: { next: 0.07, finger: 0, start: -10 } },
  thumbTap: { next: 1.5, start: -10 },
  gripOffset: new THREE.Vector3(-0.02, -0.03, 0.07), // 手首→指先（ペンを挟む位置）。毎フレーム測り直す
};

function bone(name) {
  const b = avatar.bones[`mixamorig${name}`.toLowerCase()];
  if (!b) throw new Error(`骨が見つかりません: ${name}`);
  return b;
}

function setupRig(model) {
  model.traverse((o) => {
    if (o.isBone) {
      avatar.bones[o.name.replace(/[^a-z0-9]/gi, "").toLowerCase()] = o;
      avatar.rest.set(o, o.quaternion.clone());
    }
  });
  avatar.rig = {
    hips: bone("Hips"),
    spine: bone("Spine"), spine1: bone("Spine1"), spine2: bone("Spine2"),
    neck: bone("Neck"), head: bone("Head"),
  };
  avatar.hipsRest = avatar.rig.hips.position.clone();
  model.updateMatrixWorld(true);
  avatar.headRestInv = avatar.rig.head.getWorldQuaternion(new THREE.Quaternion()).invert();
  // 髪の慣性を測る点（頭の骨の8cm下・2cm後ろ＝毛先のあたり）
  avatar.hairAnchorLocal = avatar.rig.head.worldToLocal(
    worldPos(avatar.rig.head).add(new THREE.Vector3(0, -0.08, -0.02)));

  for (const side of ["Left", "Right"]) {
    const hand = bone(`${side}Hand`);
    const fingers = ["Index", "Middle", "Ring", "Pinky"].map((f) => [1, 2, 3].map((i) => bone(`${side}Hand${f}${i}`)));
    const thumb = [1, 2, 3].map((i) => bone(`${side}HandThumb${i}`));
    const hp = worldPos(hand);
    const finger = worldPos(bone(`${side}HandMiddle1`)).sub(hp).normalize();
    const across = worldPos(bone(`${side}HandIndex1`)).sub(worldPos(bone(`${side}HandPinky1`))).normalize();
    // 手のひらの向き（A ポーズでは体側＝太もも側を向く）
    const palm = new THREE.Vector3().crossVectors(finger, across).normalize().multiplyScalar(side === "Left" ? 1 : -1);
    const inv = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.arms[side] = {
      side,
      sign: side === "Left" ? 1 : -1, // キャラクターの左 = +X
      shoulder: bone(`${side}Shoulder`),
      upper: bone(`${side}Arm`),
      fore: bone(`${side}ForeArm`),
      hand,
      fingers,
      thumb,
      // 指先（末端の骨）。ペンをつまむ指先合わせに使う
      tips: ["Index", "Middle", "Ring", "Pinky", "Thumb"].map((f) => bone(`${side}Hand${f}4`)),
      fingerLocal: finger.clone().applyQuaternion(inv),
      palmLocal: palm.clone().applyQuaternion(inv),
    };
    avatar.legs[side] = {
      upper: bone(`${side}UpLeg`),
      lower: bone(`${side}Leg`),
      foot: bone(`${side}Foot`),
    };
  }
}

function computeLayout() {
  const L = avatar.arms.Left;
  const shoulder = worldPos(L.upper);
  const elbow = worldPos(L.fore);
  const hand = worldPos(L.hand);
  const upperLen = shoulder.distanceTo(elbow);
  const foreLen = elbow.distanceTo(hand);
  const thigh = worldPos(avatar.legs.Left.upper).distanceTo(worldPos(avatar.legs.Left.lower));
  const hipJoint = worldPos(avatar.legs.Left.upper);
  const head = worldPos(avatar.rig.head);

  // 座ると腰（股関節）が太ももの長さだけ下がる（太もも水平・すね垂直）
  const sitDrop = thigh;
  const seatedShoulder = shoulder.clone().add(new THREE.Vector3(0, -sitDrop, 0.03));
  const seatedHead = head.clone().add(new THREE.Vector3(0, -sitDrop, 0.03));

  // キーボードは座ったときの肘の高さより少し下、手を自然に前へ出した位置
  const homeRow = new THREE.Vector3(0.0, seatedShoulder.y - upperLen * 0.95, seatedShoulder.z + foreLen * 0.9 + 0.06);
  // 手首（homeRow）よりキーボードを前に置き、指先がキーの上に来るようにする
  const keyboard = homeRow.clone().add(new THREE.Vector3(0.02, -0.042, 0.075));
  const deskTopY = keyboard.y - 0.009;
  const deskBackZ = keyboard.z - 0.2;
  const deskFrontZ = hipJoint.z + thigh + 0.32; // 膝が机の下に収まる奥行き

  const monitor = new THREE.Vector3(0.42, deskTopY + 0.25, keyboard.z + 0.1);
  const toHead = seatedHead.clone().sub(monitor);
  const monitorYaw = Math.atan2(-toHead.x, -toHead.z);

  avatar.layout = {
    shoulder, upperLen, foreLen, thigh, sitDrop, head, seatedHead,
    homeRow, keyboard, deskTopY, deskBackZ, deskFrontZ,
    monitor, monitorYaw,
    // 立ったとき足首の間を14cmほどに寄せる角度
    legIn: (() => {
      const hip = worldPos(avatar.legs.Left.upper);
      const ankle = worldPos(avatar.legs.Left.foot);
      const len = hip.y - ankle.y;
      return Math.atan2(ankle.x - hip.x, len) - Math.atan2(0.07 - hip.x, len);
    })(),
    seatY: hipJoint.y - sitDrop - 0.06,
    seatZ: hipJoint.z - 0.04,
  };

  // 低い位置の手は骨盤基準。お辞儀で上体を傾けても腹部へ入り込ませない。
  const spine1 = avatar.rig.spine1;
  const hips = avatar.rig.hips;
  const s1 = worldPos(spine1);
  // Reference illustration: relaxed elbows, wrists below the belt line,
  // left hand resting on the back of the right rather than crossing high up.
  const belly = s1.clone().add(new THREE.Vector3(0, -0.08, 0.105));
  // Anchor the low clasp to the pelvis: a bow must not pull fingers through
  // the abdomen as the upper spine tilts forward.
  avatar.claspRestInverse = hips.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const side of ["Left", "Right"]) {
    const sign = avatar.arms[side].sign;
    // 左手を右手の上に重ねる（手首は少し離し、指先が中央で重なる）
    const t = belly.clone().add(new THREE.Vector3(sign * 0.076, side === "Left" ? 0.006 : -0.006, side === "Left" ? 0.023 : 0.0));
    avatar.claspLocal[side] = hips.worldToLocal(t.clone());
  }
}

function resetPose() {
  for (const [b, q] of avatar.rest) b.quaternion.copy(q);
  avatar.rig.hips.position.copy(avatar.hipsRest);
  avatar.model.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// 毎フレームの姿勢
// ---------------------------------------------------------------------------

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

const debug = { bowAngle: null, hairOffset: null };

function updateBow(t) {
  if (debug.bowAngle !== null) { state.bowAngle = THREE.MathUtils.degToRad(debug.bowAngle); return; }
  const b = state.bow;
  if (!b) { state.bowAngle = 0; return; }
  const e = t - b.start;
  let k;
  if (e < b.down) k = ease(e / b.down);
  else if (e < b.down + b.hold) k = 1;
  else if (e < b.down + b.hold + b.up) k = 1 - ease((e - b.down - b.hold) / b.up);
  else { k = 0; state.bow = null; b.resolve(); }
  state.bowAngle = b.angle * k;
}

/** 立つ・座るの順番: 立つときは先に手をキーボードから離し、座るときは座ってから手を置く。 */
function updateTransitions(dt) {
  if (state.mode === "work") {
    state.sit = approach(state.sit, 1, 2.6, dt);
    state.typing = approach(state.typing, state.sit > 0.85 ? 1 : 0, 4.5, dt);
  } else {
    state.typing = approach(state.typing, 0, 5.0, dt);
    state.sit = approach(state.sit, state.typing < 0.35 ? 0 : 1, 2.6, dt);
  }
  if (state.sit < 0.002) state.sit = 0;
  if (state.sit > 0.998) state.sit = 1;
}

function updatePose(t, dt) {
  const { rig, arms, legs, layout } = avatar;
  resetPose();

  const sit = ease(state.sit);
  const w = state.typing;

  // 腰を下ろし、太ももを前へ・すねを下へ（座る）
  translateWorld(rig.hips, new THREE.Vector3(0, -layout.sitDrop * sit, 0.0));
  for (const side of ["Left", "Right"]) {
    const leg = legs[side];
    rotateAxis(leg.upper, AX, -Math.PI / 2 * sit);
    rotateAxis(leg.lower, AX, Math.PI / 2 * sit);
    rotateAxis(leg.upper, AY, arms[side].sign * 0.06 * sit); // 膝を少し開く
    // 立っているときは足をそろえ、足の裏は床と平行に戻す
    const stand = 1 - sit;
    rotateAxis(leg.upper, AZ, -arms[side].sign * layout.legIn * stand);
    rotateAxis(leg.foot, AZ, arms[side].sign * layout.legIn * stand);
  }

  // 立ち上がる・座る途中は前かがみになる（実際の人の動き）
  const rising = 4 * state.sit * (1 - state.sit); // 中間で最大
  const breath = Math.sin(t * Math.PI * 2 / 3.8);
  rotateAxis(rig.spine, AZ, Math.sin(t * 0.47) * 0.01);
  rotateAxis(rig.spine, AX, rising * 0.32);
  rotateAxis(rig.spine2, AX, breath * 0.012 + w * 0.07);
  // 待機動作（メモ・伸び）の体のチャンネル。fade は来客などで中断したときだけ 1→0
  const ip = idlePose, fade = ip.kind ? ip.fade : 0;
  const W = ip.kind === 'write' ? writeChannels(ip.elapsed) : null;
  const S = ip.kind === 'stretch' ? stretchChannels(ip.elapsed) : null;
  if (W) {
    // 紙に向かって少し前へかがみ、メモ帳のある右へ体をひねり、右肩を少し下げる
    const k = W.body * fade;
    rotateAxis(rig.spine1, AX, k * 0.05);
    rotateAxis(rig.spine2, AX, k * 0.045);
    rotateAxis(rig.spine1, AY, -k * 0.10);
    rotateAxis(rig.spine2, AY, -k * 0.07);
    rotateAxis(rig.spine1, AZ, k * 0.035);
  }
  if (S) {
    // 背中を反らせ、胸を開き、伸びのピークで少し左へ傾く
    rotateAxis(rig.spine1, AX, -S.back * fade);
    rotateAxis(rig.spine2, AX, -S.chest * fade);
    rotateAxis(rig.spine1, AZ, -S.lean * fade);
  }
  const bow = state.bowAngle;
  rotateAxis(rig.spine, AX, bow * 0.42);
  rotateAxis(rig.spine1, AX, bow * 0.33);
  rotateAxis(rig.spine2, AX, bow * 0.25);
  if (S) for (const side of ["Left", "Right"]) {
    rotateAxis(arms[side].shoulder, AZ, arms[side].sign * S.shoulder * fade);
    rotateAxis(arms[side].shoulder, AY, arms[side].sign * S.squeeze * fade); // 肩甲骨を寄せる（肩を後ろへ）
  }

  // 視線: 作業中はモニター、それ以外は来客（カメラ）を見る
  const headPos = worldPos(rig.head);
  const lookTarget = w > 0.5 ? layout.monitor.clone() : camera.position.clone();
  let writeLook = 0;
  if (W) {
    // 目はペン先を追う（手より先にメモ帳へ、考える間は画面をちらっと見る）
    const tip = penTipWorld(ip.elapsed, W);
    writeLook = W.gaze * (1 - 0.7 * W.think) * fade; // 考える間は画面の方へ目線を上げる（向き切らない）
    lookTarget.lerp(tip, writeLook);
  }
  if (S) lookTarget.lerp(headPos.clone().add(new THREE.Vector3(0.0, -0.05, 1.0)), (1 - S.gazeMonitor) * fade);
  const d = lookTarget.sub(headPos);
  let yaw = Math.atan2(d.x, d.z);
  let pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
  if (W) {
    // 手元を見るとき、首は目線の半分ほどだけ回す（残りは目の動き＝伏し目で見せる）。体のひねりの分も差し引く
    const toPad = writeLook;
    yaw = THREE.MathUtils.lerp(yaw, yaw * 0.5 + 0.10, toPad);
  }
  yaw = THREE.MathUtils.clamp(yaw, -0.7, 0.7);
  pitch = THREE.MathUtils.clamp(pitch, -0.3, 0.45 - 0.07 * writeLook); // 書くときも顔が髪で隠れない深さまで
  if (W) {
    // 書いている行に合わせてうなずくように少し上下し、ゆっくりした呼吸の揺れを足す（首が固まって見えないように）
    const k = MEMO.keys, tipNow = memoTip(THREE.MathUtils.clamp(ip.elapsed, k[0].t, k[k.length - 1].t));
    const lineFollow = W.write * (1 - W.think);
    pitch += writeLook * (lineFollow * -2.6 * (tipNow.v - 0.012) + 0.024 * Math.sin(t * 2.1) + 0.014 * Math.sin(t * 0.83 + 1));
    yaw += writeLook * (lineFollow * -2.2 * tipNow.u + 0.02 * Math.sin(t * 0.61));
  }
  const settled = 1 - writeLook - (S ? (1 - S.gazeMonitor) * fade : 0);
  if (w > 0.5) pitch += (Math.sin(t * 0.37) * 0.05 + 0.08) * Math.max(0, settled); // 画面と手元を行き来する
  else {
    yaw += Math.sin(t * 0.31) * 0.05;
    pitch += Math.sin(t * 0.23 + 1) * 0.03;
  }
  // 紙を見るときは速く、戻るときはゆっくり
  const lookRate = W ? 5.2 : 6.0; // 首を振る速さ（書く間は落ち着いてゆっくり）
  // 視線はばね（臨界減衰）で追う。動き出しと止まりがなめらかで、急に首を振らない
  const lk = state.look, steps = Math.max(1, Math.ceil(dt / 0.01)), h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    lk.vy += (lookRate * lookRate * (yaw - lk.yaw) - 2 * lookRate * lk.vy) * h; lk.yaw += lk.vy * h;
    lk.vp += (lookRate * lookRate * (pitch - lk.pitch) - 2 * lookRate * lk.vp) * h; lk.pitch += lk.vp * h;
  }
  const bowLook = bow * 0.35;
  const headUp = S ? S.headUp * fade : 0;
  // うつむく → 横を向く の順に回す（逆にすると、横を向いたままうつむいたとき首が傾いて見える）
  rotateAxis(rig.neck, AX, state.look.pitch * 0.4 + bowLook * 0.4 - headUp * 0.45);
  rotateAxis(rig.head, AX, state.look.pitch * 0.6 + bowLook * 0.6 - headUp * 0.55);
  rotateAxis(rig.neck, AY, state.look.yaw * 0.4);
  rotateAxis(rig.head, AY, state.look.yaw * 0.6);
  if (W) rotateAxis(rig.head, AZ, 0.06 * writeLook); // 書くときは首を少し右へかしげる

  // 腕と指
  const busy = W ? Math.max(W.reach, W.left) * fade : S ? S.arm * fade : 0;
  updateTaps(t, w * (1 - busy));
  const claspRotation = rig.hips.getWorldQuaternion(new THREE.Quaternion()).multiply(avatar.claspRestInverse);
  for (const side of ["Left", "Right"]) {
    const arm = arms[side];
    const s = arm.sign;
    arm.elbowOutset = 0.06 * (1 - (S ? Math.min(1, S.arm * fade) : 0));
    const clasp = rig.hips.localToWorld(avatar.claspLocal[side].clone());
    // Give cuffs and forearms a little clearance as the vest tilts in a bow.
    clasp.z += Math.max(0, Math.sin(state.bowAngle)) * 0.05;

    const tap = state.taps[side];
    const press = tapPress(t, tap.start) * (1 - busy);
    const drift = new THREE.Vector3(
      Math.sin(t * 0.8 + (s > 0 ? 0 : 2.1)) * 0.018,
      -press * 0.006,
      Math.sin(t * 0.55 + (s > 0 ? 1 : 0)) * 0.012,
    );
    const type = layout.homeRow.clone().add(new THREE.Vector3(s * 0.08, 0.012, 0)).add(drift);
    const goal = clasp.clone().lerp(type, w);
    const claspPole = new THREE.Vector3(s * 0.12, -0.38, 0.0).applyQuaternion(claspRotation);
    const typePole = new THREE.Vector3(s * 0.4, -0.3, -0.2);
    let pole = worldPos(arm.upper).add(claspPole.lerp(typePole, w));

    // 手の向き: 重ねるときは手のひらを体へ、打つときは手のひらを下へ
    const claspFinger = new THREE.Vector3(-s * 0.64, -0.76, 0.025).applyQuaternion(claspRotation);
    const claspPalm = new THREE.Vector3(-s * 0.07, -0.01, -1).applyQuaternion(claspRotation);
    const typeFinger = new THREE.Vector3(-s * 0.1, -0.14, 1);
    const typePalm = new THREE.Vector3(0, -1, 0.12);
    let handQ = basis(claspFinger.lerp(typeFinger, w).normalize(), claspPalm.lerp(typePalm, w).normalize());

    // 指: 重ねるときは閉じてそろえ、打つときは少しだけ寄せる
    let close = [0.95 - 0.70 * w, 0.70 - 0.50 * w];
    let curls = [0, 1, 2, 3].map((fi) => {
      // 軽く丸める程度（曲げすぎるとこぶしに見える）
      const base = [0.08 + 0.06 * w, 0.10 + 0.30 * w, 0.06 + 0.16 * w];
      const p = w * (fi === tap.finger ? press : 0);
      return [base[0] + p * 0.38, base[1] + p * 0.22, base[2] + p * 0.08];
    });
    const thumbPress = side === "Right" ? tapPress(t, state.thumbTap.start) * w * (1 - busy) : 0;
    let thumb = 0.07 + 0.20 * w + thumbPress * 0.35;

    let grip = null; // 指先（親指と人差し指の間）で合わせたい位置
    let wristMax = THREE.MathUtils.lerp(42, 180, w);
    if (W && side === 'Right') {
      const plan = writeHandPlan(ip.elapsed, W);
      const k = W.reach * fade;
      grip = { target: plan.grip, k, lift: plan.transit * 0.05 * fade };
      handQ = handQ.slerp(plan.q, k);
      curls = mixCurls(curls, plan.curls, k);
      close = [THREE.MathUtils.lerp(close[0], 0.92, k), THREE.MathUtils.lerp(close[1], 0.2 + 0.35 * plan.write, k)];
      thumb = THREE.MathUtils.lerp(thumb, plan.thumb, k);
      wristMax = THREE.MathUtils.lerp(180, 42, Math.min(1, k * 3)); // 書く手は軽く曲げ、ペン先合わせの余裕も保つ
      pole.lerp(worldPos(arm.upper).add(new THREE.Vector3(-0.32, -0.62, 0.04)), k); // 肘を低く保ち、袖がベストへ入らない余裕を確保
    } else if (W && side === 'Left') {
      // 左手はキーボードの手前、メモ帳寄りの机の上にそっと置いて休める
      const k = W.left * fade;
      const rest = new THREE.Vector3(-0.035, layout.deskTopY + 0.065, layout.homeRow.z - 0.058);
      goal.lerp(rest, k).add(new THREE.Vector3(0, Math.sin(Math.PI * k) * 0.022, 0));
      handQ = handQ.slerp(basis(new THREE.Vector3(-0.62, -0.16, 0.77).normalize(), new THREE.Vector3(0.05, -1, 0.1).normalize()), k);
      curls = mixCurls(curls, [[0.12, 0.20, 0.12], [0.14, 0.22, 0.13], [0.16, 0.24, 0.14], [0.18, 0.26, 0.15]], k);
      thumb = THREE.MathUtils.lerp(thumb, 0.18, k);
      wristMax = THREE.MathUtils.lerp(180, 32, Math.min(1, k * 1.5));
      pole.lerp(worldPos(arm.upper).add(new THREE.Vector3(0.50, -0.3, 0.10)), k);
    } else if (S) {
      const SA = side === 'Right' ? stretchChannels(ip.elapsed, 0.07) : S; // 右腕は少し遅れて付いてくる
      const k = SA.arm * fade;
      const mid = worldPos(arms.Left.upper).add(worldPos(arms.Right.upper)).multiplyScalar(0.5);
      const target = mid.clone().add(new THREE.Vector3(s * SA.wrist[0], SA.wrist[1], SA.wrist[2]));
      goal.lerp(target, k);
      const f = new THREE.Vector3(s * SA.finger[0], SA.finger[1], SA.finger[2]).normalize();
      const n = new THREE.Vector3(s * SA.palm[0], SA.palm[1], SA.palm[2]).normalize();
      handQ = handQ.slerp(basis(f, n), k);
      // 指を組んでいる間は軽く握り合わせ、ほどいたら力を抜いて少し開く
      const il = SA.interlock;
      const c = SA.curl;
      const fingers = [0, 1, 2, 3].map((fi) => [c * (0.9 + fi * 0.08), c * 1.2, c * 0.7]);
      curls = mixCurls(curls, fingers, k);
      // 親指は人差し指に沿わせる（立てると頭の上でピースのように見える）
      close = [THREE.MathUtils.lerp(close[0], 0.95, k), THREE.MathUtils.lerp(close[1], 0.45 + 0.4 * il, k)]; // ほどいた後も指はそろえて力を抜く
      thumb = THREE.MathUtils.lerp(thumb, 0.05, k);
      pole.lerp(worldPos(arm.upper).add(new THREE.Vector3(s * SA.pole[0], SA.pole[1], SA.pole[2])), k);
      // 指を組んで手のひらを天井へ向ける間だけは手首を大きく反らす。ほどいた後は手首を伸ばす
      wristMax = THREE.MathUtils.lerp(180, THREE.MathUtils.lerp(32, 180, il), Math.min(1, k * 1.5));
    }

    // 1回目: 手首を仮の位置へ → 向き・指を決める
    const guess = grip ? goal.clone().lerp(grip.target.clone().sub(state.gripOffset), grip.k) : goal;
    if (grip) guess.y += grip.lift;
    solveArm(arm, guess, pole);
    orientHandQ(arm, handQ);
    limitWrist(arm, wristMax);
    closeFingers(arm, close[0], close[1]);
    curlFingers(arm, curls, thumb);
    if (grip) {
      // 2回目: 実際の指先の位置を測り、指先が狙いの位置に来るよう手首を合わせる
      const offset = fingerGrip(arm).sub(worldPos(arm.hand));
      state.gripOffset.copy(offset);
      const wrist = goal.clone().lerp(grip.target.clone().sub(offset), grip.k);
      wrist.y += grip.lift;
      solveArm(arm, wrist, pole);
      orientHandQ(arm, handQ);
      limitWrist(arm, wristMax);
      idlePose.gripError = fingerGrip(arm).distanceTo(grip.target) * (grip.k > 0.99 ? 1 : 0);
      gripPen(arm, ip.elapsed, W, fade, grip.k);
    }
  }
  if (!W) restPen();
}

function mixCurls(a, b, k) {
  return a.map((row, i) => row.map((v, j) => THREE.MathUtils.lerp(v, b[i][j], k)));
}

/** 親指と人差し指の先の間（ペンを挟む位置）。 */
function fingerGrip(arm) {
  return worldPos(arm.tips[0]).lerp(worldPos(arm.tips[4]), 0.5);
}

/** 指先を target へ寄せる（CCD法。付け根に近い関節ほど少しずつ、1回あたりの回転は控えめに）。 */
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _fq = new THREE.Quaternion(), _id = new THREE.Quaternion();
function reachFinger(chain, tip, target, strength) {
  if (strength <= 0) return;
  for (let it = 0; it < 5; it += 1) {
    for (let j = chain.length - 1; j >= 0; j -= 1) {
      const p = worldPos(chain[j]);
      _from.copy(worldPos(tip)).sub(p).normalize();
      _to.copy(target).sub(p).normalize();
      _fq.setFromUnitVectors(_from, _to);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(_fq.w)));
      const k = Math.min(1, 0.6 / Math.max(angle, 1e-6)) * strength;
      rotateWorld(chain[j], _id.clone().slerp(_fq, k));
    }
  }
}

/** キーを打つ指の予定を決める（人差し指・中指を多めに）。 */
function updateTaps(t, w) {
  if (w < 0.6) return;
  for (const side of ["Left", "Right"]) {
    const tap = state.taps[side];
    if (t >= tap.next) {
      const r = Math.random();
      tap.finger = r < 0.38 ? 0 : r < 0.7 ? 1 : r < 0.88 ? 2 : 3;
      tap.start = t;
      // ときどき手を止めて画面を読む
      tap.next = t + (Math.random() < 0.08 ? 0.8 + Math.random() * 0.9 : 0.12 + Math.random() * 0.16);
    }
  }
  if (t >= state.thumbTap.next) {
    state.thumbTap.start = t;
    state.thumbTap.next = t + 1.2 + Math.random() * 2.4;
  }
}

/** 押し込み量（0→1→0、約0.11秒）。 */
function tapPress(t, start) {
  const e = (t - start) / 0.11;
  return e >= 0 && e < 1 ? Math.sin(Math.PI * e) : 0;
}

// ---------------------------------------------------------------------------
// 髪の揺れ（頭の動きに遅れてバネのように揺れる・お辞儀で前へ垂れる）
// ---------------------------------------------------------------------------

const hairSim = {
  x: new THREE.Vector3(), // 毛先のずれ（頭の向きに対する相対、メートル）
  v: new THREE.Vector3(),
  prevPos: null,
  prevVel: new THREE.Vector3(),
  acc: new THREE.Vector3(),
};
const HAIR = { stiffness: 150, damping: 6.5, droop: 0.035, inertia: 0.6, maxOffset: 0.025 };

function updateHair(t, dt) {
  if (!face.uniforms || dt <= 0) return;
  const head = avatar.rig.head;
  head.updateWorldMatrix(true, false);
  // 毛先あたり（頭の骨の少し下・後ろ）の点の加速度で、髪にかかる慣性を見積もる
  const p = head.localToWorld(avatar.hairAnchorLocal.clone());
  const vel = hairSim.prevPos ? p.clone().sub(hairSim.prevPos).divideScalar(dt) : new THREE.Vector3();
  const rawAcc = vel.clone().sub(hairSim.prevVel).divideScalar(dt);
  if (!hairSim.prevPos) rawAcc.set(0, 0, 0);
  hairSim.acc.lerp(rawAcc, 0.5); // 揺れすぎないよう少しならす
  hairSim.prevPos = p;
  hairSim.prevVel = vel;

  // 頭の向き（初期姿勢に対する回転）の逆で、ワールドの向きを頭から見た向きに直す
  const toHead = head.getWorldQuaternion(new THREE.Quaternion()).multiply(avatar.headRestInv).invert();
  // 頭を傾けると、髪は重力で下へ垂れる（お辞儀で前へ落ちる）
  const target = new THREE.Vector3(0, -1, 0).applyQuaternion(toHead).add(new THREE.Vector3(0, 1, 0)).multiplyScalar(HAIR.droop);
  const inertia = hairSim.acc.clone().applyQuaternion(toHead).multiplyScalar(HAIR.inertia);

  const steps = 2;
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const a = target.clone().sub(hairSim.x).multiplyScalar(HAIR.stiffness)
      .addScaledVector(hairSim.v, -HAIR.damping)
      .sub(inertia);
    hairSim.v.addScaledVector(a, h);
    hairSim.x.addScaledVector(hairSim.v, h);
  }
  if (hairSim.x.length() > HAIR.maxOffset) hairSim.x.setLength(HAIR.maxOffset);

  const offset = debug.hairOffset ? new THREE.Vector3(...debug.hairOffset) : hairSim.x;
  face.uniforms.uHairOffset.value.copy(offset).divideScalar(avatar.scale);
  face.uniforms.uHairBreeze.value.set(Math.sin(t * 1.3), 0, Math.cos(t * 1.07)).multiplyScalar(0.0012 / avatar.scale);
}

// ---------------------------------------------------------------------------
// まばたき・口
// ---------------------------------------------------------------------------

function updateBlink(t) {
  if (!autoBlink) { face.eye = "open"; return; }
  if (state.blinkStart < 0 && t >= state.nextBlinkAt) {
    state.blinkStart = t;
    state.doubleBlink = Math.random() < 0.18;
  }
  if (state.blinkStart < 0) { face.eye = "open"; return; }
  const e = t - state.blinkStart;
  // 半目 → 閉じ → 半目 → 開き（約0.2秒）
  if (e < 0) face.eye = "open";
  else if (e < 0.05) face.eye = "half";
  else if (e < 0.12) face.eye = "closed";
  else if (e < 0.18) face.eye = "half";
  else {
    face.eye = "open";
    if (state.doubleBlink) {
      state.doubleBlink = false;
      state.blinkStart = t + 0.12;
    } else {
      state.blinkStart = -1;
      state.nextBlinkAt = t + 2.4 + Math.random() * 3.6;
    }
  }
}


const [gltf, proj, hairWeights] = await Promise.all([
  new GLTFLoader().loadAsync(MODEL_URL), loadFaceLayers(),
  fetch(new URL('./model-assets/hair-weights.bin', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('髪のデータを読み込めません');
    return r.arrayBuffer();
  }),
]);
const model = gltf.scene;
const bounds = new THREE.Box3().setFromObject(model);
const scale = 1.6 / (bounds.max.y - bounds.min.y);
model.scale.setScalar(scale);
model.position.set(0, -bounds.min.y * scale, 0);
avatar.scale = scale; avatar.model = model;
scene.add(model);
model.traverse(o => {
  if (!o.isMesh) return;
  o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
  const weights = new Uint8Array(hairWeights);
  if (weights.length !== o.geometry.attributes.position.count) throw new Error('髪の重みの頂点数が合いません');
  o.geometry.setAttribute('hairWeight', new THREE.Uint8BufferAttribute(weights, 1, true));
  for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
    mat.metalness = 0; mat.metalnessMap = null;
    mat.roughnessMap = null; mat.roughness = 0.96;
    installFaceOverlay(mat, proj);
  }
});
model.updateMatrixWorld(true); setupRig(model); computeLayout();
// Use Claude's complete scene with the same model-relative contact points.
const l = avatar.layout, y = l.deskTopY;
const environment = buildReception(scene, l, createEnvironmentMap(renderer));
avatar.chair = environment.chair;
// ペン（ペン先・グリップ・軸・クリップ）。ローカル座標でペン先が原点、軸は +Y。
const PEN_GRIP = 0.026, PEN_R = 0.0042;
const pen = new THREE.Group();
{
  const navy = new THREE.MeshStandardMaterial({ color: 0x1b3a5e, roughness: 0.35, metalness: 0.15 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc4c9cf, roughness: 0.3, metalness: 0.8 });
  const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; pen.add(m); return m; };
  const nib = part(new THREE.ConeGeometry(0.0028, 0.012, 16), silver, 0.006); nib.rotation.z = Math.PI;
  part(new THREE.CylinderGeometry(0.0042, 0.0034, 0.032, 16), rubber, 0.028);
  part(new THREE.CylinderGeometry(0.0040, 0.0042, 0.084, 16), navy, 0.086);
  part(new THREE.CylinderGeometry(0.0026, 0.0030, 0.008, 12), silver, 0.132);
  const clipBar = part(new THREE.BoxGeometry(0.0013, 0.040, 0.0030), silver, 0.104); clipBar.position.x = 0.0047;
}
scene.add(pen);

// メモ帳の座標（u=書く人の右, v=紙の上）→ ワールド
const papers = environment.papers;
papers.updateMatrixWorld(true);
const padPoint = (u, v, h = 0) => papers.localToWorld(new THREE.Vector3(-u, MEMO_SURFACE + h, v));
const padDir = (u, v) => new THREE.Vector3(-u, 0, v).applyQuaternion(papers.getWorldQuaternion(new THREE.Quaternion())).normalize();

// 書く手の向き（手のひらは下・体の中心側、指は前へ）と、そのときのペンの向き（ペン先→後ろ、右肩の方へ寝かせる）
const WRITE_HAND_Q = basis(new THREE.Vector3(0.22, -0.40, 0.89).normalize(), new THREE.Vector3(0.86, -0.50, 0.08).normalize());
const WRITE_AXIS = new THREE.Vector3(-0.30, 0.74, -0.60).normalize();
// Keep the original hand pose, placing the pen 18mm toward the gap between
// index and thumb instead of alongside the outer edge of the thumb.
const PEN_IN_HAND = new THREE.Vector3(-0.018, 0, 0.002);
// 机に寝ているペンは上からつまむ（手のひらを下、指先を斜め下・前へ）。持ち上げながら書く持ち方へ持ち替える
const GRASP_HAND_Q = basis(new THREE.Vector3(0.28, -0.55, 0.79).normalize(), new THREE.Vector3(0.35, -0.94, 0.0).normalize());
const REST_TIP = padPoint(WRITE.penRest.tip[0], WRITE.penRest.tip[1], PEN_R);
const REST_AXIS = padDir(WRITE.penRest.axis[0], WRITE.penRest.axis[1]);
const REST_Q = new THREE.Quaternion().setFromUnitVectors(AY, REST_AXIS);
const TO_WRITE = new THREE.Quaternion().setFromUnitVectors(REST_AXIS, WRITE_AXIS);

/** 手の滑らかな動き用に、ペン先の経路を前後0.1秒でならす（細かい字の揺れはペンを指の中で傾けて出す）。 */
function smoothTip(e) {
  const k = MEMO.keys, t0 = k[0].t, t1 = k[k.length - 1].t;
  let u = 0, v = 0, lift = 0, n = 0;
  for (let i = -3; i <= 3; i += 1) {
    const p = memoTip(THREE.MathUtils.clamp(e + i * 0.033, t0, t1));
    const wgt = 4 - Math.abs(i);
    u += p.u * wgt; v += p.v * wgt; lift += p.lift * wgt; n += wgt;
  }
  return { u: u / n, v: v / n, lift: lift / n };
}

/** その時刻にペンがあるべき姿勢（ペン先・軸）と、手が向かう先（ならした経路）。 */
function penPoseAt(e, W) {
  const k = MEMO.keys;
  const ce = THREE.MathUtils.clamp(e, k[0].t, k[k.length - 1].t);
  const exact = memoTip(ce), soft = smoothTip(ce);
  const writeTip = padPoint(exact.u, exact.v, exact.lift);
  // 手は、ならした経路から6mm以上離れないように付いていく
  const softTip = padPoint(soft.u, soft.v, soft.lift);
  const gap = writeTip.clone().sub(softTip);
  if (gap.length() > 0.006) softTip.add(gap.multiplyScalar(1 - 0.006 / gap.length()));
  // つまんだら1.2cm持ち上げ、置く直前に下ろす
  const liftUp = Math.min(THREE.MathUtils.smoothstep(e, WRITE.grasp, WRITE.grasp + 0.14), 1 - THREE.MathUtils.smoothstep(e, WRITE.release - 0.32, WRITE.release - 0.08));
  const rest = REST_TIP.clone().add(new THREE.Vector3(0, 0.012 * liftUp, 0));
  const arc = new THREE.Vector3(0, 0.028 * Math.sin(Math.PI * W.write), 0); // 紙へ運ぶときは弧を描く
  const tip = rest.clone().lerp(writeTip, W.write).add(arc);
  const handTip = rest.clone().lerp(softTip, W.write).add(arc);
  const turn = new THREE.Quaternion().slerp(TO_WRITE, W.write); // 寝ているペンを書く角度へ起こす
  const axis = REST_AXIS.clone().applyQuaternion(turn);
  const q = GRASP_HAND_Q.clone().slerp(WRITE_HAND_Q, W.write);
  return { tip, handTip, axis, q };
}
function penTipWorld(e, W) { return penPoseAt(e, W).tip; }

const OPEN = [[0.10, 0.18, 0.10], [0.14, 0.22, 0.12], [0.18, 0.26, 0.14], [0.22, 0.30, 0.16]];
const PINCH = [[0.40, 0.55, 0.30], [0.52, 0.70, 0.40], [0.64, 0.80, 0.45], [0.72, 0.85, 0.48]];
const WRITE_GRIP = [[0.50, 0.55, 0.28], [0.80, 1.00, 0.55], [1.15, 1.25, 0.75], [1.25, 1.30, 0.75]];
/** 右手の計画: 指先を合わせる位置・手の向き・指の曲げ。 */
function writeHandPlan(e, W) {
  const pose = penPoseAt(e, W);
  const grip = pose.handTip.clone().addScaledVector(pose.axis, PEN_GRIP).sub(PEN_IN_HAND);
  // つまむ前は上から近づいて下ろし、置いた後は指を開きながら少し上げる
  const hoverIn = 1 - THREE.MathUtils.smoothstep(e, 1.05, 1.52);
  const hoverOut = THREE.MathUtils.smoothstep(e, WRITE.release - 0.02, WRITE.release + 0.30);
  grip.y += 0.028 * Math.max(hoverIn, hoverOut);
  const closeK = Math.min(THREE.MathUtils.smoothstep(e, 1.28, WRITE.grasp), 1 - THREE.MathUtils.smoothstep(e, WRITE.release - 0.06, WRITE.release + 0.18));
  const curls = mixCurls(mixCurls(OPEN, PINCH, closeK), WRITE_GRIP, W.write);
  const thumb = THREE.MathUtils.lerp(0.08, 0.42, closeK) + 0.38 * W.write;
  return { grip, q: pose.q, curls, thumb, write: W.write, transit: Math.sin(Math.PI * W.reach) };
}

/**
 * ペンを手に持たせ、指先をペンに添える。
 * ペンは、手の指の間を支点にしてペン先が字の経路にぴったり乗るよう傾ける（手はならした経路で滑らかに動く）。
 * 人差し指は上から、親指は体の側から、中指は外側の下から支える（3本の指で持つ普通の持ち方）。
 */
const _penQ = new THREE.Quaternion();
function gripPen(arm, e, W, fade, reachK) {
  const pose = penPoseAt(e, W);
  // 中断されたときは、手が戻るより先にペンを置き場所へ戻す（紙にめり込ませない）
  const held = W.held * THREE.MathUtils.smoothstep(fade, 0.55, 1);
  let tip = REST_TIP.clone(), axis = REST_AXIS.clone();
  if (held > 0) {
    const g = fingerGrip(arm).add(PEN_IN_HAND);
    const pivot = g.clone().sub(pose.tip).normalize();
    const heldAxis = pivot.dot(pose.axis) > 0.85 ? pivot : pose.axis.clone();
    const heldTip = g.clone().addScaledVector(heldAxis, -PEN_GRIP);
    tip.lerp(heldTip, held);
    axis.lerp(heldAxis, held).normalize();
  }
  _penQ.setFromUnitVectors(AY, axis);
  pen.position.copy(tip);
  pen.quaternion.copy(_penQ);
  // 指先を添える（つまむ直前から、置いて離すまで）
  const touch = Math.max(THREE.MathUtils.smoothstep(e, 1.30, WRITE.grasp), held) * (1 - THREE.MathUtils.smoothstep(e, WRITE.release - 0.04, WRITE.release + 0.2)) * fade * reachK;
  if (touch <= 0.001) return;
  const g = tip.clone().addScaledVector(axis, PEN_GRIP);
  const up = AY.clone().addScaledVector(axis, -axis.y).normalize(); // ペンの上側
  const side = new THREE.Vector3().crossVectors(axis, up).normalize();
  if (side.x < 0) side.negate(); // 体の中心側
  const r = PEN_R + 0.0035;
  reachFinger(arm.fingers[0], arm.tips[0], g.clone().addScaledVector(axis, 0.007).addScaledVector(up, r), touch);
  reachFinger(arm.thumb, arm.tips[4], g.clone().addScaledVector(axis, -0.002).addScaledVector(side, r).addScaledVector(up, 0.002), touch);
  reachFinger(arm.fingers[1], arm.tips[1], g.clone().addScaledVector(axis, -0.012).addScaledVector(side, -r).addScaledVector(up, -0.002), touch * 0.8);
}
function restPen() { pen.position.copy(REST_TIP); pen.quaternion.copy(REST_Q); }
restPen();

// 筆跡（書き終えた線分だけ表示）。メモ帳の子にして、メモ帳の座標で置く
const inkPoints = new Float32Array(MEMO.ink.length * 6);
MEMO.ink.forEach((seg, i) => {
  inkPoints.set([-seg.a[0], MEMO_SURFACE + 0.0004, seg.a[1], -seg.b[0], MEMO_SURFACE + 0.0004, seg.b[1]], i * 6);
});
const inkGeometry = new THREE.BufferGeometry();
inkGeometry.setAttribute('position', new THREE.BufferAttribute(inkPoints, 3));
inkGeometry.setDrawRange(0, 0);
const ink = new THREE.LineSegments(inkGeometry, new THREE.LineBasicMaterial({ color: 0x2c4057 }));
papers.add(ink);
function updateIdleProps() {
  if (idlePose.kind !== 'write') return; // 書いたメモは次に書き始めるまで残る
  idlePose.penPhase = writeChannels(idlePose.elapsed).phase;
  inkGeometry.setDrawRange(0, memoInkCount(idlePose.elapsed) * 2);
}

// 待機動作中の表情（伸びのピークで目を閉じる・視線を移すときにまばたき）
let lastIdle = { kind: null, elapsed: 0 };
const WRITE_BLINKS = [0.14, MEMO.thinkStart + 0.10, MEMO.thinkEnd - 0.12, WRITE.release - 0.32];
function idleFace() {
  const ip = idlePose;
  if (ip.kind === 'write' && lastIdle.kind === 'write' && ip.fade >= 1) {
    for (const te of WRITE_BLINKS) {
      if (lastIdle.elapsed < te && ip.elapsed >= te && state.blinkStart < 0) { state.nextBlinkAt = time; updateBlink(time); }
    }
  }
  if (ip.kind === 'write' && face.eye === 'open') {
    // 手元を見ている間はまぶたが下がって見える（正面からは伏し目）
    const W = writeChannels(ip.elapsed);
    if (W.gaze * (1 - W.think) * ip.fade > 0.75) face.eye = 'half';
  }
  if (ip.kind === 'stretch' && ip.fade > 0.5) {
    const S = stretchChannels(ip.elapsed);
    if (S.eye) face.eye = S.eye;
    if (S.mouth && !state.speaking) face.mouth = S.mouth;
  }
  lastIdle = { kind: ip.kind, elapsed: ip.elapsed };
}
const clip = new THREE.Plane(new THREE.Vector3(0,1,0), -(y-0.07));
model.traverse(o=>{if(o.isMesh) for(const m of Array.isArray(o.material)?o.material:[o.material]) {m.clippingPlanes=[clip];m.clipShadows=true;m.needsUpdate=true;}});
applyFace();

// Observe the existing player after Web Audio has resumed, so failed unlocks never mute it.
let audioCtx=null, analyser=null, mediaSource=null, attachedPlayer=null;
const sampleBuf=new Float32Array(1024);
let speechToken=0;
async function setSpeech(player) {
  const token=++speechToken;
  state.speaking=true; fallbackSpeech=true;
  if (!(player instanceof HTMLMediaElement) || player.paused) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    if (audioCtx.state !== 'running' || token !== speechToken) return;
    if (!mediaSource) {
      analyser=audioCtx.createAnalyser(); analyser.fftSize=1024;
      mediaSource=audioCtx.createMediaElementSource(player); attachedPlayer=player;
      mediaSource.connect(analyser); analyser.connect(audioCtx.destination);
    }
    fallbackSpeech=attachedPlayer !== player;
  } catch { fallbackSpeech=true; }
}
function stopSpeech() { speechToken++; state.speaking=false; fallbackSpeech=false; state.mouthLevel=0; face.mouth='close'; applyFace(); }
function updateMouth(dt) {
  let level=0;
  if (state.speaking) {
    if (!fallbackSpeech && analyser) {
      analyser.getFloatTimeDomainData(sampleBuf);
      let sum=0; for(const v of sampleBuf) sum+=v*v;
      level=THREE.MathUtils.clamp((Math.sqrt(sum/sampleBuf.length)-0.012)*7.5,0,1);
    } else level=0.18+0.5*Math.abs(Math.sin(time*13));
  }
  state.mouthLevel=approach(state.mouthLevel,level,level>state.mouthLevel?22:11,dt);
  const m=state.mouthLevel; face.mouth=m<0.1?'close':m<0.3?'small':m<0.55?'open':'wide';
}
const durations={deskWork:3,standUp:2.8,standIdle:3,bow:2.6,sitDown:2.5};
function play(key) {
  if (!(key in durations)) throw new Error(`不明な動作: ${key}`);
  idleDirector.cancel(time);
  state.bow?.resolve(); state.bow=null; state.bowAngle=0;
  if (key==='standUp' || key==='sitDown') {
    state.mode=key==='sitDown'?'work':'stand';
    transition={fromSit:state.sit,fromTyping:state.typing,toSit:key==='sitDown'?1:0,start:time,duration:durations[key]};
  } else {
    transition=null; state.mode=key==='deskWork'?'work':'stand';
    if (key==='bow') state.bow={start:time,angle:THREE.MathUtils.degToRad(30),down:0.75,hold:0.9,up:0.95,resolve(){}};
  }
}
function update(dt, { allowIdle = false } = {}) {
  time=(clockNow()-startedAt)/1000;
  idlePose=idleDirector.tick(time,allowIdle && state.mode==='work' && !state.speaking,
    !transition && state.sit>0.998 && state.typing>0.95);
  if(transition) {
    const p=THREE.MathUtils.clamp((time-transition.start)/transition.duration,0,1);
    if(transition.toSit===0) {
      state.typing=THREE.MathUtils.lerp(transition.fromTyping,0,ease(Math.min(p/0.25,1)));
      state.sit=THREE.MathUtils.lerp(transition.fromSit,0,ease(THREE.MathUtils.clamp((p-0.18)/0.82,0,1)));
    } else {
      state.sit=THREE.MathUtils.lerp(transition.fromSit,1,ease(Math.min(p/0.85,1)));
      state.typing=THREE.MathUtils.lerp(transition.fromTyping,1,ease(THREE.MathUtils.clamp((p-0.75)/0.25,0,1)));
    }
    if(p>=1) transition=null;
  } else updateTransitions(dt);
  updateBow(time); updatePose(time,dt); updateIdleProps(); updateHair(time,dt);
  avatar.chair.position.z=-0.3*(1-ease(state.sit));
  updateBlink(time); updateMouth(dt); idleFace(); applyFace();
}
return {play,update,setSpeech,stopSpeech,durations,state,face,avatar,debug,model,environment,camera,pen,
  requestIdle:kind=>idleDirector.request(kind),get idle(){return idlePose;}};
}

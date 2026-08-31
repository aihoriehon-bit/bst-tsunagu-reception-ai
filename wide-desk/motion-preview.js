import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "../blender/tsunagu-reception-actions-20260826.glb?v=20260831-pc-gaze-1";
const MODEL_FRONT_Y = -Math.PI / 2 + 0.03;
const SEATED_Y = -0.3;
const SEATED_Z = -0.08;

const MOTIONS = {
  deskWork: {
    clip: "Reception_DeskWork",
    label: "PC作業",
    posture: 0,
    loop: true,
  },
  standUp: {
    clip: "Reception_StandUp",
    label: "立ち上がり",
    posture: 1,
    loop: false,
    postureMotion: true,
  },
  standIdle: {
    clip: "Reception_StandIdle",
    label: "立ち待機",
    posture: 1,
    loop: true,
  },
  bow: {
    clip: "Reception_Bow",
    label: "お辞儀",
    posture: 1,
    loop: false,
  },
  sitDown: {
    clip: "Reception_SitDown",
    label: "座り直し",
    posture: 0,
    loop: false,
    postureMotion: true,
  },
};

const FACE_PART_URLS = {
  eyeLeftOpen: "../assets/face-parts/eye-left-open.png",
  eyeRightOpen: "../assets/face-parts/eye-right-open.png",
  eyeLeftHalf: "../assets/face-parts/eye-left-half.png",
  eyeRightHalf: "../assets/face-parts/eye-right-half.png",
  eyeLeftClosed: "../assets/face-parts/eye-left-closed.png",
  eyeRightClosed: "../assets/face-parts/eye-right-closed.png",
  mouthNeutral: "../assets/face-parts/mouth-neutral.png",
  mouthHalfOpen: "../assets/face-parts/mouth-half-open.png",
  mouthWideOpen: "../assets/face-parts/mouth-wide-open.png",
};

const SPEECH_AUDIO_VERSION = "20260831-voicevox-stationary-1";
const SPEECH_LINES = {
  welcome: {
    text: "いらっしゃいませ。こちらでご用件をお伺いいたします。",
    audio: "../assets/motion-preview/audio/approach.wav",
  },
  morning: {
    text: "有限会社ビジネスシステム通信、受付AIのつなぐです。恐れ入りますが、お名前とご用件をお聞かせいただけますか？",
    audio: "../assets/motion-preview/audio/arrival-ohayo.wav",
  },
  visitor: {
    text: "いつもありがとうございます。今日はどのようなご用件でしょうか？",
    audio: "../assets/motion-preview/audio/known-visitor.wav",
  },
  calling: {
    text: "いつもお疲れさまです。担当者をお呼びしますので、そのまま少々お待ちください。",
    audio: "../assets/motion-preview/audio/clothing-visitor.wav",
  },
  goodbye: {
    text: "ありがとうございました。どうぞお気をつけてお帰りください。",
    audio: "../assets/motion-preview/audio/return-to-work.wav",
  },
};

const sceneElement = document.querySelector("#scene");
const actionLabel = document.querySelector("#actionLabel");
const controlsElement = document.querySelector("#controls");
const loadingElement = document.querySelector("#loading");
const loadingDetail = document.querySelector("#loadingDetail");
const speechButtonsElement = document.querySelector("#speechButtons");
const speechStatusElement = document.querySelector("#speechStatus");

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog(0xdce8e6, 4.8, 8.5);

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 1.35, 4.1);
camera.lookAt(0, 0.82, -0.32);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneElement.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8ba09c, 2.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(2.8, 4.4, 3.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 10;
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -2;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x9ad5dc, 1.1);
fillLight.position.set(-3, 2.2, 2.6);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4.8, 80),
  new THREE.MeshStandardMaterial({
    color: 0xe6eeec,
    roughness: 0.94,
    metalness: 0,
    transparent: true,
    opacity: 0.46,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

const floorRing = new THREE.Mesh(
  new THREE.RingGeometry(1.35, 1.37, 80),
  new THREE.MeshBasicMaterial({ color: 0xb8d0cc, transparent: true, opacity: 0.52, side: THREE.DoubleSide }),
);
floorRing.rotation.x = -Math.PI / 2;
floorRing.position.set(0, -0.001, -0.32);
scene.add(floorRing);

const setGroup = createSimpleDeskSet();
scene.add(setGroup);

const characterRoot = new THREE.Group();
characterRoot.position.set(0, SEATED_Y, -0.45 + SEATED_Z);
scene.add(characterRoot);

let mixer = null;
let clipMap = new Map();
let currentAction = null;
let currentMotionKey = "";
let posture = 0;
let postureTween = null;
let sequenceId = 0;
let faceState = null;
let nextBlinkAt = performance.now() + 2100;
let blinkStartedAt = 0;
let currentSpeechAudio = null;
let speechRequestId = 0;
let speakingMouthTimer = null;

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;
    normalizeModel(model);
    improveMaterials(model);
    characterRoot.add(model);

    mixer = new THREE.AnimationMixer(model);
    clipMap = new Map(gltf.animations.map((clip) => [clip.name, clip]));

    const missing = Object.values(MOTIONS)
      .filter((motion) => !clipMap.has(motion.clip))
      .map((motion) => motion.clip);
    if (missing.length > 0) throw new Error(`アニメーションが見つかりません: ${missing.join(", ")}`);

    const head = model.getObjectByName("Head");
    if (head) createFaceLayer(head);

    loadingElement.classList.add("is-hidden");
    window.motionPreviewReady = true;
    window.motionPreviewClips = Object.fromEntries(
      Object.entries(MOTIONS).map(([key, motion]) => [key, {
        name: motion.clip,
        duration: Number(clipMap.get(motion.clip).duration.toFixed(3)),
      }]),
    );

    runSequence();
  },
  (event) => {
    if (!event.total) {
      loadingDetail.textContent = "読み込み中…";
      return;
    }
    loadingDetail.textContent = `${Math.min(99, Math.round((event.loaded / event.total) * 100))}%`;
  },
  (error) => {
    console.error(error);
    actionLabel.textContent = "読み込みできませんでした";
    loadingElement.querySelector("strong").textContent = "キャラクターを読み込めませんでした";
    loadingDetail.textContent = "ページを再読み込みしてください";
  },
);

controlsElement.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !mixer) return;
  cancelSpeechSequence(true);

  if (button.hasAttribute("data-sequence")) {
    runSequence();
    return;
  }

  const motionKey = button.dataset.action;
  if (!MOTIONS[motionKey]) return;
  sequenceId += 1;
  playManualMotion(motionKey);
});

speechButtonsElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-speech]");
  if (!button) return;
  speakLine(button.dataset.speech, button);
});

async function speakLine(speechKey, button) {
  const line = SPEECH_LINES[speechKey];
  if (!line) return;
  if (!mixer) {
    speechStatusElement.textContent = "キャラクターの読み込み完了後にお試しください";
    return;
  }

  cancelSpeechSequence(false);
  const ownRequest = speechRequestId;
  sequenceId += 1;
  button.classList.add("is-speaking");
  speechStatusElement.textContent = posture < 0.98 ? "立ち上がっています…" : line.text;

  if (posture < 0.98) {
    playMotion("standUp");
    setActiveButton("standUp");
    if (!(await waitForSpeech(getMotionDurationMs("standUp") + 90, ownRequest))) return;
  }

  if (ownRequest !== speechRequestId) return;
  playMotion("standIdle");
  setActiveButton("standIdle");
  speechStatusElement.textContent = line.text;

  const audio = new Audio(`${line.audio}?v=${SPEECH_AUDIO_VERSION}`);
  audio.preload = "auto";
  audio.volume = 1;
  currentSpeechAudio = audio;

  const finish = () => {
    button.classList.remove("is-speaking");
    if (currentSpeechAudio === audio) {
      currentSpeechAudio = null;
      stopLipSync();
      playMotion("standIdle");
      setActiveButton("standIdle");
    }
  };
  audio.addEventListener("playing", startLipSync, { once: true });
  audio.addEventListener("ended", finish, { once: true });
  audio.addEventListener("error", () => {
    finish();
    speechStatusElement.textContent = "音声を再生できませんでした";
  }, { once: true });

  audio.play().catch(() => {
    finish();
    speechStatusElement.textContent = "音声を再生できませんでした。もう一度ボタンを押してください。";
  });
}

function cancelSpeechSequence(resetStatus) {
  speechRequestId += 1;
  if (currentSpeechAudio) {
    currentSpeechAudio.pause();
    currentSpeechAudio.currentTime = 0;
    currentSpeechAudio = null;
  }
  stopLipSync();
  speechButtonsElement.querySelectorAll("button").forEach((button) => button.classList.remove("is-speaking"));
  if (resetStatus) speechStatusElement.textContent = "再生したいセリフを選んでください";
}

function waitForSpeech(milliseconds, ownRequest) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(ownRequest === speechRequestId), milliseconds);
  });
}

async function runSequence() {
  if (!mixer) return;
  const ownSequence = ++sequenceId;
  setActiveButton("sequence");

  playMotion("deskWork");
  if (!(await waitFor(2700, ownSequence))) return;
  if (!(await playOneShotAndWait("standUp", ownSequence))) return;

  playMotion("standIdle");
  if (!(await waitFor(850, ownSequence))) return;
  if (!(await playOneShotAndWait("bow", ownSequence))) return;

  playMotion("standIdle");
  if (!(await waitFor(700, ownSequence))) return;
  if (!(await playOneShotAndWait("sitDown", ownSequence))) return;

  playMotion("deskWork");
  setActiveButton("deskWork");
}

function playManualMotion(motionKey) {
  const motion = MOTIONS[motionKey];
  playMotion(motionKey);
  setActiveButton(motionKey);

  if (motion.loop) return;
  const duration = getMotionDurationMs(motionKey);
  const ownSequence = sequenceId;
  window.setTimeout(() => {
    if (ownSequence !== sequenceId || currentMotionKey !== motionKey) return;
    const nextMotion = motionKey === "sitDown" ? "deskWork" : "standIdle";
    playMotion(nextMotion);
    setActiveButton(nextMotion);
  }, duration + 80);
}

async function playOneShotAndWait(motionKey, ownSequence) {
  playMotion(motionKey);
  return waitFor(getMotionDurationMs(motionKey) + 70, ownSequence);
}

function playMotion(motionKey) {
  const motion = MOTIONS[motionKey];
  const clip = clipMap.get(motion.clip);
  if (!mixer || !clip) return;

  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.reset();
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(1);
  if (motion.loop) {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  } else {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }

  if (currentAction && currentAction !== action) currentAction.fadeOut(0.2);
  action.fadeIn(0.2).play();
  currentAction = action;
  currentMotionKey = motionKey;

  const postureDuration = motion.postureMotion ? clip.duration * 1000 : 0;
  setPosture(motion.posture, postureDuration);
  actionLabel.textContent = motion.label;
}

function setPosture(target, duration = 0) {
  const nextPosture = THREE.MathUtils.clamp(target, 0, 1);
  if (duration <= 0) {
    posture = nextPosture;
    postureTween = null;
    updateCharacterPosition();
    return;
  }

  postureTween = {
    from: posture,
    to: nextPosture,
    startedAt: performance.now(),
    duration: Math.max(250, duration),
  };
}

function updatePosture(now) {
  if (!postureTween) return;
  const raw = THREE.MathUtils.clamp((now - postureTween.startedAt) / postureTween.duration, 0, 1);
  const eased = raw * raw * (3 - 2 * raw);
  posture = THREE.MathUtils.lerp(postureTween.from, postureTween.to, eased);
  updateCharacterPosition();
  if (raw >= 1) postureTween = null;
}

function updateCharacterPosition() {
  characterRoot.position.y = THREE.MathUtils.lerp(SEATED_Y, 0, posture);
  characterRoot.position.z = -0.45 + THREE.MathUtils.lerp(SEATED_Z, 0, posture);
}

function setActiveButton(key) {
  controlsElement.querySelectorAll("button").forEach((button) => {
    const isSequence = key === "sequence" && button.hasAttribute("data-sequence");
    const isMotion = key !== "sequence" && button.dataset.action === key;
    button.classList.toggle("is-active", isSequence || isMotion);
  });
}

function waitFor(milliseconds, ownSequence) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(ownSequence === sequenceId), milliseconds);
  });
}

function getMotionDurationMs(motionKey) {
  return (clipMap.get(MOTIONS[motionKey].clip)?.duration || 1) * 1000;
}

function normalizeModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.62 / Math.max(size.y, 0.01);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.rotation.y = MODEL_FRONT_Y;
}

function improveMaterials(model) {
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material) return;
      material.side = THREE.FrontSide;
      if ("roughness" in material) material.roughness = Math.min(material.roughness ?? 0.8, 0.86);
      if ("metalness" in material) material.metalness = Math.min(material.metalness ?? 0, 0.2);
      material.needsUpdate = true;
    });
  });
}

function createSimpleDeskSet() {
  const group = new THREE.Group();
  const lightWood = new THREE.MeshStandardMaterial({ color: 0xc5d3cf, roughness: 0.72, metalness: 0.03 });
  const paleTeal = new THREE.MeshStandardMaterial({ color: 0x6f9798, roughness: 0.68, metalness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x334e52, roughness: 0.58, metalness: 0.14 });

  const top = roundedBox(1.72, 0.065, 0.62, 0.035, lightWood);
  top.position.set(0, 0.67, 0.02);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // 受付担当者の脚と足元が見えない、横幅のあるカウンター前板。
  const frontPanel = roundedBox(1.64, 0.64, 0.06, 0.025, lightWood);
  frontPanel.position.set(0, 0.32, 0.31);
  frontPanel.castShadow = true;
  frontPanel.receiveShadow = true;
  group.add(frontPanel);

  const counterAccent = roundedBox(1.52, 0.045, 0.018, 0.012, paleTeal);
  counterAccent.position.set(0, 0.56, 0.346);
  group.add(counterAccent);

  [-0.72, 0.72].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.75, 0.055), paleTeal);
    leg.position.set(x, 0.28, 0.02);
    leg.castShadow = true;
    group.add(leg);
  });

  const keyboard = roundedBox(0.56, 0.025, 0.2, 0.018, dark);
  keyboard.position.set(-0.04, 0.724, -0.12);
  keyboard.rotation.x = -0.035;
  group.add(keyboard);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), dark);
  mouse.scale.set(0.72, 0.35, 1.05);
  mouse.position.set(0.39, 0.74, -0.1);
  group.add(mouse);

  // 動きを隠さないよう、モニターは小さく左寄せにする。
  const monitorStand = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.03, 0.16, 16), paleTeal);
  monitorStand.position.set(-0.3, 0.81, 0.23);
  group.add(monitorStand);

  const monitor = roundedBox(0.48, 0.28, 0.045, 0.03, dark);
  monitor.position.set(-0.3, 0.98, 0.23);
  monitor.rotation.x = -0.04;
  group.add(monitor);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.41, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xbde8e3, transparent: true, opacity: 0.88 }),
  );
  screen.position.set(-0.3, 0.98, 0.205);
  screen.rotation.y = Math.PI;
  group.add(screen);

  const chairBack = roundedBox(0.55, 0.58, 0.095, 0.06, paleTeal);
  chairBack.position.set(0, 0.57, -0.86);
  chairBack.castShadow = true;
  group.add(chairBack);

  const chairSeat = roundedBox(0.56, 0.08, 0.52, 0.04, paleTeal);
  chairSeat.position.set(0, 0.14, -0.63);
  chairSeat.castShadow = true;
  group.add(chairSeat);

  const chairPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.048, 0.16, 16), dark);
  chairPost.position.set(0, 0.035, -0.63);
  group.add(chairPost);

  return group;
}

function roundedBox(width, height, depth, radius, material) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: Math.min(radius * 0.45, 0.012),
    bevelThickness: Math.min(radius * 0.45, 0.012),
  });
  geometry.center();
  return new THREE.Mesh(geometry, material);
}

function createFaceLayer(head) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const layer = new THREE.Mesh(
    new THREE.PlaneGeometry(0.118, 0.122),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
  // 目と口が額側へ上がって見えないよう、顔全体を少し下へ戻す。
  layer.position.set(0.0041, 0.0655, -0.04);
  layer.rotation.y = Math.PI;
  layer.renderOrder = 50;
  head.add(layer);

  faceState = { context, texture, assets: {}, blink: "open", mouth: "neutral" };
  Promise.all(
    Object.entries(FACE_PART_URLS).map(([key, url]) => loadImage(url).then((image) => [key, image])),
  ).then((entries) => {
    faceState.assets = Object.fromEntries(entries);
    drawFace("open", "neutral");
  }).catch((error) => console.warn("顔パーツの読み込みに失敗しました", error));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function drawFace(blink, mouth = faceState?.mouth || "neutral") {
  if (!faceState || Object.keys(faceState.assets).length === 0) return;
  faceState.blink = blink;
  faceState.mouth = mouth;
  const { context: ctx, texture, assets } = faceState;
  ctx.clearRect(0, 0, 512, 512);

  const isHalf = blink === "half";
  const isClosed = blink === "closed";
  const eyeY = isClosed ? 204 : isHalf ? 181 : 166;
  const eyeHeight = isClosed ? 55 : isHalf ? 86 : 120;
  const eyeWidth = 147;
  const leftEye = isClosed ? assets.eyeLeftClosed : isHalf ? assets.eyeLeftHalf : assets.eyeLeftOpen;
  const rightEye = isClosed ? assets.eyeRightClosed : isHalf ? assets.eyeRightHalf : assets.eyeRightOpen;
  drawImageContain(ctx, leftEye, 45, eyeY, eyeWidth, eyeHeight);
  drawImageContain(ctx, rightEye, 299, eyeY, eyeWidth, eyeHeight);
  const mouthImage = mouth === "wide"
    ? assets.mouthWideOpen
    : mouth === "half"
      ? assets.mouthHalfOpen
      : assets.mouthNeutral;
  const mouthY = mouth === "neutral" ? 370 : mouth === "wide" ? 354 : 360;
  const mouthHeight = mouth === "neutral" ? 54 : mouth === "wide" ? 76 : 66;
  drawImageContain(ctx, mouthImage, 180, mouthY, 115, mouthHeight);
  texture.needsUpdate = true;
}

function startLipSync() {
  stopLipSync();
  const mouthFrames = ["half", "wide", "half", "neutral"];
  let frameIndex = 0;
  speakingMouthTimer = window.setInterval(() => {
    if (!faceState) return;
    drawFace(faceState.blink, mouthFrames[frameIndex % mouthFrames.length]);
    frameIndex += 1;
  }, 115);
}

function stopLipSync() {
  if (speakingMouthTimer) window.clearInterval(speakingMouthTimer);
  speakingMouthTimer = null;
  if (faceState) drawFace(faceState.blink, "neutral");
}

function drawImageContain(ctx, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function updateBlink(now) {
  if (!faceState || Object.keys(faceState.assets).length === 0) return;
  if (blinkStartedAt === 0 && now >= nextBlinkAt) blinkStartedAt = now;
  if (blinkStartedAt === 0) return;

  const elapsed = now - blinkStartedAt;
  const nextFrame = elapsed < 70 ? "half" : elapsed < 150 ? "closed" : elapsed < 220 ? "half" : "open";
  if (nextFrame !== faceState.blink) drawFace(nextFrame, faceState.mouth);
  if (elapsed >= 230) {
    blinkStartedAt = 0;
    nextBlinkAt = now + 2300 + Math.random() * 2300;
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (mixer) mixer.update(delta);
  updatePosture(now);
  updateBlink(now);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.playMotion = (motionKey) => {
  if (!MOTIONS[motionKey] || !mixer) return false;
  cancelSpeechSequence(true);
  sequenceId += 1;
  playManualMotion(motionKey);
  return true;
};
window.playMotionSequence = () => {
  cancelSpeechSequence(true);
  runSequence();
  return true;
};

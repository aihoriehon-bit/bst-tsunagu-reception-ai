import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MODEL_URL = "./bst-latest-0701.glb?v=20260702-1";
const MODEL_FRONT_Y = -Math.PI / 2 + 0.03;
const ANIM_ROLES = {
  standA: 6,
  bow: 7,
};
const BOW_COOLDOWN_MS = 3200;
const EDIT_PASSWORD_HASH = "eabd3fbe61db140b89746481767bf5fd0e6c2e32a6529bfb55a8519f024324cf";
const FACE_PART_URLS = {
  eyeLeftOpen: "./assets/face-parts/eye-left-open.png",
  eyeRightOpen: "./assets/face-parts/eye-right-open.png",
  eyeLeftHalf: "./assets/face-parts/eye-left-half.png",
  eyeRightHalf: "./assets/face-parts/eye-right-half.png",
  eyeLeftClosed: "./assets/face-parts/eye-left-closed.png",
  eyeRightClosed: "./assets/face-parts/eye-right-closed.png",
  mouthNeutral: "./assets/face-parts/mouth-neutral.png",
  mouthHalf: "./assets/face-parts/mouth-half-open.png?v=20260701-5",
  mouthWide: "./assets/face-parts/mouth-wide-open.png",
  nosePart: "./assets/face-parts/nose-chon.png",
};
const EXPRESSION_STORAGE_KEY = "tsunagu-expression-settings-v6";
const SETTINGS_URL_PARAM = "settings";
const DEFAULT_EXPRESSION = {
  layerX: 2,
  layerY: -24,
  viewZoom: 104,
  modelBrightness: 128,
  modelSaturation: 148,
  backgroundBlur: 3.5,
  clockScale: 110,
  messageScale: 90,
  patchVisible: 0,
  patchWidth: 100,
  patchHeight: 100,
  eyeX: -7,
  eyeY: 77,
  eyeGap: 109,
  eyeScale: 171,
  noseVisible: 0,
  noseX: 0,
  noseY: 80,
  noseScale: 100,
  mouthX: -5,
  mouthY: 90,
  mouthScale: 180,
  badgeVisible: 1,
  badgeX: -8,
  badgeY: -235,
  badgeScale: 92,
};
const FACE_LAYER_BASE = {
  x: 0.003,
  y: 0.088,
  z: -0.04,
};

const stagePanel = document.querySelector(".stage-panel");
const sceneHost = document.querySelector("#scene");
const modelStatus = document.querySelector("#modelStatus");
const voiceStatus = document.querySelector("#voiceStatus");
const morphStatus = document.querySelector("#morphStatus");
const boneStatus = document.querySelector("#boneStatus");
const animationStatus = document.querySelector("#animationStatus");
const speechBubble = document.querySelector(".speech-bubble");
const speechText = document.querySelector("#speechText");
const assistantMood = document.querySelector("#assistantMood");
const conversation = document.querySelector("#conversation");
const form = document.querySelector("#messageForm");
const input = document.querySelector("#messageInput");
const quickActions = document.querySelector("#quickActions");
const greetingActions = document.querySelector("#greetingActions");
const soundToggle = document.querySelector("#soundToggle");
const micButton = document.querySelector("#micButton");
const listenState = document.querySelector("#listenState");
const clockText = document.querySelector("#clockText");
const expressionControls = document.querySelector("#expressionControls");
const expressionReset = document.querySelector("#expressionReset");
const shareSettings = document.querySelector("#shareSettings");
const editorUnlockForm = document.querySelector("#editorUnlockForm");
const editorPassword = document.querySelector("#editorPassword");
const editorLockState = document.querySelector("#editorLockState");
const nameTagOverlay = document.querySelector("#nameTagOverlay");
const backgroundVideo = document.querySelector("#backgroundVideo");

const state = {
  renderer: null,
  camera: null,
  model: null,
  modelSaturationUniforms: [],
  head: null,
  neck: null,
  spine: null,
  leftUpperArm: null,
  rightUpperArm: null,
  rightForearm: null,
  rightHand: null,
  baseRotations: new Map(),
  faceCanvas: null,
  faceContext: null,
  faceTexture: null,
  faceLayer: null,
  faceAnchor: null,
  faceLayerBase: FACE_LAYER_BASE,
  faceLayerOffsetStep: 0.00055,
  faceAssets: {},
  faceAssetsReady: false,
  faceFrame: "",
  expression: loadExpressionSettings(),
  expressionRevision: 0,
  blinkStartedAt: 0,
  blinkDuration: 280,
  blinkUntil: 0,
  speakingUntil: 0,
  speechActive: false,
  speechToken: 0,
  speechKeepAliveTimer: null,
  lastStageTapAt: 0,
  editorUnlocked: false,
  editorStatusTimer: null,
  soundEnabled: true,
  lastInteractionAt: Date.now(),
  recognition: null,
  modelLoaded: false,
  mixer: null,
  clips: [],
  hasAnimations: false,
  currentAction: null,
  currentRole: "",
  bowTimer: null,
  lastBowAt: 0,
};

const intents = {
  visitor: {
    label: "来客受付",
    say: "有限会社ビジネスシステム通信へようこそ。お名前、会社名、訪問先の担当者名を順番にお伺いします。",
  },
  camera: {
    label: "防犯カメラ",
    say: "防犯カメラや各種監視機器のご相談ですね。設置場所、台数、ご希望の用途を伺って担当者へおつなぎします。",
  },
  radio: {
    label: "業務用無線",
    say: "業務用無線機、インカム、トランシーバーのご相談ですね。利用場所、必要台数、レンタルか購入かを教えてください。",
  },
  electrical: {
    label: "LED・電気工事",
    say: "LED照明、弱電工事、電気工事のご相談ですね。建物の種類、工事場所、希望時期を確認します。",
  },
  av: {
    label: "映像音響",
    say: "映像音響設備のご用件ですね。常設、仮設、イベント利用など、用途に合わせて担当者へおつなぎします。",
  },
  emergency: {
    label: "緊急連絡",
    say: "緊急のご連絡ですね。安全確認を優先します。すぐにスタッフへ通知するため、発生場所と内容を短く教えてください。",
  },
};

const greetings = {
  welcomeBack: {
    label: "お帰りなさい",
    say: "お帰りなさい。今日もお疲れさまでした。受付まわりは通常運転です。連絡事項があれば、私が一緒に確認します。",
  },
  goodMorning: {
    label: "朝の挨拶",
    say: "おはようございます。本日もビジネスシステム通信をよろしくお願いします。来客予定と社内連絡を確認して、気持ちよく一日を始めましょう。",
  },
  goOut: {
    label: "いってらっしゃい",
    say: "いってらっしゃいませ。お気をつけて。戻られたら、受付でお帰りなさいとお迎えします。",
  },
  closing: {
    label: "退勤時",
    say: "本日もお疲れさまでした。照明、施錠、機器の確認を忘れずに。明日も受付でお待ちしています。",
  },
  weather: {
    label: "雨の日",
    say: "本日は足元が悪くなっています。ご来社の方には傘立てをご案内します。外出される方はお気をつけください。",
  },
  thanks: {
    label: "感謝",
    say: "ありがとうございます。そう言っていただけると嬉しいです。これからも受付でしっかりサポートします。",
  },
};

const fallbackReplies = [
  {
    keys: ["福田", "ふくだ", "絵美太", "えみた"],
    say: "福田さんへのご用件ですね。会社名とお名前を確認して、担当へお知らせします。",
  },
  {
    keys: ["面接", "採用", "履歴書"],
    say: "面接でのご来社ですね。お名前と予約時間を確認します。担当者へ到着をお伝えします。",
  },
  {
    keys: ["カメラ", "防犯", "セキュリティ"],
    say: "防犯カメラまたはセキュリティのご相談ですね。犯罪抑止、監視、トラブル防止など、目的に合わせて担当者へつなぎます。",
  },
  {
    keys: ["無線", "インカム", "トランシーバー"],
    say: "無線機やインカムのご用件ですね。台数、利用場所、納期の希望を教えてください。",
  },
  {
    keys: ["LED", "照明", "電気", "弱電"],
    say: "LED照明や電気工事のご相談ですね。工事場所、設備の状況、希望時期を確認して担当者へおつなぎします。",
  },
  {
    keys: ["ありがとう", "助かり"],
    say: "こちらこそありがとうございます。必要なことがあれば、いつでもお声がけください。",
  },
];

const idleTalk = [
  "受付でお困りのことがあれば、画面のボタンからご用件を選んでください。",
  "防犯カメラ、業務用無線機、LED工事、映像音響のご相談を受け付けています。",
  "お帰りの際もお気軽にお声がけください。お疲れさまでした、とお迎えします。",
  "BSTの受付AIとして、安心でスムーズなご案内をお手伝いします。",
];

const tapTalk = [
  "はい、つなぐです。ご用件があれば、いつでもお声がけください。",
  "お疲れさまです。今日も受付でしっかりサポートします。",
  "ご来社ありがとうございます。来客受付、防犯カメラ、業務用無線などのご相談を承ります。",
  "お帰りなさい。今日もお疲れさまでした。",
  "こんにちは。有限会社ビジネスシステム通信へようこそ。",
  "少しでも迷ったら、画面のご用件ボタンから選んでくださいね。",
  "防犯カメラ、LED工事、映像音響のご相談も受け付けています。",
  "担当者へのおつなぎが必要でしたら、お名前とご用件を教えてください。",
];

initScene();
initConversation();
initEvents();
initBackgroundVideo();
loadFaceAssets();
updateClock();
setInterval(updateClock, 1000);
setInterval(sayIdleLine, 65000);

function initBackgroundVideo() {
  if (!backgroundVideo) return;
  backgroundVideo.muted = true;
  backgroundVideo.loop = true;
  backgroundVideo.playsInline = true;
  applyBackgroundSettings();
  backgroundVideo.play().catch((error) => {
    console.warn("Background video autoplay was blocked", error);
  });
}

function loadFaceAssets() {
  const entries = Object.entries(FACE_PART_URLS);
  Promise.all(
    entries.map(([key, url]) =>
      loadImage(url).then((image) => {
        state.faceAssets[key] = image;
      }),
    ),
  )
    .then(() => {
      state.faceAssetsReady = true;
      state.faceFrame = "";
      drawFaceTexture(false, "open", 0);
    })
    .catch((error) => {
      console.warn("Face part assets failed to load", error);
    });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function loadExpressionSettings() {
  try {
    const sharedSettings = loadExpressionSettingsFromUrl();
    if (sharedSettings) return sharedSettings;

    const stored = window.localStorage.getItem(EXPRESSION_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_EXPRESSION };
    return normalizeExpressionSettings(JSON.parse(stored));
  } catch (error) {
    console.warn("Expression settings could not be loaded", error);
    return { ...DEFAULT_EXPRESSION };
  }
}

function loadExpressionSettingsFromUrl() {
  const encoded = new URLSearchParams(window.location.search).get(SETTINGS_URL_PARAM);
  if (!encoded) return null;
  return normalizeExpressionSettings(decodeExpressionSettings(encoded));
}

function normalizeExpressionSettings(values = {}) {
  const settings = { ...DEFAULT_EXPRESSION, ...values };
  settings.modelBrightness = clampNumber(settings.modelBrightness, 80, 130, DEFAULT_EXPRESSION.modelBrightness);
  settings.modelSaturation = clampNumber(settings.modelSaturation, 80, 200, DEFAULT_EXPRESSION.modelSaturation);
  settings.backgroundBlur = clampNumber(settings.backgroundBlur, 0, 8, DEFAULT_EXPRESSION.backgroundBlur);
  settings.clockScale = clampNumber(settings.clockScale, 70, 180, DEFAULT_EXPRESSION.clockScale);
  settings.messageScale = clampNumber(settings.messageScale, 70, 180, DEFAULT_EXPRESSION.messageScale);
  settings.viewZoom = clampNumber(settings.viewZoom, 80, 220, DEFAULT_EXPRESSION.viewZoom);
  return settings;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function saveExpressionSettings() {
  try {
    window.localStorage.setItem(EXPRESSION_STORAGE_KEY, JSON.stringify(state.expression));
  } catch (error) {
    console.warn("Expression settings could not be saved", error);
  }
}

function encodeExpressionSettings(settings) {
  const compactSettings = {};
  Object.keys(DEFAULT_EXPRESSION).forEach((key) => {
    compactSettings[key] = settings[key];
  });
  return btoa(JSON.stringify(compactSettings)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeExpressionSettings(encoded) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

function updateSharedSettingsUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(SETTINGS_URL_PARAM, encodeExpressionSettings(state.expression));
  window.history.replaceState(null, "", url);
  return url.toString();
}

function initExpressionControls() {
  if (!expressionControls) return;
  const inputs = [...expressionControls.querySelectorAll("input[data-expression]")];

  inputs.forEach((inputControl) => {
    const key = inputControl.dataset.expression;
    setExpressionControlValue(inputControl, state.expression[key] ?? DEFAULT_EXPRESSION[key]);
    updateExpressionOutput(key);
    inputControl.addEventListener("input", () => {
      state.expression[key] = getExpressionControlValue(inputControl);
      state.expressionRevision += 1;
      updateExpressionOutput(key);
      applyExpressionSettings();
      drawFaceTexture(isSpeaking(), getBlinkFrame(), 0);
      saveExpressionSettings();
      updateSharedSettingsUrl();
    });
  });

  expressionReset?.addEventListener("click", () => {
    state.expression = { ...DEFAULT_EXPRESSION };
    state.expressionRevision += 1;
    inputs.forEach((inputControl) => {
      const key = inputControl.dataset.expression;
      setExpressionControlValue(inputControl, state.expression[key]);
      updateExpressionOutput(key);
    });
    applyExpressionSettings();
    drawFaceTexture(isSpeaking(), getBlinkFrame(), 0);
    saveExpressionSettings();
    updateSharedSettingsUrl();
  });

  shareSettings?.addEventListener("click", copySharedSettingsUrl);
  applyExpressionSettings();
  initEditorLock(inputs);
}

function initEditorLock(inputs) {
  setEditorUnlocked(false, inputs);

  editorUnlockForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editorPassword) return;

    if (await isEditorPasswordValid(editorPassword.value)) {
      editorPassword.value = "";
      editorUnlockForm.classList.remove("is-error");
      setEditorUnlocked(true, inputs);
      return;
    }

    editorPassword.value = "";
    editorUnlockForm.classList.add("is-error");
    if (editorLockState) editorLockState.textContent = "不一致";
    window.setTimeout(() => {
      editorUnlockForm.classList.remove("is-error");
      if (!state.editorUnlocked && editorLockState) editorLockState.textContent = "ロック中";
    }, 1400);
  });
}

function setEditorUnlocked(unlocked, inputs) {
  state.editorUnlocked = unlocked;
  inputs.forEach((inputControl) => {
    inputControl.disabled = !unlocked;
  });
  if (expressionReset) expressionReset.disabled = !unlocked;
  if (shareSettings) shareSettings.disabled = !unlocked;
  expressionControls.classList.toggle("is-locked", !unlocked);
  editorUnlockForm?.classList.toggle("is-unlocked", unlocked);
  if (editorLockState) editorLockState.textContent = unlocked ? "編集中" : "ロック中";
}

async function copySharedSettingsUrl() {
  const url = updateSharedSettingsUrl();
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(url);
    flashEditorStatus("URLコピー済み");
  } catch (error) {
    window.prompt("共有URL", url);
    flashEditorStatus("URL表示中");
  }
}

function flashEditorStatus(text) {
  if (!editorLockState) return;
  editorLockState.textContent = text;
  if (state.editorStatusTimer) window.clearTimeout(state.editorStatusTimer);
  state.editorStatusTimer = window.setTimeout(() => {
    editorLockState.textContent = state.editorUnlocked ? "編集中" : "ロック中";
  }, 1400);
}

async function isEditorPasswordValid(value) {
  if (!window.crypto?.subtle) return false;
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hash === EDIT_PASSWORD_HASH;
}

function getExpressionControlValue(inputControl) {
  if (inputControl.type === "checkbox") return inputControl.checked ? 1 : 0;
  return Number(inputControl.value);
}

function setExpressionControlValue(inputControl, value) {
  if (inputControl.type === "checkbox") {
    inputControl.checked = value !== 0 && value !== false;
    return;
  }
  inputControl.value = value;
}

function updateExpressionOutput(key) {
  const output = document.querySelector(`[data-expression-output="${key}"]`);
  if (!output) return;
  if (key === "patchVisible" || key === "noseVisible" || key === "badgeVisible") {
    const text = state.expression[key] ? "表示" : "非表示";
    output.value = text;
    output.textContent = text;
    return;
  }
  if (key === "backgroundBlur") {
    const value = Number(state.expression[key] ?? 0);
    const text = `${Number.isInteger(value) ? value : value.toFixed(1)}px`;
    output.value = text;
    output.textContent = text;
    return;
  }
  if (key === "clockScale" || key === "messageScale") {
    const text = `${state.expression[key]}%`;
    output.value = text;
    output.textContent = text;
    return;
  }
  output.value = state.expression[key];
  output.textContent = String(state.expression[key]);
}

function applyExpressionSettings() {
  if (state.faceLayer) {
    state.faceLayer.position.set(
      state.faceLayerBase.x + state.expression.layerX * state.faceLayerOffsetStep,
      state.faceLayerBase.y + state.expression.layerY * state.faceLayerOffsetStep,
      state.faceLayerBase.z,
    );
  }
  applyBadgeSettings();
  applyViewSettings();
  applyBackgroundSettings();
  applyHudSettings();
}

function applyViewSettings() {
  if (state.camera) {
    state.camera.zoom = state.expression.viewZoom / 100;
    state.camera.updateProjectionMatrix();
  }
  if (state.renderer) {
    state.renderer.toneMappingExposure = state.expression.modelBrightness / 100;
    state.renderer.domElement.style.filter = "";
  }
  state.modelSaturationUniforms.forEach((uniform) => {
    uniform.value = state.expression.modelSaturation / 100;
  });
}

function applyBackgroundSettings() {
  if (!backgroundVideo) return;
  const blur = clampNumber(state.expression.backgroundBlur, 0, 8, DEFAULT_EXPRESSION.backgroundBlur);
  backgroundVideo.style.filter = `blur(${blur}px)`;
  backgroundVideo.style.transform = `scale(${(1 + blur * 0.007).toFixed(3)})`;
}

function applyBadgeSettings() {
  if (!nameTagOverlay) return;
  const expression = state.expression;
  const placementScale = getStageScale() * (expression.viewZoom / 100);
  const scale = (expression.badgeScale / 100) * placementScale;
  nameTagOverlay.classList.toggle("is-hidden", !expression.badgeVisible);
  nameTagOverlay.style.left = `calc(50% + ${expression.badgeX * placementScale}px)`;
  nameTagOverlay.style.top = `calc(46% + ${expression.badgeY * placementScale}px)`;
  nameTagOverlay.style.width = `${116 * scale}px`;
  nameTagOverlay.style.height = `${42 * scale}px`;
  nameTagOverlay.style.fontSize = `${12 * scale}px`;
}

function applyHudSettings() {
  const stageScale = getStageScale();
  const clockScale = stageScale * (state.expression.clockScale / 100);
  if (clockText) {
    clockText.style.minWidth = `${68 * clockScale}px`;
    clockText.style.minHeight = `${34 * clockScale}px`;
    clockText.style.padding = `${7 * clockScale}px ${12 * clockScale}px`;
    clockText.style.fontSize = `${16 * clockScale}px`;
  }

  const messageScale = stageScale * (state.expression.messageScale / 100);
  if (speechBubble) {
    speechBubble.style.minHeight = `${86 * messageScale}px`;
    speechBubble.style.padding = `${12 * messageScale}px ${14 * messageScale}px`;
    speechBubble.style.gap = `${12 * messageScale}px`;
  }
  if (speechText) {
    speechText.style.fontSize = `${15 * messageScale}px`;
  }
  if (assistantMood) {
    assistantMood.style.width = `${13 * messageScale}px`;
    assistantMood.style.height = `${13 * messageScale}px`;
    assistantMood.style.marginTop = `${8 * messageScale}px`;
  }
}

function getStageScale() {
  const height = sceneHost?.clientHeight || 600;
  return clampNumber(height / 600, 0.72, 2.4, 1);
}

function initScene() {
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(0, 1.22, 3.55);
  state.camera = camera;
  applyViewSettings();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer = renderer;
  renderer.toneMappingExposure = state.expression.modelBrightness / 100;
  renderer.domElement.style.filter = "";
  sceneHost.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 5.2;
  controls.target.set(0, 1.12, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fc5d0, 2.55));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.55);
  keyLight.position.set(2.7, 4.6, 4.2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
  fillLight.position.set(0, 2.1, 3.8);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x65d6d4, 1.05);
  rimLight.position.set(-3, 2.5, -2.4);
  scene.add(rimLight);

  const floor = createFloor();
  scene.add(floor);

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      state.model = model;
      state.modelLoaded = true;

      normalizeModel(model);
      discoverRig(model, gltf);
      initAnimations(model, gltf.animations);
      improveMaterials(model);
      createFaceLayer();
      applyBadgeSettings();
      scene.add(model);

      modelStatus.textContent = "3Dモデル表示中";
      const hasMorph = countMorphTargets(model);
      morphStatus.textContent = hasMorph ? `${hasMorph}個` : "なし / 顔パーツ式";
      animationStatus.textContent = gltf.animations.length ? `${gltf.animations.length}個` : "なし";
      const boneCount = countBones(model);
      boneStatus.textContent = boneCount ? `${boneCount}本` : "0本 / 固定アンカー";

      speak("有限会社ビジネスシステム通信へようこそ。受付AIのつなぐです。ご用件を選んでください。");
    },
    (event) => {
      if (!event.total) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      modelStatus.textContent = `3Dモデル読み込み中 ${progress}%`;
    },
    (error) => {
      modelStatus.textContent = "3Dモデル読み込み失敗";
      morphStatus.textContent = "-";
      boneStatus.textContent = "-";
      animationStatus.textContent = "-";
      addMessage("assistant", "GLBを読み込めませんでした。ローカルサーバー経由で開いているか確認してください。");
      console.error(error);
    },
  );

  const resize = () => {
    const rect = sceneHost.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    applyExpressionSettings();
  };

  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;
    if (state.mixer) state.mixer.update(delta);
    animateRig(elapsed);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}

function createFloor() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 96),
    new THREE.MeshStandardMaterial({
      color: 0xf3f8f8,
      roughness: 0.72,
      metalness: 0.04,
    }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.005;
  group.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.16, 96),
    new THREE.MeshBasicMaterial({
      color: 0x11a4a6,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.002;
  group.add(ring);

  return group;
}

function normalizeModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.96 / Math.max(size.y, 0.01);
  model.scale.setScalar(scale);
  model.position.x -= center.x * scale;
  model.position.z -= center.z * scale;
  model.position.y -= box.min.y * scale;
  model.position.y -= 0.2;
  model.rotation.y = MODEL_FRONT_Y;
}

function discoverRig(model) {
  const byName = {};
  model.traverse((node) => {
    if (!node.name) return;
    byName[node.name] = node;
    if (node.isBone) state.baseRotations.set(node.name, node.quaternion.clone());
  });

  state.head = byName.Head;
  state.neck = byName.NeckTwist01 || byName.NeckTwist02;
  state.spine = byName.Spine02 || byName.Spine01;
  state.leftUpperArm = byName.L_Upperarm;
  state.rightUpperArm = byName.R_Upperarm;
  state.rightForearm = byName.R_Forearm;
  state.rightHand = byName.R_Hand;
}

function improveMaterials(model) {
  state.modelSaturationUniforms = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material) return;
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
      if ("roughness" in material) material.roughness = Math.min(material.roughness ?? 0.8, 0.86);
      if ("metalness" in material) material.metalness = Math.min(material.metalness ?? 0, 0.22);
      addModelSaturationControl(material);
    });
  });
}

function addModelSaturationControl(material) {
  if (material.userData.tsunaguSaturationUniform) {
    state.modelSaturationUniforms.push(material.userData.tsunaguSaturationUniform);
    return;
  }

  const saturationUniform = { value: state.expression.modelSaturation / 100 };
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.userData.tsunaguSaturationUniform = saturationUniform;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousOnBeforeCompile) previousOnBeforeCompile(shader, renderer);
    shader.uniforms.tsunaguSaturation = saturationUniform;
    shader.fragmentShader = `uniform float tsunaguSaturation;
${shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float tsunaguLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(vec3(tsunaguLuma), diffuseColor.rgb, tsunaguSaturation);`,
    )}`;
  };
  state.modelSaturationUniforms.push(saturationUniform);
  material.needsUpdate = true;
}

function createFaceLayer() {
  const anchor = state.head || createFallbackFaceAnchor();
  if (!anchor) return;
  const usesFallbackAnchor = anchor === state.faceAnchor;
  const modelScale = new THREE.Vector3(1, 1, 1);
  if (usesFallbackAnchor && state.model) state.model.getWorldScale(modelScale);
  const layerWidth = usesFallbackAnchor ? 0.34 / Math.max(modelScale.x, 0.0001) : 0.118;
  const layerHeight = usesFallbackAnchor ? 0.35 / Math.max(modelScale.y, 0.0001) : 0.122;
  state.faceLayerBase = usesFallbackAnchor ? { x: 0, y: 0, z: 0 } : FACE_LAYER_BASE;
  state.faceLayerOffsetStep = usesFallbackAnchor ? 0.0016 / Math.max(modelScale.x, 0.0001) : 0.00055;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const layer = new THREE.Mesh(new THREE.PlaneGeometry(layerWidth, layerHeight), material);
  layer.name = "TsunaguExpressionParts";
  layer.position.set(state.faceLayerBase.x, state.faceLayerBase.y, state.faceLayerBase.z);
  layer.rotation.y = usesFallbackAnchor ? Math.PI / 2 : Math.PI;
  layer.renderOrder = 50;

  state.faceCanvas = canvas;
  state.faceContext = context;
  state.faceTexture = texture;
  state.faceLayer = layer;
  applyExpressionSettings();
  anchor.add(layer);
  drawFaceTexture(false, "open", 0);
}

function createFallbackFaceAnchor() {
  if (!state.model) return null;

  state.model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(state.model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const faceWorld = new THREE.Vector3(center.x, box.min.y + size.y * 0.9, box.max.z + size.z * 0.035);
  const faceLocal = state.model.worldToLocal(faceWorld.clone());

  const anchor = new THREE.Group();
  anchor.name = "TsunaguFallbackFaceAnchor";
  anchor.position.copy(faceLocal);
  state.faceAnchor = anchor;
  state.model.add(anchor);
  return anchor;
}

function animateRig(elapsed) {
  if (!state.model) return;
  const now = Date.now();
  const speaking = isSpeaking(now);
  const blinkFrame = getBlinkFrame(now);
  const breathe = Math.sin(elapsed * 1.7) * 0.018;
  const nod = speaking ? 0 : Math.sin(elapsed * 1.4) * 0.018;
  const sway = 0;

  if (state.hasAnimations) {
    state.model.position.y = 0;
    state.model.rotation.y = MODEL_FRONT_Y;
    updateBadgeMotion(0);
    updateFaceLayerVisibility();
    updateAnimationState();
    drawFaceTexture(speaking, blinkFrame, elapsed);
    assistantMood.classList.toggle("is-speaking", speaking);
    return;
  }

  state.model.position.y = breathe;
  state.model.rotation.y = MODEL_FRONT_Y;
  updateBadgeMotion(breathe);
  updateFaceLayerVisibility();

  setBoneRotation(state.head, {
    x: nod,
    y: speaking ? 0 : Math.sin(elapsed * 0.9) * 0.018,
    z: speaking ? 0 : Math.sin(elapsed * 0.7) * 0.012,
  });

  setBoneRotation(state.neck, {
    x: nod * 0.45,
    y: sway * 0.55,
    z: 0,
  });

  setBoneRotation(state.spine, {
    x: Math.sin(elapsed * 1.2) * 0.01,
    y: -sway * 0.45,
    z: 0,
  });

  const idleArmWave = speaking ? Math.sin(elapsed * 5.2) * 0.08 : Math.sin(elapsed * 1.1) * 0.025;
  setBoneRotation(state.leftUpperArm, { x: 0, y: 0, z: idleArmWave });
  setBoneRotation(state.rightUpperArm, { x: 0, y: 0, z: -idleArmWave * 0.45 });
  setBoneRotation(state.rightForearm, { x: 0, y: 0, z: 0 });
  setBoneRotation(state.rightHand, { x: 0, y: 0, z: 0 });

  drawFaceTexture(speaking, blinkFrame, elapsed);
  assistantMood.classList.toggle("is-speaking", speaking);
}

function initAnimations(model, animations) {
  state.clips = prepareAnimationClips(animations || []);
  state.hasAnimations = state.clips.length > 0;
  if (!state.hasAnimations) return;

  state.mixer = new THREE.AnimationMixer(model);
  state.mixer.addEventListener("finished", () => {
    clearBowTimer();
    updateAnimationState(true);
  });
  updateAnimationState(true);
}

function prepareAnimationClips(animations) {
  return animations.map((clip, index) => {
    if (index !== ANIM_ROLES.bow) return clip;
    const tracks = clip.tracks.filter((track) => !isRootMotionTrack(track.name));
    if (tracks.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(`${clip.name}-in-place`, clip.duration, tracks);
  });
}

function isRootMotionTrack(trackName) {
  if (!trackName.endsWith(".position")) return false;
  const nodeName = trackName.slice(0, -".position".length).toLowerCase();
  return /root|armature|hips?|pelvis|waist/.test(nodeName);
}

function clipForRole(role) {
  const index = ANIM_ROLES[role];
  if (index === undefined) return null;
  return state.clips[index] || null;
}

function playClipByRole(role, { loop = true, fade = 0.45 } = {}) {
  if (!state.mixer) return null;
  const clip = clipForRole(role);
  if (!clip) return null;

  const action = state.mixer.clipAction(clip);
  if (state.currentAction === action && state.currentRole === role && loop) return action;

  action.reset();
  action.enabled = true;
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;

  if (state.currentAction && state.currentAction !== action) {
    const previous = state.currentAction;
    previous.fadeOut(fade);
    window.setTimeout(() => {
      if (state.currentAction !== previous) previous.stop();
    }, fade * 1000 + 120);
  }

  action.fadeIn(fade);
  action.play();
  state.currentAction = action;
  state.currentRole = role;
  return action;
}

function updateAnimationState(force = false) {
  if (!state.hasAnimations || !state.mixer) return;
  if (!force && state.currentRole === "bow") return;
  if (force || state.currentRole !== "standA") {
    playClipByRole("standA", { fade: state.currentRole === "bow" ? 0.35 : 0.5 });
  }
}

function playBow(force = false) {
  if (!state.hasAnimations || !state.mixer) return;
  const now = Date.now();
  if (!force && now - state.lastBowAt < BOW_COOLDOWN_MS) return;

  const action = playClipByRole("bow", { loop: false, fade: 0.25 });
  if (!action) return;

  state.lastBowAt = now;
  clearBowTimer();
  state.bowTimer = window.setTimeout(() => {
    updateAnimationState(true);
  }, oneShotDurationMs(action));
}

function oneShotDurationMs(action) {
  const seconds = action.getClip().duration / Math.max(action.timeScale || 1, 0.1);
  return Math.min(seconds, 4.5) * 1000 + 450;
}

function clearBowTimer() {
  if (!state.bowTimer) return;
  window.clearTimeout(state.bowTimer);
  state.bowTimer = null;
}

function updateFaceLayerVisibility() {
  if (!state.faceLayer) return;
  let opacity = 1;
  if (state.currentRole === "bow") {
    const faceNormal = state.faceLayer.getWorldDirection(new THREE.Vector3());
    opacity *= smoothstep(-0.35, -0.08, faceNormal.y);
  }
  state.faceLayer.material.opacity = opacity;
  state.faceLayer.visible = opacity > 0.02;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function updateBadgeMotion(breathe) {
  if (!nameTagOverlay || !sceneHost) return;
  const hostHeight = Math.max(sceneHost.clientHeight || 0, 260);
  const motionY = -breathe * hostHeight * 0.28;
  nameTagOverlay.style.setProperty("--badge-motion-y", `${motionY.toFixed(2)}px`);
}

function drawFaceTexture(speaking, blinkFrame, elapsed) {
  if (!state.faceContext || !state.faceTexture) return;
  const mouthFrame = speaking ? Math.floor(elapsed * 12) % 3 : 0;
  const frameKey = `${state.faceAssetsReady}-${speaking}-${blinkFrame}-${mouthFrame}-${state.expressionRevision}`;
  if (frameKey === state.faceFrame) return;
  state.faceFrame = frameKey;

  const ctx = state.faceContext;
  const expression = state.expression;
  ctx.clearRect(0, 0, 512, 512);

  if (expression.patchVisible) {
    const skin = ctx.createRadialGradient(256, 245, 60, 256, 258, 215);
    skin.addColorStop(0, "rgba(255, 229, 211, 0.94)");
    skin.addColorStop(0.62, "rgba(246, 213, 196, 0.9)");
    skin.addColorStop(1, "rgba(231, 188, 174, 0.56)");

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(256, 262, 122 * (expression.patchWidth / 100), 154 * (expression.patchHeight / 100), 0, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = "#f2a6a6";
    ctx.beginPath();
    ctx.ellipse(168, 292, 34, 18, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(344, 292, 34, 18, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (state.faceAssetsReady) {
    const isHalfBlink = blinkFrame === "half";
    const isClosedBlink = blinkFrame === "closed";
    const eyeBaseY = isClosedBlink ? 185 : isHalfBlink ? 170 : 158;
    const eyeBaseHeight = isClosedBlink ? 32 : isHalfBlink ? 50 : 70;
    const eyeScale = expression.eyeScale / 100;
    const eyeWidth = 86 * eyeScale;
    const eyeHeight = eyeBaseHeight * eyeScale;
    const eyeY = eyeBaseY + expression.eyeY - (eyeHeight - eyeBaseHeight) / 2;
    const leftEyeX = 150 + expression.eyeX - expression.eyeGap / 2 - (eyeWidth - 86) / 2;
    const rightEyeX = 276 + expression.eyeX + expression.eyeGap / 2 - (eyeWidth - 86) / 2;

    drawImageContain(
      ctx,
      getEyeAsset("left", blinkFrame),
      leftEyeX,
      eyeY,
      eyeWidth,
      eyeHeight,
    );
    drawImageContain(
      ctx,
      getEyeAsset("right", blinkFrame),
      rightEyeX,
      eyeY,
      eyeWidth,
      eyeHeight,
    );

    if (expression.noseVisible) {
      const noseScale = expression.noseScale / 100;
      const noseSize = 124 * noseScale;
      drawImageContain(
        ctx,
        state.faceAssets.nosePart,
        256 + expression.noseX - noseSize / 2,
        246 + expression.noseY - noseSize / 2,
        noseSize,
        noseSize,
      );
    }

    const mouth =
      speaking && mouthFrame === 0
        ? state.faceAssets.mouthHalf
        : speaking && mouthFrame === 1
          ? state.faceAssets.mouthWide
          : speaking && mouthFrame === 2
            ? state.faceAssets.mouthHalf
            : state.faceAssets.mouthNeutral;
    const mouthBaseY = speaking ? 298 : 313;
    const mouthBaseHeight = speaking ? 62 : 30;
    const mouthScale = expression.mouthScale / 100;
    const mouthWidth = 64 * mouthScale;
    const mouthHeight = mouthBaseHeight * mouthScale;
    drawImageContain(
      ctx,
      mouth,
      224 + expression.mouthX - (mouthWidth - 64) / 2,
      mouthBaseY + expression.mouthY - (mouthHeight - mouthBaseHeight) / 2,
      mouthWidth,
      mouthHeight,
    );
  } else {
    if (blinkFrame === "closed") {
      drawClosedEye(ctx, 178, 221, -0.02);
      drawClosedEye(ctx, 334, 221, 0.02);
    } else if (blinkFrame === "half") {
      drawHalfEye(ctx, 178, 218, false);
      drawHalfEye(ctx, 334, 218, true);
    } else {
      drawOpenEye(ctx, 178, 218, false);
      drawOpenEye(ctx, 334, 218, true);
    }
    drawMouth(ctx, speaking, mouthFrame);
  }
  state.faceTexture.needsUpdate = true;
}

function drawImageContain(ctx, image, x, y, width, height, alpha = 1) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function getBlinkFrame(now = Date.now()) {
  if (now >= state.blinkUntil) return "open";
  const progress = Math.min(1, Math.max(0, (now - state.blinkStartedAt) / state.blinkDuration));
  if (progress < 0.24) return "half";
  if (progress < 0.62) return "closed";
  if (progress < 0.88) return "half";
  return "open";
}

function getEyeAsset(side, blinkFrame) {
  const prefix = side === "left" ? "eyeLeft" : "eyeRight";
  if (blinkFrame === "closed") return state.faceAssets[`${prefix}Closed`] || state.faceAssets[`${prefix}Half`];
  if (blinkFrame === "half") return state.faceAssets[`${prefix}Half`] || state.faceAssets[`${prefix}Open`];
  return state.faceAssets[`${prefix}Open`];
}

function drawOpenEye(ctx, x, y, flip) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);

  ctx.fillStyle = "rgba(255, 249, 243, 0.98)";
  ctx.strokeStyle = "rgba(67, 42, 34, 0.94)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 38, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const iris = ctx.createRadialGradient(-5, -7, 3, 0, 0, 25);
  iris.addColorStop(0, "#f1cf9c");
  iris.addColorStop(0.38, "#8e5b38");
  iris.addColorStop(1, "#2d1d19");
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.ellipse(0, 5, 17, 25, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#18100e";
  ctx.beginPath();
  ctx.ellipse(0, 8, 8, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(-8, -11, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, 6, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(58, 35, 28, 0.95)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-32, -27);
  ctx.quadraticCurveTo(0, -45, 33, -24);
  ctx.stroke();

  ctx.restore();
}

function drawHalfEye(ctx, x, y, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.56);
  drawOpenEye(ctx, 0, 0, flip);
  ctx.restore();
}

function drawClosedEye(ctx, x, y, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.strokeStyle = "rgba(60, 37, 30, 0.96)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-31, 0);
  ctx.quadraticCurveTo(0, 13, 31, 0);
  ctx.stroke();
  ctx.restore();
}

function drawMouth(ctx, speaking, frame) {
  ctx.save();
  ctx.translate(256, 332);
  ctx.strokeStyle = "rgba(112, 48, 45, 0.9)";
  ctx.fillStyle = "rgba(94, 30, 34, 0.82)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  if (!speaking) {
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.quadraticCurveTo(0, 10, 16, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const heights = [19, 25, 19];
  const widths = [21, 22, 21];
  ctx.beginPath();
  ctx.ellipse(0, 4, widths[frame], heights[frame], 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(244, 138, 146, 0.72)";
  ctx.beginPath();
  ctx.ellipse(0, 15, widths[frame] * 0.52, heights[frame] * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function setBoneRotation(bone, offset) {
  if (!bone) return;
  const base = state.baseRotations.get(bone.name);
  if (!base) return;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(offset.x, offset.y, offset.z, "XYZ"));
  bone.quaternion.copy(base).multiply(q);
}

function countMorphTargets(model) {
  let count = 0;
  model.traverse((node) => {
    if (!node.isMesh || !node.morphTargetDictionary) return;
    count += Object.keys(node.morphTargetDictionary).length;
  });
  return count;
}

function countBones(model) {
  let count = 0;
  model.traverse((node) => {
    if (node.isBone) count += 1;
  });
  return count;
}

function initConversation() {
  addMessage("assistant", "受付を開始しました。ご用件を選んでください。");
}

function initEvents() {
  voiceStatus.textContent = "ブラウザ読み上げ";
  initExpressionControls();

  stagePanel?.addEventListener("pointerup", handleStageTap);

  quickActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-intent]");
    if (!button) return;
    const intent = intents[button.dataset.intent];
    if (!intent) return;
    addMessage("user", intent.label);
    speak(intent.say);
  });

  greetingActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-greeting]");
    if (!button) return;
    const greeting = greetings[button.dataset.greeting];
    if (!greeting) return;
    addMessage("user", greeting.label);
    speak(greeting.say);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage("user", text);
    speak(createReply(text));
  });

  soundToggle.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundToggle.classList.toggle("is-active", state.soundEnabled);
    soundToggle.setAttribute("aria-label", state.soundEnabled ? "音声オン" : "音声オフ");
    if (!state.soundEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      stopSpeechTracking();
    }
  });

  initSpeechRecognition();
  setupBlinking();
}

function handleStageTap(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const now = Date.now();
  if (now - state.lastStageTapAt < 700 || isSpeaking(now)) return;

  state.lastStageTapAt = now;
  speak(pickRandomLine(tapTalk));
}

function pickRandomLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micButton.disabled = true;
    micButton.title = "このブラウザでは音声入力に未対応です";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.continuous = false;
  state.recognition = recognition;

  micButton.addEventListener("click", () => {
    listenState.textContent = "聞き取り中";
    micButton.classList.add("is-active");
    recognition.start();
  });

  recognition.addEventListener("result", (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join("")
      .trim();
    if (!text) return;
    input.value = text;
    form.requestSubmit();
  });

  recognition.addEventListener("end", () => {
    listenState.textContent = "待機中";
    micButton.classList.remove("is-active");
  });

  recognition.addEventListener("error", () => {
    listenState.textContent = "音声入力エラー";
    micButton.classList.remove("is-active");
  });
}

function setupBlinking() {
  const blink = () => {
    state.blinkStartedAt = Date.now();
    state.blinkUntil = state.blinkStartedAt + state.blinkDuration;
    window.setTimeout(blink, 1800 + Math.random() * 2200);
  };
  window.setTimeout(blink, 1400);
}

function createReply(text) {
  const normalized = text.toLowerCase();
  const matched = fallbackReplies.find((reply) => reply.keys.some((key) => normalized.includes(key.toLowerCase())));
  if (matched) return matched.say;
  return "承知しました。受付メモに記録しました。担当者名、会社名、お名前のいずれかが分かる場合は続けて入力してください。";
}

function speak(text, options = {}) {
  state.lastInteractionAt = Date.now();
  speechText.textContent = text;
  addMessage("assistant", text);
  if (options.bow ?? shouldBowForSpeech(text)) playBow();
  startSpeechOutput(text, {
    minDuration: 2200,
    msPerCharacter: 135,
    rate: 1.03,
    pitch: 1.12,
    volume: 0.92,
  });
}

function shouldBowForSpeech(text) {
  return /ようこそ|いらっしゃい|おはよう|こんにちは|こんばんは|お帰り|ありがとう|お疲れ/.test(text);
}

function sayIdleLine() {
  if (isSpeaking()) return;
  if (Date.now() - state.lastInteractionAt < 60000) return;
  const text = idleTalk[Math.floor(Math.random() * idleTalk.length)];
  speechText.textContent = text;
  startSpeechOutput(text, {
    minDuration: 1900,
    msPerCharacter: 120,
    rate: 1.02,
    pitch: 1.1,
    volume: 0.82,
  });
}

function startSpeechOutput(text, options = {}) {
  const {
    minDuration = 1800,
    msPerCharacter = 130,
    rate = 1.03,
    pitch = 1.1,
    volume = 0.9,
  } = options;
  const estimatedDuration = estimateSpeechDuration(text, minDuration, msPerCharacter);
  state.speechToken += 1;
  const token = state.speechToken;
  state.speechActive = false;
  clearSpeechKeepAlive();
  state.speakingUntil = Date.now() + estimatedDuration;
  state.faceFrame = "";

  if (!state.soundEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  state.speechActive = true;
  state.speakingUntil = Date.now() + Math.max(estimatedDuration, 15000);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = volume;
  utterance.addEventListener("start", () => {
    if (token !== state.speechToken) return;
    state.speechActive = true;
    state.speakingUntil = Date.now() + Math.max(estimatedDuration, 3000);
  });
  utterance.addEventListener("boundary", () => {
    if (token !== state.speechToken || !state.speechActive) return;
    state.speakingUntil = Date.now() + 1800;
  });
  utterance.addEventListener("end", () => finishSpeechTracking(token));
  utterance.addEventListener("error", () => finishSpeechTracking(token));
  state.speechKeepAliveTimer = window.setInterval(() => {
    if (token !== state.speechToken || !state.speechActive) {
      clearSpeechKeepAlive();
      return;
    }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      state.speakingUntil = Date.now() + 1800;
    }
  }, 900);
  window.speechSynthesis.speak(utterance);
}

function estimateSpeechDuration(text, minDuration, msPerCharacter) {
  return Math.max(minDuration, text.length * msPerCharacter + 800);
}

function isSpeaking(now = Date.now()) {
  if (
    state.speechActive &&
    "speechSynthesis" in window &&
    (window.speechSynthesis.speaking || window.speechSynthesis.pending || window.speechSynthesis.paused)
  ) {
    return true;
  }
  return now < state.speakingUntil;
}

function finishSpeechTracking(token) {
  if (token !== state.speechToken) return;
  state.speechActive = false;
  clearSpeechKeepAlive();
  closeMouthNow();
}

function stopSpeechTracking() {
  state.speechToken += 1;
  state.speechActive = false;
  clearSpeechKeepAlive();
  closeMouthNow();
}

function clearSpeechKeepAlive() {
  if (!state.speechKeepAliveTimer) return;
  window.clearInterval(state.speechKeepAliveTimer);
  state.speechKeepAliveTimer = null;
}

function closeMouthNow() {
  state.speakingUntil = 0;
  state.faceFrame = "";
  drawFaceTexture(false, getBlinkFrame(), 0);
  assistantMood.classList.remove("is-speaking");
}

function addMessage(role, text) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  const speaker = role === "user" ? "来訪者" : "つなぐ";
  item.innerHTML = `<strong>${speaker}</strong><span></span>`;
  item.querySelector("span").textContent = text;
  conversation.appendChild(item);
  conversation.scrollTop = conversation.scrollHeight;
}

function updateClock() {
  const now = new Date();
  clockText.textContent = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

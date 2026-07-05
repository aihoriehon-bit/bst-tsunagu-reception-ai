import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---- モデル・素材（縦型版と共有） ----
const MODEL_URL = "../bst-latest-0701.glb?v=20260702-1";
const AUDIO_FALLBACK_VERSION = "20260703-13";

// GLBに入っているアニメーションの割り当て（wide/animtest.html で目視確認）
// 5: 歩行 / 6: 自然な立ち待機 / 7: お辞儀。
// 受付画面では挙動を安定させるため、この3種類だけを使う。
// 使うアニメーションは「歩き・立ち待機・お辞儀」の3つだけ（オーナー指定）
const ANIM_ROLES = {
  walk: 5,
  standA: 6,
  bow: 7,
};
const FLOURISH_MIN_MS = 45000; // ランダム動作の間隔（最短）
const FLOURISH_MAX_MS = 100000; // ランダム動作の間隔（最長）
const RETURN_AFTER_BOW_PAUSE_MS = 1400;
const MODEL_FRONT_Y = -Math.PI / 2 + 0.03;
const FACE_PART_URLS = {
  eyeLeftOpen: "../assets/face-parts/eye-left-open.png",
  eyeRightOpen: "../assets/face-parts/eye-right-open.png",
  eyeLeftHalf: "../assets/face-parts/eye-left-half.png",
  eyeRightHalf: "../assets/face-parts/eye-right-half.png",
  eyeLeftClosed: "../assets/face-parts/eye-left-closed.png",
  eyeRightClosed: "../assets/face-parts/eye-right-closed.png",
  mouthNeutral: "../assets/face-parts/mouth-neutral.png",
  mouthHalf: "../assets/face-parts/mouth-half-open.png?v=20260701-5",
  mouthWide: "../assets/face-parts/mouth-wide-open.png",
};
const SPEECH_PRONUNCIATION_RULES = [
  [/有限会社ビジネスシステム通信/g, "ゆうげんがいしゃ ビジネスシステムつうしん"],
  [/ビジネスシステム通信/g, "ビジネスシステムつうしん"],
  [/受付AI/g, "うけつけエーアイ"],
  [/来客受付/g, "らいきゃくうけつけ"],
  [/防犯カメラ/g, "ぼうはんカメラ"],
  [/各種監視機器/g, "かくしゅ かんしきき"],
  [/監視機器/g, "かんしきき"],
  [/業務用無線機/g, "ぎょうむようむせんき"],
  [/業務用無線/g, "ぎょうむようむせん"],
  [/無線機/g, "むせんき"],
  [/LED照明/g, "エルイーディーしょうめい"],
  [/弱電工事/g, "じゃくでんこうじ"],
  [/電気工事/g, "でんきこうじ"],
  [/映像音響設備/g, "えいぞうおんきょうせつび"],
  [/映像音響/g, "えいぞうおんきょう"],
  [/犯罪抑止/g, "はんざいよくし"],
  [/安全確認/g, "あんぜんかくにん"],
  [/緊急/g, "きんきゅう"],
  [/常設/g, "じょうせつ"],
  [/仮設/g, "かせつ"],
  [/施錠/g, "せじょう"],
  [/ご来社/g, "ごらいしゃ"],
  [/来社/g, "らいしゃ"],
  [/福田/g, "ふくだ"],
  [/訪問先/g, "ほうもんさき"],
  [/担当者/g, "たんとうしゃ"],
  [/担当/g, "たんとう"],
  [/会社名/g, "かいしゃめい"],
  [/お名前/g, "おなまえ"],
  [/順番/g, "じゅんばん"],
  [/設置場所/g, "せっちばしょ"],
  [/台数/g, "だいすう"],
  [/ご希望/g, "ごきぼう"],
  [/用途/g, "ようと"],
  [/伺って/g, "うかがって"],
  [/利用場所/g, "りようばしょ"],
  [/利用/g, "りよう"],
  [/購入/g, "こうにゅう"],
  [/建物/g, "たてもの"],
  [/種類/g, "しゅるい"],
  [/工事場所/g, "こうじばしょ"],
  [/希望時期/g, "きぼうじき"],
  [/照明/g, "しょうめい"],
  [/連絡事項/g, "れんらくじこう"],
  [/社内連絡/g, "しゃないれんらく"],
  [/ご連絡/g, "ごれんらく"],
  [/連絡/g, "れんらく"],
  [/傘立て/g, "かさたて"],
  [/外出/g, "がいしゅつ"],
  [/面接/g, "めんせつ"],
  [/採用/g, "さいよう"],
  [/履歴書/g, "りれきしょ"],
  [/予約時間/g, "よやくじかん"],
  [/到着/g, "とうちゃく"],
  [/納期/g, "のうき"],
  [/発生場所/g, "はっせいばしょ"],
  [/通知/g, "つうち"],
  [/内容/g, "ないよう"],
  [/優先/g, "ゆうせん"],
  [/本日/g, "ほんじつ"],
  [/機器/g, "きき"],
  [/確認/g, "かくにん"],
  [/お知らせ/g, "おしらせ"],
  [/お伝え/g, "おつたえ"],
  [/お疲れ/g, "おつかれ"],
  [/ご相談/g, "ごそうだん"],
  [/相談/g, "そうだん"],
  [/横型/g, "よこがた"],
  [/お荷物/g, "おにもつ"],
  [/受け渡し/g, "うけわたし"],
  [/少々/g, "しょうしょう"],
  [/受付/g, "うけつけ"],
  [/ご用件/g, "ごようけん"],
  [/お声がけ/g, "おこえがけ"],
  [/承ります/g, "うけたまわります"],
  [/承っています/g, "うけたまわっています"],
  [/Wi-?Fi/g, "ワイファイ"],
  [/LED/g, "エルイーディー"],
  [/BST/g, "ビーエスティー"],
  [/GLB/g, "ジーエルビー"],
  [/URL/g, "ユーアールエル"],
  [/QR/g, "キューアール"],
  [/ID/g, "アイディー"],
  [/3D/g, "スリーディー"],
  [/AI/g, "エーアイ"],
];
const AUDIO_FALLBACKS = new Map(
  [
    ["受付AIのつなぐ、横型モードで起動しました。普段はデスクで作業をしながら、ご来客をお待ちしています。", "startup"],
    ["あ、いらっしゃいませ。ただいま参りますね。", "approach"],
    ["ありがとうございました。それでは、作業に戻りますね。", "return-to-work"],
    [
      "おはようございます。有限会社ビジネスシステム通信へようこそ。受付AIのつなぐです。担当者をお呼びしますので、お名前とご用件をお聞かせください。",
      "arrival-ohayo",
    ],
    [
      "こんにちは。有限会社ビジネスシステム通信へようこそ。受付AIのつなぐです。担当者をお呼びしますので、お名前とご用件をお聞かせください。",
      "arrival-konnichiwa",
    ],
    [
      "こんばんは。有限会社ビジネスシステム通信へようこそ。受付AIのつなぐです。担当者をお呼びしますので、お名前とご用件をお聞かせください。",
      "arrival-konbanwa",
    ],
    ["佐藤さん、お帰りなさい。今日もお疲れ様でした。ご用件があれば、いつでもお声がけください。", "employee-sato"],
    ["田中さん、お帰りなさい。今日もお疲れ様でした。ご用件があれば、いつでもお声がけください。", "employee-tanaka"],
    ["福田さん、おはようございます。いつもありがとうございます。ご用件があればお気軽にお声がけください。", "fukuda-ohayo"],
    ["福田さん、こんにちは。いつもありがとうございます。ご用件があればお気軽にお声がけください。", "fukuda-konnichiwa"],
    ["福田さん、こんばんは。いつもありがとうございます。ご用件があればお気軽にお声がけください。", "fukuda-konbanwa"],
    [
      "いつもお疲れさまです。ヤマトの方ですね。お荷物の受け渡しでしたら、こちらで承ります。担当者をお呼びしますので、少々お待ちください。",
      "yamato-clothing",
    ],
    [
      "いつもお疲れさまです。お荷物の受け渡しでしたら、こちらで承ります。担当者をお呼びしますので、少々お待ちください。",
      "clothing-visitor",
    ],
    ["いつもありがとうございます。ご用件があればお気軽にお声がけください。", "known-visitor"],
    ["ご用件がお決まりでしたら、担当スタッフをお呼びしますね。", "idle-request"],
    ["防犯カメラ、業務用無線、LED工事、映像音響のご相談を承っています。", "idle-services"],
    ["お約束のある方は、お名前と担当者名を教えてください。", "idle-appointment"],
    ["ふんふん…受付メモを整理しています。", "work-memo"],
    ["次のご来客に備えて、準備をしています。", "work-prepare"],
    ["本日の予定を確認しています。", "work-schedule"],
  ].map(([text, file]) => [normalizeSpeechAudioKey(text), file]),
);

// 縦型版で調整済みの表情配置をそのまま使う（横型は編集UIなしの固定値）
const EXPRESSION = {
  layerX: 2,
  layerY: -24,
  eyeX: -7,
  eyeY: 77,
  eyeGap: 109,
  eyeScale: 171,
  mouthX: -5,
  mouthY: 90,
  mouthScale: 180,
  modelBrightness: 128,
  modelSaturation: 148,
};
const FACE_LAYER_BASE = { x: 0.003, y: 0.088, z: -0.04 };

// ---- 舞台のレイアウト ----
const WORK_POS = { x: 1.43, z: -0.85 }; // デスクから少し離し、手や脚がめり込まないようにする
const GREET_POS = { x: -0.08, z: 1.42 };
const WALK_CORRIDOR_X = 0.52;
const WALK_SPEED = 0.68; // m/s
const DESK_CENTER = { x: 1.5, z: -0.12 };

// ---- 社員デモ（顔照合なしの名前呼びかけ） ----
// 写真や顔特徴量ではなく、ボタン/社員証/QRなどのID入力を想定したデモ人物。
const EMPLOYEE_DEMO_PROFILES = {
  woman: { name: "佐藤", kind: "employee", label: "佐藤さん" },
  man: { name: "田中", kind: "employee", label: "田中さん" },
};

// ---- 服装識別（宅配業者の制服など） ----
// 顔検出位置の下（胸〜お腹）の色の特徴を取り込み、登録済みの服装と照合する。
// 画像そのものは保存せず、色の割合（ヒストグラム）だけを端末内に保存する。
const CLOTHING_DB_STORAGE_KEY = "tsunagu-clothing-db-v1";
const CLOTHING_MATCH_THRESHOLD = 0.86; // コサイン類似度がこれ以上なら同じ服装とみなす

// ---- 顔識別（カメラで人物を判別して名前を呼ぶ） ----
// 顔の特徴量（128個の数値）だけを localStorage に保存して照合する。
// 顔写真そのものは保存せず、外部にも送信しない。
const FACE_API_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js";
const FACE_API_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
// v3: 顔切り出し+拡大照合に変更したため保存キーを更新（旧登録はやり直し）
const FACE_DB_STORAGE_KEY = "tsunagu-face-db-v3";
const FACE_MATCH_THRESHOLD = 0.5; // 特徴量どうしの距離がこれ以下なら同一人物とみなす（基準値）
const FACE_MATCH_THRESHOLD_FLOOR = 0.35; // 自動調整で厳しくしすぎない下限
const FACE_INTER_RATIO = 0.85; // 登録者同士の最小距離に掛ける安全係数
const FACE_MATCH_MARGIN = 0.07; // 2位（別の登録者）との距離差がこれ未満なら「紛らわしい」ので確定しない
const FACE_SAMPLE_COUNT = 3; // 登録1回で自動撮影するサンプル数
const FACE_MAX_SAMPLES = 12; // 1人あたり保存するサンプル数の上限
const SENSOR_PANEL_STORAGE_KEY = "tsunagu-sensor-panel-visible";

// ---- 来客判定のしきい値 ----
const FACE_CONFIRM_MS = 600; // これ以上連続で顔が見えたら「来客」
const FACE_LOST_MS = 8000; // これ以上顔が見えなければ「お帰りになった」
const TEST_VISITOR_MS = 18000;
const DETECT_INTERVAL_MS = 160;

const sceneHost = document.querySelector("#scene");
const modelStatus = document.querySelector("#modelStatus");
const speechBubble = document.querySelector("#speechBubble");
const speechText = document.querySelector("#speechText");
const assistantMood = document.querySelector("#assistantMood");
const clockText = document.querySelector("#clockText");
const stateChip = document.querySelector("#stateChip");
const soundToggle = document.querySelector("#soundToggle");
const soundPrimer = document.querySelector("#soundPrimer");
const sensorPanelToggle = document.querySelector("#sensorPanelToggle");
const namePlate = document.querySelector("#namePlate");
const cameraPanel = document.querySelector("#cameraPanel");
const cameraPreview = document.querySelector("#cameraPreview");
const cameraStatus = document.querySelector("#cameraStatus");
const visitorStatus = document.querySelector("#visitorStatus");
const cameraToggle = document.querySelector("#cameraToggle");
const employeeDemoToggle = document.querySelector("#employeeDemoToggle");
const employeeDemo = document.querySelector("#employeeDemo");
const demoStatus = document.querySelector("#demoStatus");
const demoEmployeeWoman = document.querySelector("#demoEmployeeWoman");
const demoEmployeeMan = document.querySelector("#demoEmployeeMan");
const registerName = document.querySelector("#registerName");
const registerStatus = document.querySelector("#registerStatus");
const registerFaceButton = document.querySelector("#registerFaceButton");
const registerClothingButton = document.querySelector("#registerClothingButton");
const registeredList = document.querySelector("#registeredList");
const matchTest = document.querySelector("#matchTest");
const cameraView = document.querySelector(".camera-view");
const cameraFaceMark = document.querySelector("#cameraFaceMark");
const visitorTest = document.querySelector("#visitorTest");

const state = {
  renderer: null,
  camera: null,
  characterRoot: null,
  model: null,
  modelSaturationUniforms: [],
  head: null,
  neck: null,
  spine: null,
  pelvis: null,
  leftClavicle: null,
  rightClavicle: null,
  leftUpperArm: null,
  rightUpperArm: null,
  leftForearm: null,
  rightForearm: null,
  leftHand: null,
  rightHand: null,
  leftThigh: null,
  rightThigh: null,
  leftCalf: null,
  rightCalf: null,
  leftFoot: null,
  rightFoot: null,
  leftToe: null,
  rightToe: null,
  baseRotations: new Map(),
  plateAnchor: null,

  faceCanvas: null,
  faceContext: null,
  faceTexture: null,
  faceLayer: null,
  faceAssets: {},
  faceAssetsReady: false,
  faceFrame: "",
  blinkStartedAt: 0,
  blinkDuration: 280,
  blinkUntil: 0,

  speakingUntil: 0,
  speechActive: false,
  speechToken: 0,
  speechKeepAliveTimer: null,
  speechRetryTimer: null,
  bubbleHideTimer: null,
  soundEnabled: true,
  lastSpeechRequest: null,
  currentUtterance: null,
  currentFallbackAudio: null,
  speechUnlocked: false,
  ttsPrimed: false,
  faceMatchThreshold: FACE_MATCH_THRESHOLD,

  // GLB内蔵アニメーション
  mixer: null,
  clips: [],
  hasAnimations: false,
  currentAction: null,
  currentRole: "",
  flourishActive: false,
  flourishTimer: null,
  nextFlourishAt: Date.now() + 20000,

  // ふるまい: working / approaching / attending / returning
  behavior: "working",
  heading: 0,
  headingTarget: 0,
  walk: null,
  returnTimer: null,
  returnPending: false,
  position: { x: WORK_POS.x, z: WORK_POS.z },
  lastAttendTalkAt: 0,
  lastWorkTalkAt: Date.now(),
  sensorPanelVisible: loadSensorPanelVisible(),

  // 来客センサー
  cameraStream: null,
  faceDetector: null,
  detectorFailed: false,
  detectTimer: null,
  faceVisible: false,
  faceFirstSeenAt: 0,
  faceLastSeenAt: 0,
  testVisitorUntil: 0,
  visitorPerson: null,
  demoVisitorPerson: null,
  pendingVisitorGreeting: null,
  announcedVisitorKey: "",

  // 社員デモ / 服装識別
  identifyBusy: false,
  lastIdentifyAt: 0,
  matchTestTimer: null,

  // 服装識別
  clothingDb: loadClothingDb(),

  // 顔識別
  faceApi: null,
  faceApiPromise: null,
  faceApiFailed: false,
  faceDb: loadFaceDb(),
  descriptorBusy: false,
  clothingCanvas: null,
  lastFaceBox: null,
  lastFaceBoxAt: 0,
};

const STATE_LABELS = {
  working: "作業中",
  approaching: "お出迎え中",
  attending: "接客中",
  returning: "戻り中",
};

const attendIdleTalk = [
  "ご用件がお決まりでしたら、担当スタッフをお呼びしますね。",
  "防犯カメラ、業務用無線、LED工事、映像音響のご相談を承っています。",
  "お約束のある方は、お名前と担当者名を教えてください。",
];

const workingTalk = [
  "ふんふん…受付メモを整理しています。",
  "次のご来客に備えて、準備をしています。",
  "本日の予定を確認しています。",
];

init();
window.__tsunagu = state;

function init() {
  initScene();
  loadFaceAssets();
  setupBlinking();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateBehavior, 300);
  initHudEvents();
  initSpeechAutoStart();
  recomputeFaceThreshold();
  startCamera();
}

function initSpeechAutoStart() {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.resume();
    } catch (error) {
      console.warn("Speech auto start failed", error);
    }

    const retry = () => retryLastSpeech("speech-ready");
    window.speechSynthesis.addEventListener?.("voiceschanged", retry);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) retryLastSpeech("visible");
    });
    window.addEventListener("pageshow", () => retryLastSpeech("pageshow"));
  }
  const unlock = (event) => {
    if (event?.target?.closest?.("#soundToggle, #soundPrimer")) return;
    unlockSpeechFromGesture("page-interaction");
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  soundPrimer?.addEventListener("click", (event) => {
    event.stopPropagation();
    unlockSpeechFromGesture("sound-primer", { forceReplay: true });
  });
}

// ============================================================
// 3Dシーン
// ============================================================

function initScene() {
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.01, 100);
  camera.position.set(0, 1.58, 4.55);
  camera.lookAt(0, 0.98, 0);
  state.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPRESSION.modelBrightness / 100;
  state.renderer = renderer;
  sceneHost.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fc5d0, 2.4));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(2.7, 4.6, 4.2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
  fillLight.position.set(-1.5, 2.1, 3.8);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x65d6d4, 0.9);
  rimLight.position.set(-3, 2.5, -2.4);
  scene.add(rimLight);

  scene.add(createFloor());
  scene.add(createOfficeBackdrop());
  scene.add(createLobbyDetails());
  scene.add(createDesk());

  const characterRoot = new THREE.Group();
  characterRoot.name = "TsunaguCharacterRoot";
  characterRoot.position.set(WORK_POS.x, 0, WORK_POS.z);
  state.characterRoot = characterRoot;
  scene.add(characterRoot);

  const plateAnchor = new THREE.Object3D();
  plateAnchor.name = "TsunaguNamePlateAnchor";
  plateAnchor.position.set(0, 1.82, 0);
  characterRoot.add(plateAnchor);
  state.plateAnchor = plateAnchor;

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      state.model = model;
      normalizeModel(model);
      discoverRig(model);
      improveMaterials(model);
      createFaceLayer();
      characterRoot.add(model);
      initAnimations(model, gltf.animations);
      modelStatus.textContent = state.hasAnimations
        ? "3Dモデル表示中（立ち待機・歩き・お辞儀）"
        : "3Dモデル表示中";
      speak("受付AIのつなぐ、横型モードで起動しました。普段はデスクで作業をしながら、ご来客をお待ちしています。");
      scheduleBubbleHide(6000);
    },
    (event) => {
      if (!event.total) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      modelStatus.textContent = `3Dモデル読み込み中 ${progress}%`;
    },
    (error) => {
      modelStatus.textContent = "3Dモデル読み込み失敗（ローカルサーバー経由で開いてください）";
      console.error(error);
    },
  );

  const resize = () => {
    const rect = sceneHost.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  };
  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;
    if (state.mixer) state.mixer.update(delta);
    animateCharacter(elapsed);
    updateNamePlate();
    renderer.render(scene, camera);
  };
  animate();
}

function createFloor() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 9),
    new THREE.MeshStandardMaterial({ color: 0xe8eef1, roughness: 0.8, metalness: 0.03 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.006, 0);
  group.add(base);

  // 床の目地（オフィスのタイルカーペット風）
  const seamMaterial = new THREE.MeshBasicMaterial({ color: 0xd4dde1, transparent: true, opacity: 0.5 });
  for (let x = -6; x <= 6; x += 1.2) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 9), seamMaterial);
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(x, -0.004, 0);
    group.add(seam);
  }

  const greetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.54, 80),
    new THREE.MeshBasicMaterial({ color: 0x11a4a6, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  greetRing.rotation.x = -Math.PI / 2;
  greetRing.position.set(GREET_POS.x, -0.002, GREET_POS.z);
  group.add(greetRing);

  return group;
}

function createDesk() {
  const group = new THREE.Group();
  const deskColor = new THREE.MeshStandardMaterial({ color: 0xf6fbfc, roughness: 0.55, metalness: 0.05 });
  const accentColor = new THREE.MeshStandardMaterial({ color: 0x11a4a6, roughness: 0.5, metalness: 0.1 });
  const darkColor = new THREE.MeshStandardMaterial({ color: 0x28414c, roughness: 0.5, metalness: 0.2 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.62), deskColor);
  top.position.set(DESK_CENTER.x, 0.78, DESK_CENTER.z);
  group.add(top);

  const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.74, 0.05), deskColor);
  frontPanel.position.set(DESK_CENTER.x, 0.39, DESK_CENTER.z + 0.28);
  group.add(frontPanel);

  const accentLine = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.055), accentColor);
  accentLine.position.set(DESK_CENTER.x, 0.62, DESK_CENTER.z + 0.28);
  group.add(accentLine);

  const sidePanelLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.74, 0.58), deskColor);
  sidePanelLeft.position.set(DESK_CENTER.x - 0.62, 0.39, DESK_CENTER.z);
  group.add(sidePanelLeft);

  const sidePanelRight = sidePanelLeft.clone();
  sidePanelRight.position.x = DESK_CENTER.x + 0.62;
  group.add(sidePanelRight);

  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.03), darkColor);
  monitor.position.set(DESK_CENTER.x - 0.18, 1.02, DESK_CENTER.z - 0.08);
  monitor.rotation.y = 0.28;
  group.add(monitor);

  const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), darkColor);
  monitorStand.position.set(DESK_CENTER.x - 0.18, 0.86, DESK_CENTER.z - 0.08);
  group.add(monitorStand);

  const papers = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.015, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  );
  papers.position.set(DESK_CENTER.x + 0.3, 0.815, DESK_CENTER.z - 0.05);
  papers.rotation.y = -0.15;
  group.add(papers);

  return group;
}

// 理想動画のオフィス風景（白い壁・ホワイトボード・時計・デスク列・チェア・窓）
function createOfficeBackdrop() {
  const group = new THREE.Group();
  const WALL_Z = -3.05;

  // 白い壁と幅木
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 4.8),
    new THREE.MeshStandardMaterial({ color: 0xf3f7f8, roughness: 0.92 }),
  );
  wall.position.set(0, 2.3, WALL_Z);
  group.add(wall);

  const skirting = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.14, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xbcc9ce, roughness: 0.8 }),
  );
  skirting.position.set(0, 0.07, WALL_Z + 0.02);
  group.add(skirting);

  // 窓（左奥、明るい空色）
  const windowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x9fb3ba, roughness: 0.6 }),
  );
  windowFrame.position.set(-4.6, 2.05, WALL_Z + 0.01);
  group.add(windowFrame);
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.34, 1.44),
    new THREE.MeshBasicMaterial({ color: 0xd9edf5 }),
  );
  windowGlass.position.set(-4.6, 2.05, WALL_Z + 0.045);
  group.add(windowGlass);
  const windowBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.44, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x9fb3ba, roughness: 0.6 }),
  );
  windowBar.position.set(-4.6, 2.05, WALL_Z + 0.05);
  group.add(windowBar);

  // ホワイトボード（左右に1枚ずつ）
  [-2.5, 2.6].forEach((x) => {
    const boardFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.05, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xd7e0e3, roughness: 0.7 }),
    );
    boardFrame.position.set(x, 1.95, WALL_Z + 0.02);
    group.add(boardFrame);
    const boardFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 0.93),
      new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.5 }),
    );
    boardFace.position.set(x, 1.95, WALL_Z + 0.045);
    group.add(boardFace);
    // ボードの書き込み風ライン
    const inkColors = [0x5b7f8c, 0x11a4a6, 0xc06a6a];
    inkColors.forEach((color, index) => {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9 - index * 0.18, 0.035),
        new THREE.MeshBasicMaterial({ color }),
      );
      line.position.set(x - 0.15, 2.18 - index * 0.18, WALL_Z + 0.05);
      group.add(line);
    });
  });

  // 掛け時計（針は実際の時刻と連動して updateWallClock() で回る）
  const clockGroup = new THREE.Group();
  clockGroup.position.set(0.6, 2.85, WALL_Z + 0.04);
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.02, 40),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  );
  clockFace.rotation.x = Math.PI / 2;
  clockGroup.add(clockFace);
  const clockRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.02, 12, 40),
    new THREE.MeshStandardMaterial({ color: 0x30454e, roughness: 0.5 }),
  );
  clockGroup.add(clockRim);
  // 12時位置の目印
  const twelveMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.035, 0.01),
    new THREE.MeshBasicMaterial({ color: 0x30454e }),
  );
  twelveMark.position.set(0, 0.15, 0.015);
  clockGroup.add(twelveMark);
  // 針は根元を軸に回せるよう、ジオメトリを上方向へずらしておく
  const hourGeometry = new THREE.BoxGeometry(0.02, 0.095, 0.012);
  hourGeometry.translate(0, 0.0475, 0);
  const hourHand = new THREE.Mesh(hourGeometry, new THREE.MeshBasicMaterial({ color: 0x30454e }));
  hourHand.position.z = 0.018;
  clockGroup.add(hourHand);
  const minuteGeometry = new THREE.BoxGeometry(0.015, 0.15, 0.012);
  minuteGeometry.translate(0, 0.075, 0);
  const minuteHand = new THREE.Mesh(minuteGeometry, new THREE.MeshBasicMaterial({ color: 0x30454e }));
  minuteHand.position.z = 0.024;
  clockGroup.add(minuteHand);
  state.wallClockHour = hourHand;
  state.wallClockMinute = minuteHand;
  updateWallClock();
  group.add(clockGroup);

  // 奥のデスク列（左右）: 天板+前面パネル+モニター+チェア
  const officeDeskSpots = [
    { x: -2.1, z: -2.35, monitorTurn: 0.2 },
    { x: -3.5, z: -2.35, monitorTurn: -0.15 },
    { x: 2.4, z: -2.35, monitorTurn: -0.2 },
    { x: 3.8, z: -2.35, monitorTurn: 0.12 },
    { x: -3.9, z: -1.0, monitorTurn: 0.3 },
    { x: 3.3, z: -1.0, monitorTurn: -0.3 },
  ];
  officeDeskSpots.forEach((spot) => group.add(createOfficeDeskCluster(spot)));

  return group;
}

function createOfficeDeskCluster({ x, z, monitorTurn }) {
  const group = new THREE.Group();
  const deskMaterial = new THREE.MeshStandardMaterial({ color: 0xf1f5f6, roughness: 0.6 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3f48, roughness: 0.5, metalness: 0.2 });
  const chairMaterial = new THREE.MeshStandardMaterial({ color: 0x4a6fa5, roughness: 0.7 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x8a979c, roughness: 0.5, metalness: 0.4 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.045, 0.55), deskMaterial);
  top.position.set(x, 0.72, z);
  group.add(top);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 0.04), deskMaterial);
  panel.position.set(x, 0.38, z + 0.25);
  group.add(panel);

  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.27, 0.025), darkMaterial);
  monitor.position.set(x, 0.93, z - 0.05);
  monitor.rotation.y = monitorTurn;
  group.add(monitor);
  const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.04), darkMaterial);
  monitorStand.position.set(x, 0.79, z - 0.05);
  group.add(monitorStand);

  // 書類・バインダー
  const binder = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x7fb0c6, roughness: 0.7 }),
  );
  binder.position.set(x + 0.42, 0.84, z - 0.08);
  group.add(binder);
  const binder2 = binder.clone();
  binder2.material = new THREE.MeshStandardMaterial({ color: 0xc6a37f, roughness: 0.7 });
  binder2.position.x = x + 0.48;
  group.add(binder2);

  // オフィスチェア（青）
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.4), chairMaterial);
  seat.position.set(x + 0.1, 0.45, z + 0.62);
  seat.rotation.y = monitorTurn * 0.8;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.06), chairMaterial);
  back.position.set(x + 0.1 - Math.sin(monitorTurn * 0.8) * 0.2, 0.75, z + 0.62 + Math.cos(monitorTurn * 0.8) * 0.2);
  back.rotation.y = monitorTurn * 0.8;
  group.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), legMaterial);
  pole.position.set(x + 0.1, 0.28, z + 0.62);
  group.add(pole);
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), legMaterial);
  chairBase.position.set(x + 0.1, 0.12, z + 0.62);
  group.add(chairBase);

  return group;
}

function createLobbyDetails() {
  const group = new THREE.Group();

  // BSTサインとお知らせボードは奥の壁に掛ける
  const sign = createWallSign();
  sign.position.set(-1.15, 2.5, -3.0);
  sign.rotation.y = 0;
  group.add(sign);

  const board = createInfoBoard();
  board.position.set(1.3, 0.99, -2.08); // 内部座標(-2.18,0.96,-0.92)を壁位置へ平行移動
  group.add(board);

  group.add(createPlant());

  // 右奥にも観葉植物を置いて左右のバランスを取る
  const plantRight = createPlant();
  plantRight.position.set(6.6, 0, -3.1); // 内部座標(-2.3,*,0.42)を(4.3,*,-2.68)へ平行移動
  group.add(plantRight);

  return group;
}

function createWallSign() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#0b4550");
  gradient.addColorStop(1, "#128184");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, 184, canvas.width, 8);
  ctx.fillStyle = "#e8fbfd";
  ctx.font = "800 82px sans-serif";
  ctx.fillText("BST", 52, 112);
  ctx.font = "700 34px sans-serif";
  ctx.fillText("Business System Tsushin", 54, 164);
  ctx.font = "600 28px sans-serif";
  ctx.fillStyle = "#9de8ea";
  ctx.fillText("Visitor Reception", 54, 214);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.62, 0.54),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  sign.position.set(-1.6, 1.52, -1.18);
  sign.rotation.y = 0.02;
  return sign;
}

function createInfoBoard() {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.64, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x305763, roughness: 0.65, metalness: 0.05 }),
  );
  frame.position.set(-2.18, 0.96, -0.92);
  group.add(frame);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.54, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xf2fbfc, roughness: 0.75 }),
  );
  board.position.set(-2.18, 0.96, -0.895);
  group.add(board);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x12a5a8 });
  [-0.16, 0, 0.16].forEach((offset, index) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(index === 0 ? 0.42 : 0.5, 0.026, 0.014), lineMaterial);
    line.position.set(-2.18, 0.96 + offset, -0.882);
    group.add(line);
  });

  const title = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.04, 0.014),
    new THREE.MeshBasicMaterial({ color: 0x28414c }),
  );
  title.position.set(-2.18, 1.2, -0.882);
  group.add(title);
  return group;
}

function createPlant() {
  const group = new THREE.Group();
  const potMaterial = new THREE.MeshStandardMaterial({ color: 0x3b6f78, roughness: 0.68, metalness: 0.03 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2f9b7c, roughness: 0.72, metalness: 0.02 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x6d5a42, roughness: 0.75 });

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.24, 28), potMaterial);
  pot.position.set(-2.3, 0.12, 0.42);
  group.add(pot);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.48, 12), stemMaterial);
  stem.position.set(-2.3, 0.44, 0.42);
  group.add(stem);

  const leafOffsets = [
    [-0.09, 0.62, 0.02, 0.5],
    [0.1, 0.66, -0.01, -0.45],
    [-0.02, 0.78, 0.04, 0.1],
    [0.03, 0.56, -0.06, -0.2],
  ];
  leafOffsets.forEach(([x, y, z, rot]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), leafMaterial);
    leaf.scale.set(0.55, 1.15, 0.18);
    leaf.position.set(-2.3 + x, y, 0.42 + z);
    leaf.rotation.set(0.25, rot, 0.5 + rot);
    group.add(leaf);
  });

  return group;
}

function normalizeModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.62 / Math.max(size.y, 0.01);
  model.scale.setScalar(scale);
  model.position.x -= center.x * scale;
  model.position.z -= center.z * scale;
  model.position.y -= box.min.y * scale;
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
  state.pelvis = byName.Pelvis;
  state.leftClavicle = byName.L_Clavicle;
  state.rightClavicle = byName.R_Clavicle;
  state.leftUpperArm = byName.L_Upperarm;
  state.rightUpperArm = byName.R_Upperarm;
  state.leftForearm = byName.L_Forearm;
  state.rightForearm = byName.R_Forearm;
  state.leftHand = byName.L_Hand;
  state.rightHand = byName.R_Hand;
  state.leftThigh = byName.L_Thigh;
  state.rightThigh = byName.R_Thigh;
  state.leftCalf = byName.L_Calf;
  state.rightCalf = byName.R_Calf;
  state.leftFoot = byName.L_Foot;
  state.rightFoot = byName.R_Foot;
  state.leftToe = byName.L_ToeBase;
  state.rightToe = byName.R_ToeBase;
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

  const saturationUniform = { value: EXPRESSION.modelSaturation / 100 };
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

// ============================================================
// 顔パーツ（縦型版と同じ CanvasTexture 方式）
// ============================================================

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

function createFaceLayer() {
  const anchor = state.head;
  if (!anchor) return;

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
    side: THREE.FrontSide,
  });

  const layer = new THREE.Mesh(new THREE.PlaneGeometry(0.118, 0.122), material);
  layer.name = "TsunaguExpressionParts";
  layer.position.set(
    FACE_LAYER_BASE.x + EXPRESSION.layerX * 0.00055,
    FACE_LAYER_BASE.y + EXPRESSION.layerY * 0.00055,
    FACE_LAYER_BASE.z,
  );
  layer.rotation.y = Math.PI;
  layer.renderOrder = 50;

  state.faceCanvas = canvas;
  state.faceContext = context;
  state.faceTexture = texture;
  state.faceLayer = layer;
  anchor.add(layer);
  drawFaceTexture(false, "open", 0);
}

function drawFaceTexture(speaking, blinkFrame, elapsed) {
  if (!state.faceContext || !state.faceTexture) return;
  const mouthFrame = speaking ? Math.floor(elapsed * 12) % 3 : 0;
  const frameKey = `${state.faceAssetsReady}-${speaking}-${blinkFrame}-${mouthFrame}`;
  if (frameKey === state.faceFrame) return;
  state.faceFrame = frameKey;

  const ctx = state.faceContext;
  ctx.clearRect(0, 0, 512, 512);
  if (!state.faceAssetsReady) return;

  const isHalfBlink = blinkFrame === "half";
  const isClosedBlink = blinkFrame === "closed";
  const eyeBaseY = isClosedBlink ? 185 : isHalfBlink ? 170 : 158;
  const eyeBaseHeight = isClosedBlink ? 32 : isHalfBlink ? 50 : 70;
  const eyeScale = EXPRESSION.eyeScale / 100;
  const eyeWidth = 86 * eyeScale;
  const eyeHeight = eyeBaseHeight * eyeScale;
  const eyeY = eyeBaseY + EXPRESSION.eyeY - (eyeHeight - eyeBaseHeight) / 2;
  const leftEyeX = 150 + EXPRESSION.eyeX - EXPRESSION.eyeGap / 2 - (eyeWidth - 86) / 2;
  const rightEyeX = 276 + EXPRESSION.eyeX + EXPRESSION.eyeGap / 2 - (eyeWidth - 86) / 2;

  drawImageContain(ctx, getEyeAsset("left", blinkFrame), leftEyeX, eyeY, eyeWidth, eyeHeight);
  drawImageContain(ctx, getEyeAsset("right", blinkFrame), rightEyeX, eyeY, eyeWidth, eyeHeight);

  const mouth =
    speaking && mouthFrame === 1
      ? state.faceAssets.mouthWide
      : speaking
        ? state.faceAssets.mouthHalf
        : state.faceAssets.mouthNeutral;
  const mouthBaseY = speaking ? 298 : 313;
  const mouthBaseHeight = speaking ? 62 : 30;
  const mouthScale = EXPRESSION.mouthScale / 100;
  const mouthWidth = 64 * mouthScale;
  const mouthHeight = mouthBaseHeight * mouthScale;
  drawImageContain(
    ctx,
    mouth,
    224 + EXPRESSION.mouthX - (mouthWidth - 64) / 2,
    mouthBaseY + EXPRESSION.mouthY - (mouthHeight - mouthBaseHeight) / 2,
    mouthWidth,
    mouthHeight,
  );

  state.faceTexture.needsUpdate = true;
}

function drawImageContain(ctx, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function getEyeAsset(side, blinkFrame) {
  const prefix = side === "left" ? "eyeLeft" : "eyeRight";
  if (blinkFrame === "closed") return state.faceAssets[`${prefix}Closed`] || state.faceAssets[`${prefix}Half`];
  if (blinkFrame === "half") return state.faceAssets[`${prefix}Half`] || state.faceAssets[`${prefix}Open`];
  return state.faceAssets[`${prefix}Open`];
}

function getBlinkFrame(now = Date.now()) {
  if (now >= state.blinkUntil) return "open";
  const progress = Math.min(1, Math.max(0, (now - state.blinkStartedAt) / state.blinkDuration));
  if (progress < 0.24) return "half";
  if (progress < 0.62) return "closed";
  if (progress < 0.88) return "half";
  return "open";
}

function setupBlinking() {
  const blink = () => {
    state.blinkStartedAt = Date.now();
    state.blinkUntil = state.blinkStartedAt + state.blinkDuration;
    window.setTimeout(blink, 1800 + Math.random() * 2200);
  };
  window.setTimeout(blink, 1400);
}

// ============================================================
// GLB内蔵アニメーション制御
// ============================================================

function initAnimations(model, animations) {
  state.clips = prepareAnimationClips(animations || []);
  state.hasAnimations = state.clips.length > 0;
  if (!state.hasAnimations) return;
  state.mixer = new THREE.AnimationMixer(model);
  state.mixer.addEventListener("finished", () => {
    clearFlourishTimer();
    state.flourishActive = false;
    updateAnimationState(Date.now(), true);
  });
  updateAnimationState(Date.now(), true);
}

function prepareAnimationClips(animations) {
  const inPlaceRoles = [ANIM_ROLES.walk, ANIM_ROLES.bow];
  return animations.map((clip, index) => {
    if (!inPlaceRoles.includes(index)) return clip;
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

function playClipByRole(role, { loop = true, fade = 0.45, timeScale = 1 } = {}) {
  if (!state.mixer) return null;
  const clip = clipForRole(role);
  if (!clip) return null;
  const action = state.mixer.clipAction(clip);
  if (state.currentAction === action && state.currentRole === role && loop) return action;
  action.reset();
  action.enabled = true;
  action.timeScale = timeScale;
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

// ふるまいに合わせて基本アニメーションを切り替える
function updateAnimationState(now, force = false) {
  if (!state.hasAnimations || !state.mixer) return;
  if (state.walk) {
    if (state.currentRole !== "walk") {
      state.flourishActive = false;
      playClipByRole("walk", { fade: 0.2, timeScale: 0.95 });
    }
    return;
  }
  if (state.flourishActive && !force) return;
  const desired = "standA";
  if (force || state.currentRole !== desired) {
    playClipByRole(desired, { fade: state.currentRole === "walk" ? 0.35 : 0.5 });
  }
}

// ランダムに一度だけ再生する動き（終わったら基本動作へ戻る）
function playFlourish(role) {
  if (!state.hasAnimations || state.walk) return 0;
  if (role !== "bow") return 0;
  const action = playClipByRole(role, { loop: false, fade: 0.4 });
  if (!action) return 0;
  const durationMs = oneShotDurationMs(action);
  state.flourishActive = true;
  clearFlourishTimer();
  state.flourishTimer = window.setTimeout(() => {
    state.flourishActive = false;
    updateAnimationState(Date.now(), true);
  }, durationMs);
  return durationMs;
}

function oneShotDurationMs(action) {
  const seconds = action.getClip().duration / Math.max(action.timeScale || 1, 0.1);
  return Math.min(seconds, 4.5) * 1000 + 650;
}

function maybePlayRandomFlourish(now) {
  return;
}

function clearFlourishTimer() {
  if (!state.flourishTimer) return;
  window.clearTimeout(state.flourishTimer);
  state.flourishTimer = null;
}

function clearReturnTimer() {
  if (!state.returnTimer) return;
  window.clearTimeout(state.returnTimer);
  state.returnTimer = null;
  state.returnPending = false;
}

// ============================================================
// キャラクターの動き（仕事・歩き・接客）
// ============================================================

function animateCharacter(elapsed) {
  if (!state.model || !state.characterRoot) return;
  const now = Date.now();
  const speaking = isSpeaking(now);
  const blinkFrame = getBlinkFrame(now);
  const root = state.characterRoot;

  let bob = Math.sin(elapsed * 1.6) * 0.01;
  let swayX = 0;
  let walking = false;
  let stepPhase = 0;

  if (state.walk) {
    const walk = state.walk;
    const t = Math.min(1, (now - walk.startedAt) / walk.duration);
    const distance = walk.total * t;
    const sample = sampleWalkPath(walk, distance);
    state.position.x = sample.x;
    state.position.z = sample.z;
    if (sample.heading !== null) state.headingTarget = sample.heading;
    walking = true;
    // 歩幅と同期した上下動（歩いた距離から歩数の位相を作る）
    stepPhase = distance * Math.PI * 3.1;
    bob = Math.abs(Math.sin(stepPhase)) * 0.024;

    if (t >= 1) {
      state.walk = null;
      const onArrive = walk.onArrive;
      if (onArrive) onArrive();
    }
  } else {
    // 立っている間はゆっくり左右へ重心移動して棒立ちを避ける
    swayX = Math.sin(elapsed * 0.42) * 0.012;
  }

  if (state.hasAnimations) {
    // 内蔵アニメーション使用時は、上下動・重心移動もアニメーション任せにする
    bob = 0;
    swayX = 0;
  }

  root.position.set(state.position.x + swayX, bob, state.position.z);
  state.heading = lerpAngle(state.heading, state.headingTarget, walking ? 0.14 : 0.08);
  root.rotation.y = state.heading;
  updateFaceLayerVisibility();
  updateAnimationState(now);

  if (state.hasAnimations) {
    // ボーンの手続き制御はスキップし、顔パーツと口パクだけ更新する
    drawFaceTexture(speaking, blinkFrame, elapsed);
    assistantMood.classList.toggle("is-speaking", speaking);
    return;
  }

  const working = state.behavior === "working" && !walking;
  const shift = Math.sin(elapsed * 0.42);

  if (working) {
    // モニターを見ながらタイピングし、時々手を止めて書類へ視線を移す
    const cycle = (Math.sin(elapsed * 0.21) + 1) / 2;
    const typing = smoothstep(0.32, 0.55, cycle);
    const pausing = 1 - typing;
    const typeL = Math.sin(elapsed * 6.8) * 0.07 * typing;
    const typeR = Math.sin(elapsed * 6.8 + Math.PI) * 0.07 * typing;

    setBoneRotation(state.head, {
      x: 0.13 + pausing * 0.05 + Math.sin(elapsed * 1.3) * 0.012,
      y: -0.2 * typing + 0.16 * pausing,
      z: Math.sin(elapsed * 0.8) * 0.01,
    });
    setBoneRotation(state.neck, { x: 0.06, y: -0.07 * typing + 0.05 * pausing, z: 0 });
    setBoneRotation(state.spine, {
      x: 0.06 + Math.sin(elapsed * 1.5) * 0.008,
      y: -0.05 * typing + 0.03 * pausing,
      z: shift * 0.012,
    });
    setBoneRotation(state.leftUpperArm, { x: 0.22 + pausing * 0.04, y: 0, z: 0 });
    setBoneRotation(state.rightUpperArm, { x: 0.22 + pausing * 0.1, y: 0, z: 0 });
    setBoneRotation(state.leftForearm, { x: 0.55 + typeL - pausing * 0.08, y: 0, z: 0 });
    setBoneRotation(state.rightForearm, { x: 0.55 + typeR + pausing * 0.08, y: 0, z: 0 });
    setBoneRotation(state.leftClavicle, { x: 0.03, y: -0.02 * typing, z: 0.02 });
    setBoneRotation(state.rightClavicle, { x: 0.03, y: -0.02 * typing, z: -0.02 });
    setBoneRotation(state.leftHand, { x: 0.12 + typeL * 0.45, y: 0.04, z: 0.02 });
    setBoneRotation(state.rightHand, { x: 0.12 + typeR * 0.45, y: -0.04, z: -0.02 });
    applyStandingLowerBody(shift);
  } else if (walking) {
    applyWalkingPose(stepPhase);
  } else if (speaking) {
    // 接客中の発話: 軽い身振りを付ける
    const gesture = Math.sin(elapsed * 4.6) * 0.09;
    setBoneRotation(state.head, {
      x: 0.02 + Math.sin(elapsed * 1.4) * 0.012,
      y: Math.sin(elapsed * 0.9) * 0.02,
      z: shift * 0.014,
    });
    setBoneRotation(state.neck, { x: 0.01, y: 0, z: shift * 0.01 });
    setBoneRotation(state.spine, { x: Math.sin(elapsed * 1.6) * 0.012, y: shift * 0.02, z: -shift * 0.016 });
    setBoneRotation(state.leftUpperArm, { x: 0.14 + gesture * 0.35, y: 0, z: 0.05 });
    setBoneRotation(state.rightUpperArm, { x: 0.14 - gesture * 0.35, y: 0, z: -0.05 });
    setBoneRotation(state.leftForearm, { x: 0.4 + gesture, y: 0, z: 0 });
    setBoneRotation(state.rightForearm, { x: 0.4 - gesture, y: 0, z: 0 });
    setBoneRotation(state.leftClavicle, { x: 0.02, y: gesture * 0.08, z: 0.03 });
    setBoneRotation(state.rightClavicle, { x: 0.02, y: -gesture * 0.08, z: -0.03 });
    setBoneRotation(state.leftHand, { x: 0.06 + gesture * 0.5, y: 0.03, z: 0.04 });
    setBoneRotation(state.rightHand, { x: 0.06 - gesture * 0.5, y: -0.03, z: -0.04 });
    applyStandingLowerBody(shift);
  } else {
    // 待機・接客待ち: 重心移動+ゆっくり視線を動かす+腕は軽く曲げて自然に
    const gaze = Math.sin(elapsed * 0.27);
    setBoneRotation(state.head, {
      x: 0.01 + Math.sin(elapsed * 1.4) * 0.012,
      y: gaze * 0.07,
      z: shift * 0.02,
    });
    setBoneRotation(state.neck, { x: 0.01, y: gaze * 0.02, z: shift * 0.012 });
    setBoneRotation(state.spine, { x: Math.sin(elapsed * 1.6) * 0.012, y: shift * 0.03, z: -shift * 0.02 });
    setBoneRotation(state.leftUpperArm, { x: 0.04, y: 0, z: 0.03 + shift * 0.012 });
    setBoneRotation(state.rightUpperArm, { x: 0.04, y: 0, z: -0.03 + shift * 0.012 });
    setBoneRotation(state.leftForearm, { x: 0.1 + Math.sin(elapsed * 1.1) * 0.02, y: 0, z: 0 });
    setBoneRotation(state.rightForearm, { x: 0.1 + Math.sin(elapsed * 1.1 + 1) * 0.02, y: 0, z: 0 });
    setBoneRotation(state.leftClavicle, { x: 0.01, y: 0, z: 0.02 + shift * 0.008 });
    setBoneRotation(state.rightClavicle, { x: 0.01, y: 0, z: -0.02 + shift * 0.008 });
    setBoneRotation(state.leftHand, { x: 0.02, y: 0.02, z: Math.sin(elapsed * 0.8) * 0.015 });
    setBoneRotation(state.rightHand, { x: 0.02, y: -0.02, z: Math.sin(elapsed * 0.8 + 1) * 0.015 });
    applyStandingLowerBody(shift);
  }

  drawFaceTexture(speaking, blinkFrame, elapsed);
  assistantMood.classList.toggle("is-speaking", speaking);
}

function applyWalkingPose(phase) {
  const swing = Math.sin(phase);
  const counterSwing = -swing;
  const weightShift = Math.sin(phase) * 0.055;
  const shoulderLift = Math.cos(phase) * 0.025;
  const headBob = Math.abs(Math.sin(phase)) * 0.012;

  setBoneRotation(state.head, { x: 0.015 + headBob, y: 0, z: swing * 0.012 });
  setBoneRotation(state.neck, { x: 0.02, y: 0, z: swing * 0.008 });
  setBoneRotation(state.spine, { x: 0.055, y: swing * 0.04, z: weightShift * 0.42 });
  setBoneRotation(state.pelvis, { x: -0.025, y: -swing * 0.028, z: -weightShift * 0.34 });

  setArmWalkPose("left", state.leftClavicle, state.leftUpperArm, state.leftForearm, state.leftHand, counterSwing, shoulderLift);
  setArmWalkPose("right", state.rightClavicle, state.rightUpperArm, state.rightForearm, state.rightHand, swing, -shoulderLift);
  setLegWalkPose("left", state.leftThigh, state.leftCalf, state.leftFoot, state.leftToe, phase, -weightShift);
  setLegWalkPose("right", state.rightThigh, state.rightCalf, state.rightFoot, state.rightToe, phase + Math.PI, weightShift);
}

function setArmWalkPose(side, clavicle, upperArm, forearm, hand, swing, lift) {
  const forward = Math.max(0, swing);
  const backward = Math.max(0, -swing);
  const sideSign = side === "left" ? 1 : -1;
  setBoneRotation(clavicle, {
    x: 0.02 + lift * 0.3,
    y: swing * 0.025,
    z: sideSign * (0.035 + lift * 0.2),
  });
  setBoneRotation(upperArm, {
    x: swing * 0.3 - backward * 0.04,
    y: sideSign * 0.025,
    z: sideSign * (0.025 + forward * 0.015),
  });
  setBoneRotation(forearm, {
    x: 0.2 + forward * 0.16 + backward * 0.06,
    y: 0,
    z: sideSign * Math.sin(swing) * 0.025,
  });
  setBoneRotation(hand, {
    x: 0.04 + forward * 0.08,
    y: sideSign * 0.035,
    z: sideSign * (0.03 + swing * 0.025),
  });
}

function setLegWalkPose(side, thigh, calf, foot, toe, phase, weightShift) {
  const swing = Math.sin(phase);
  const forward = Math.max(0, swing);
  const backward = Math.max(0, -swing);
  const lift = Math.max(0, Math.cos(phase));
  const toePush = Math.max(0, -Math.cos(phase));
  const sideSign = side === "left" ? 1 : -1;
  setBoneRotation(thigh, {
    x: swing * 0.3 - backward * 0.04,
    y: sideSign * 0.018,
    z: sideSign * weightShift * 0.22,
  });
  setBoneRotation(calf, {
    x: 0.08 + forward * 0.25 + lift * 0.22,
    y: 0,
    z: -sideSign * weightShift * 0.08,
  });
  setBoneRotation(foot, {
    x: -forward * 0.13 + backward * 0.08 + lift * 0.07,
    y: 0,
    z: sideSign * weightShift * 0.08,
  });
  setBoneRotation(toe, {
    x: toePush * 0.15,
    y: 0,
    z: 0,
  });
}

function applyStandingLowerBody(shift) {
  setBoneRotation(state.pelvis, { x: 0, y: 0, z: -shift * 0.018 });
  setBoneRotation(state.leftThigh, { x: 0.015, y: 0, z: shift * 0.01 });
  setBoneRotation(state.rightThigh, { x: 0.015, y: 0, z: shift * 0.01 });
  setBoneRotation(state.leftCalf, { x: 0.035, y: 0, z: 0 });
  setBoneRotation(state.rightCalf, { x: 0.035, y: 0, z: 0 });
  setBoneRotation(state.leftFoot, { x: -0.015, y: 0, z: 0 });
  setBoneRotation(state.rightFoot, { x: -0.015, y: 0, z: 0 });
  setBoneRotation(state.leftToe, { x: 0, y: 0, z: 0 });
  setBoneRotation(state.rightToe, { x: 0, y: 0, z: 0 });
}

// 顔パーツは常に最前面へ描く方式のため、カメラに背を向けている間は
// 髪を透けて顔が見えてしまう。実際の顔平面の向きに応じてフェードアウトさせる。
function updateFaceLayerVisibility() {
  if (!state.faceLayer || !state.camera) return;
  const facePosition = state.faceLayer.getWorldPosition(new THREE.Vector3());
  const faceNormal = state.faceLayer.getWorldDirection(new THREE.Vector3());
  const toCamera = new THREE.Vector3().subVectors(state.camera.position, facePosition);
  toCamera.normalize();
  const facing = faceNormal.dot(toCamera); // 1=顔の表側, -1=顔の裏側
  if (state.behavior === "returning") {
    state.faceLayer.material.opacity = 0;
    state.faceLayer.visible = false;
    return;
  }
  let opacity = smoothstep(0.08, 0.45, facing);
  if (state.currentRole === "bow") {
    // お辞儀中でも、正面に戻っている間は顔パーツを残す。下を向いた瞬間だけ消す。
    opacity *= smoothstep(-0.35, -0.08, faceNormal.y);
  }
  state.faceLayer.material.opacity = opacity;
  state.faceLayer.visible = opacity > 0.02;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function setBoneRotation(bone, offset) {
  if (!bone) return;
  const base = state.baseRotations.get(bone.name);
  if (!base) return;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(offset.x, offset.y, offset.z, "XYZ"));
  bone.quaternion.copy(base).multiply(q);
}

function lerpAngle(current, target, factor) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * factor;
}

function startWalk(points, onArrive, finalHeading = 0) {
  const path = [{ x: state.position.x, z: state.position.z }, ...points];
  const segments = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const dx = path[i + 1].x - path[i].x;
    const dz = path[i + 1].z - path[i].z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    segments.push({ from: path[i], to: path[i + 1], length });
    total += length;
  }
  if (!segments.length || total < 0.02) {
    state.headingTarget = finalHeading;
    if (onArrive) onArrive();
    return;
  }
  state.walk = {
    segments,
    total,
    duration: Math.max(600, (total / WALK_SPEED) * 1000),
    startedAt: Date.now(),
    onArrive: () => {
      state.headingTarget = finalHeading;
      if (onArrive) onArrive();
    },
  };
}

function sampleWalkPath(walk, distance) {
  let remaining = distance;
  for (const segment of walk.segments) {
    if (remaining <= segment.length) {
      const t = remaining / segment.length;
      const x = segment.from.x + (segment.to.x - segment.from.x) * t;
      const z = segment.from.z + (segment.to.z - segment.from.z) * t;
      const heading = Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z);
      return { x, z, heading };
    }
    remaining -= segment.length;
  }
  const last = walk.segments[walk.segments.length - 1];
  return { x: last.to.x, z: last.to.z, heading: null };
}

function walkPointsToGreet() {
  const points = [];
  if (state.position.x > WALK_CORRIDOR_X + 0.2) {
    points.push({ x: WALK_CORRIDOR_X, z: Math.min(state.position.z, -0.6) });
    points.push({ x: WALK_CORRIDOR_X, z: 0.45 });
  }
  points.push({ x: GREET_POS.x, z: GREET_POS.z });
  return points;
}

function walkPointsToDesk() {
  return [
    { x: WALK_CORRIDOR_X, z: 0.45 },
    { x: WALK_CORRIDOR_X, z: WORK_POS.z },
    { x: WORK_POS.x, z: WORK_POS.z },
  ];
}

// ============================================================
// ふるまいの状態機械
// ============================================================

function setBehavior(behavior) {
  // デバッグ用の遷移ログ（開発者ツールで window.__behaviorLog を参照）
  const log = (window.__behaviorLog ||= []);
  log.push([Date.now(), behavior, state.position.x.toFixed(2), state.position.z.toFixed(2)]);
  if (log.length > 200) log.shift();
  state.behavior = behavior;
  stateChip.textContent = STATE_LABELS[behavior] || behavior;
  stateChip.dataset.state = behavior;
}

function updateBehavior() {
  const now = Date.now();
  const visitorPresent = isVisitorPresent(now);
  maybePlayRandomFlourish(now);

  if (visitorPresent && (state.behavior === "working" || state.behavior === "returning")) {
    const confirmed = now - state.faceFirstSeenAt >= FACE_CONFIRM_MS || state.testVisitorUntil > now;
    if (confirmed) beginApproach();
    return;
  }

  if (state.behavior === "attending") {
    if (state.returnPending) {
      if (visitorPresent) {
        clearReturnTimer();
        state.lastAttendTalkAt = now;
      }
      return;
    }
    if (!visitorPresent && now - state.faceLastSeenAt > FACE_LOST_MS && state.testVisitorUntil < now) {
      beginReturn();
      return;
    }
    // 到着時に判別できなかった場合、接客中も数秒おきに照合を試みる
    if (
      visitorPresent &&
      !state.visitorPerson &&
      (state.demoVisitorPerson || state.faceDb.length || state.clothingDb.length) &&
      !state.identifyBusy &&
      now - state.lastIdentifyAt > 5000
    ) {
      state.lastIdentifyAt = now;
      identifyVisitor(3).then((person) => {
        if (!person || state.behavior !== "attending") return;
        rememberRecognizedVisitor(person);
      });
    }
    if (flushPendingVisitorGreeting(now)) return;
    if (visitorPresent && !isSpeaking(now) && now - state.lastAttendTalkAt > 30000) {
      state.lastAttendTalkAt = now;
      speak(pickRandomLine(attendIdleTalk));
    }
    return;
  }

  if (state.behavior === "working" && !isSpeaking(now) && now - state.lastWorkTalkAt > 90000) {
    state.lastWorkTalkAt = now;
    speak(pickRandomLine(workingTalk), { volume: 0.6 });
    scheduleBubbleHide(5000);
  }

  if (!visitorPresent && state.testVisitorUntil > 0 && state.testVisitorUntil <= now && !state.faceVisible) {
    state.testVisitorUntil = 0;
    state.demoVisitorPerson = null;
    visitorStatus.textContent = "来客なし";
  }
}

function isVisitorPresent(now = Date.now()) {
  return state.faceVisible || state.testVisitorUntil > now;
}

function beginApproach() {
  if (state.behavior === "approaching" || state.behavior === "attending") return;
  clearReturnTimer();
  setBehavior("approaching");
  hideBubbleTimer();
  state.visitorPerson = null;
  state.pendingVisitorGreeting = null;
  state.announcedVisitorKey = "";
  // 歩いている間に並行してデモ人物/服装IDの判定を進める
  const identifyPromise = identifyVisitor();
  identifyPromise.then((person) => {
    if (!person || state.behavior !== "attending" || state.returnPending) return;
    rememberRecognizedVisitor(person);
  });
  speak("あ、いらっしゃいませ。ただいま参りますね。");
  startWalk(
    walkPointsToGreet(),
    async () => {
      setBehavior("attending");
      state.lastAttendTalkAt = Date.now();
      const person = await withTimeout(identifyPromise, 2500);
      if (person) {
        state.visitorPerson = person;
        markVisitorGreetingAnnounced(person);
      }
      updateVisitorLabel();
      speak(buildArrivalGreeting(person));
      playFlourish("bow");
    },
    0,
  );
}

function beginReturn() {
  if (state.behavior !== "attending" || state.returnPending) return;
  state.returnPending = true;
  state.visitorPerson = null;
  state.demoVisitorPerson = null;
  state.pendingVisitorGreeting = null;
  state.announcedVisitorKey = "";
  hideBubbleTimer();
  speak("ありがとうございました。それでは、作業に戻りますね。");
  const bowDurationMs = playFlourish("bow");
  state.returnTimer = window.setTimeout(() => {
    state.returnTimer = null;
    state.returnPending = false;
    setBehavior("returning");
    startWalk(
      walkPointsToDesk(),
      () => {
        setBehavior("working");
        state.lastWorkTalkAt = Date.now();
        if (!state.faceVisible && state.testVisitorUntil < Date.now()) visitorStatus.textContent = "来客なし";
        scheduleBubbleHide(2800);
      },
      0,
    );
  }, bowDurationMs + RETURN_AFTER_BOW_PAUSE_MS);
}

function buildArrivalGreeting(person) {
  const greetingWord = timeGreetingWord();
  if (person?.kind === "employee") {
    return `${person.name}さん、お帰りなさい。今日もお疲れ様でした。ご用件があれば、いつでもお声がけください。`;
  }
  if (person?.kind === "clothing") {
    return `いつもお疲れさまです。${person.name}の方ですね。お荷物の受け渡しでしたら、こちらで承ります。担当者をお呼びしますので、少々お待ちください。`;
  }
  if (person?.name) {
    return `${person.name}さん、${greetingWord}。いつもありがとうございます。ご用件があればお気軽にお声がけください。`;
  }
  return `${greetingWord}。有限会社ビジネスシステム通信へようこそ。受付AIのつなぐです。担当者をお呼びしますので、お名前とご用件をお聞かせください。`;
}

function rememberRecognizedVisitor(person) {
  if (!person?.name) return false;
  const normalized = {
    name: person.name,
    kind: person.kind || "face",
  };
  const key = visitorIdentityKey(normalized);
  if (state.announcedVisitorKey === key) {
    state.visitorPerson = normalized;
    updateVisitorLabel();
    return false;
  }
  if (state.visitorPerson?.name && visitorIdentityKey(state.visitorPerson) === key && state.pendingVisitorGreeting) {
    return false;
  }
  state.visitorPerson = normalized;
  updateVisitorLabel();
  queueVisitorGreeting(normalized);
  return true;
}

function queueVisitorGreeting(person) {
  const key = visitorIdentityKey(person);
  if (!key || state.announcedVisitorKey === key) return;
  state.pendingVisitorGreeting = {
    key,
    person,
    text: buildArrivalGreeting(person),
  };
  flushPendingVisitorGreeting();
}

function flushPendingVisitorGreeting(now = Date.now()) {
  const pending = state.pendingVisitorGreeting;
  if (!pending || state.behavior !== "attending" || state.returnPending || !isVisitorPresent(now)) return false;
  if (isSpeaking(now)) return false;
  state.pendingVisitorGreeting = null;
  state.announcedVisitorKey = pending.key;
  state.lastAttendTalkAt = now;
  speak(pending.text);
  return true;
}

function markVisitorGreetingAnnounced(person) {
  const key = visitorIdentityKey(person);
  if (!key) return;
  state.announcedVisitorKey = key;
  if (state.pendingVisitorGreeting?.key === key) state.pendingVisitorGreeting = null;
}

function visitorIdentityKey(person) {
  if (!person?.name) return "";
  return `${person.kind || "face"}:${person.name}`;
}

function timeGreetingWord() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "おはようございます";
  if (hour >= 11 && hour < 18) return "こんにちは";
  return "こんばんは";
}

// ============================================================
// 社員デモ（顔照合なし）
// ============================================================

function triggerVisitorDemo(person = null) {
  const now = Date.now();
  clearReturnTimer();
  state.demoVisitorPerson = person ? { ...person } : null;
  state.testVisitorUntil = now + TEST_VISITOR_MS;
  state.faceFirstSeenAt = now;
  state.faceLastSeenAt = now + TEST_VISITOR_MS;
  visitorStatus.textContent = person?.name ? `${personLabel(person)} デモ中` : "来客テスト中";
  if (demoStatus) {
    demoStatus.textContent = person?.name
      ? `${personLabel(person)}が来た想定で、名前入り挨拶を再生します。`
      : "通常の来客としてお出迎えします。";
  }
}

// ============================================================
// 服装識別（制服の色パターンで判別）
// ============================================================

function loadClothingDb() {
  try {
    const stored = window.localStorage.getItem(CLOTHING_DB_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) => entry && typeof entry.name === "string" && Array.isArray(entry.signatures),
    );
  } catch (error) {
    console.warn("Clothing DB could not be loaded", error);
    return [];
  }
}

function saveClothingDb() {
  try {
    window.localStorage.setItem(CLOTHING_DB_STORAGE_KEY, JSON.stringify(state.clothingDb));
  } catch (error) {
    console.warn("Clothing DB could not be saved", error);
  }
}

// 顔検出位置の下（胸〜お腹）を小さく切り出し、色の特徴ベクトルを作る
function computeClothingSignature() {
  const box = state.lastFaceBox;
  if (!box || Date.now() - state.lastFaceBoxAt > 1200) return null;
  if (!state.cameraStream || cameraPreview.readyState < 2 || !cameraPreview.videoWidth) return null;

  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;
  const faceWidth = box.width;
  const faceHeight = box.height;
  const centerX = box.originX + faceWidth / 2;
  const x0 = Math.max(0, centerX - faceWidth * 1.4);
  const x1 = Math.min(videoWidth, centerX + faceWidth * 1.4);
  const y0 = Math.min(videoHeight - 2, box.originY + faceHeight * 1.25);
  const y1 = Math.min(videoHeight, y0 + faceHeight * 2.2);
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;

  if (!state.clothingCanvas) state.clothingCanvas = document.createElement("canvas");
  const canvas = state.clothingCanvas;
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(cameraPreview, x0, y0, x1 - x0, y1 - y0, 0, 0, 24, 24);
  const pixels = ctx.getImageData(0, 0, 24, 24).data;
  return clothingSignatureFromPixels(pixels);
}

// 色相16分割のヒストグラム + 白/グレー/黒の割合（計19次元、L2正規化済み）
function clothingSignatureFromPixels(pixels) {
  const hueBins = new Array(16).fill(0);
  let whiteish = 0;
  let grayish = 0;
  let darkish = 0;
  let total = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const value = max;
    const saturation = max === 0 ? 0 : (max - min) / max;
    total += 1;

    if (saturation < 0.18) {
      // 無彩色（白シャツ・グレー・黒っぽい服）
      if (value > 0.75) whiteish += 1;
      else if (value < 0.3) darkish += 1;
      else grayish += 1;
      continue;
    }

    const delta = max - min;
    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    const bin = Math.floor(hue / 22.5) % 16;
    hueBins[bin] += saturation * value; // 鮮やかで明るい色ほど重視
  }

  if (!total) return null;
  const vector = [...hueBins, (whiteish / total) * 2, (grayish / total) * 2, (darkish / total) * 2];
  const norm = Math.hypot(...vector) || 1;
  return vector.map((component) => component / norm);
}

// しきい値に関係なく、いちばん似ている登録服装と類似度を返す
function findBestClothingMatch(signature) {
  let best = null;
  state.clothingDb.forEach((entry) => {
    entry.signatures.forEach((sample) => {
      const similarity = dotProduct(signature, sample);
      if (!best || similarity > best.similarity) best = { name: entry.name, similarity };
    });
  });
  return best;
}

function dotProduct(a, b) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += a[i] * b[i];
  return sum;
}

async function registerCurrentClothing() {
  const name = registerName.value.trim();
  if (!name) {
    setRegisterStatus("お名前（例: ヤマト）を入力してください");
    return;
  }
  if (!state.cameraStream) {
    setRegisterStatus("先にカメラを開始してください");
    return;
  }
  const signature = computeClothingSignature();
  if (!signature) {
    setRegisterStatus("服装を取り込めません。顔が写った状態で、胸からお腹までカメラに入るように立ってください");
    return;
  }
  let entry = state.clothingDb.find((item) => item.name === name);
  if (!entry) {
    entry = { name, signatures: [] };
    state.clothingDb.push(entry);
  }
  entry.signatures.push(signature);
  saveClothingDb();
  renderRegisteredList();
  setRegisterStatus(
    `服装「${name}」を登録しました（サンプル${entry.signatures.length}件）。立ち位置を変えて2〜3回登録すると精度が上がります`,
  );
}

// デモ人物または登録済み服装から来訪者を判別する。顔照合は行わない。
// ============================================================
// 顔識別（カメラで人物を判別して名前を呼ぶ）
// ============================================================

function loadFaceDb() {
  try {
    const stored = window.localStorage.getItem(FACE_DB_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (person) => person && typeof person.name === "string" && Array.isArray(person.descriptors),
    );
  } catch (error) {
    console.warn("Face DB could not be loaded", error);
    return [];
  }
}

function saveFaceDb() {
  try {
    window.localStorage.setItem(FACE_DB_STORAGE_KEY, JSON.stringify(state.faceDb));
  } catch (error) {
    console.warn("Face DB could not be saved", error);
  }
  recomputeFaceThreshold();
}

// 本人判定のしきい値を、登録者同士が混ざらない値へ自動調整する。
// 2人以上登録されている場合、登録者間の最小距離×0.85 まで厳しくする（下限0.35）。
function recomputeFaceThreshold() {
  let threshold = FACE_MATCH_THRESHOLD;
  for (let i = 0; i < state.faceDb.length; i += 1) {
    for (let j = i + 1; j < state.faceDb.length; j += 1) {
      state.faceDb[i].descriptors.forEach((sampleA) => {
        state.faceDb[j].descriptors.forEach((sampleB) => {
          threshold = Math.min(threshold, euclideanDistance(sampleA, sampleB) * FACE_INTER_RATIO);
        });
      });
    }
  }
  state.faceMatchThreshold = Math.max(FACE_MATCH_THRESHOLD_FLOOR, threshold);
  if (state.faceDb.length >= 2) {
    console.info(`[顔照合] 自動しきい値: ${state.faceMatchThreshold.toFixed(3)}（登録${state.faceDb.length}名）`);
  }
}

// 顔識別ライブラリ（face-api.js）と学習済みモデルをCDNから遅延読み込みする
function ensureFaceApi() {
  if (state.faceApi) return Promise.resolve(state.faceApi);
  if (state.faceApiFailed) return Promise.resolve(null);
  if (!state.faceApiPromise) {
    state.faceApiPromise = (async () => {
      const faceapi = await import(FACE_API_SCRIPT_URL);
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
      // 位置合わせは通常版モデルを使う（tiny版は特徴量の精度が落ちる）
      await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL);
      state.faceApi = faceapi;
      return faceapi;
    })().catch((error) => {
      console.warn("face-api failed to load", error);
      state.faceApiFailed = true;
      state.faceApiPromise = null;
      return null;
    });
  }
  return state.faceApiPromise;
}

async function computeFaceDescriptor() {
  const faceapi = await ensureFaceApi();
  if (!faceapi || !state.cameraStream) return null;
  if (cameraPreview.readyState < 2 || !cameraPreview.videoWidth) return null;
  if (state.descriptorBusy) return null;
  state.descriptorBusy = true;
  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 });
    // 顔まわりを切り出して拡大した画像で照合する。
    // 離れて立つと顔が小さすぎて特徴量の精度が落ち、人の区別がつかなくなるための対策。
    const crop = buildFaceCropCanvas();
    if (crop) {
      const detection = await faceapi
        .detectSingleFace(crop, options)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) return detection.descriptor;
    }
    // 切り出しが使えない時（顔位置が取れていない等）は全体画像で照合
    const detection = await faceapi
      .detectSingleFace(cameraPreview, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection?.descriptor || null;
  } finally {
    state.descriptorBusy = false;
  }
}

// MediaPipeの顔位置を使って顔まわりを切り出し、320px程度へ拡大したキャンバスを返す
function buildFaceCropCanvas() {
  const box = state.lastFaceBox;
  if (!box || Date.now() - state.lastFaceBoxAt > 1200) return null;
  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;
  const centerX = box.originX + box.width / 2;
  const centerY = box.originY + box.height / 2;
  const size = Math.max(box.width, box.height) * 2.2; // 顔の周囲に余白を持たせる
  const x0 = Math.max(0, centerX - size / 2);
  const y0 = Math.max(0, centerY - size / 2);
  const width = Math.min(size, videoWidth - x0);
  const height = Math.min(size, videoHeight - y0);
  if (width < 40 || height < 40) return null;

  if (!state.faceCropCanvas) state.faceCropCanvas = document.createElement("canvas");
  const canvas = state.faceCropCanvas;
  const targetWidth = 320;
  canvas.width = targetWidth;
  canvas.height = Math.round((height / width) * targetWidth);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(cameraPreview, x0, y0, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// 一定時間内で顔が取れるまで繰り返す（登録時の取りこぼし対策）
async function captureDescriptorWithRetry(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const descriptor = await computeFaceDescriptor();
    if (descriptor) return descriptor;
    await delay(250);
  }
  return null;
}

// しきい値に関係なく、いちばん近い登録者と距離を返す（各サンプル+平均顔の最小距離）
function findBestFaceMatch(descriptor) {
  const ranked = state.faceDb
    .map((person) => {
      let distance = Infinity;
      person.descriptors.forEach((sample) => {
        distance = Math.min(distance, euclideanDistance(descriptor, sample));
      });
      if (person.descriptors.length > 1) {
        distance = Math.min(distance, euclideanDistance(descriptor, faceCentroid(person)));
      }
      return { name: person.name, distance };
    })
    .sort((a, b) => a.distance - b.distance);
  if (!ranked.length) return null;
  const best = ranked[0];
  best.runnerUp = ranked[1] || null; // 2番目に近い登録者（混同チェック用）
  return best;
}

// しきい値内で、かつ2位と十分な差があるときだけ「本人」と確定する
function isFaceMatchAccepted(best) {
  if (!best || best.distance > state.faceMatchThreshold) return false;
  if (best.runnerUp && best.runnerUp.distance - best.distance < FACE_MATCH_MARGIN) return false;
  return true;
}

// 登録サンプルの平均（平均顔）。サンプルのブレに強くなる
function faceCentroid(person) {
  const length = person.descriptors[0].length;
  const centroid = new Array(length).fill(0);
  person.descriptors.forEach((sample) => {
    for (let i = 0; i < length; i += 1) centroid[i] += sample[i];
  });
  for (let i = 0; i < length; i += 1) centroid[i] /= person.descriptors.length;
  return centroid;
}

function euclideanDistance(a, b) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ワンクリックで3サンプルを自動撮影して登録する
async function registerCurrentFace() {
  const name = registerName.value.trim();
  if (!name) {
    setRegisterStatus("お名前を入力してください");
    return;
  }
  if (!state.cameraStream) {
    setRegisterStatus("先にカメラを開始してください");
    return;
  }
  registerFaceButton.disabled = true;
  registerClothingButton.disabled = true;
  try {
    setRegisterStatus("識別モデルを準備中…（初回は少し時間がかかります）");
    const faceapi = await ensureFaceApi();
    if (!faceapi) {
      setRegisterStatus("識別ライブラリを読み込めませんでした。ネット接続を確認してください");
      return;
    }
    const guides = ["正面を向いてください", "少しだけ右を向いてください", "少しだけ左を向いてください"];
    const captured = [];
    for (let i = 0; i < FACE_SAMPLE_COUNT; i += 1) {
      setRegisterStatus(`${guides[i] || guides[0]}…（${i + 1}/${FACE_SAMPLE_COUNT} 撮影中）`);
      const descriptor = await captureDescriptorWithRetry(2800);
      if (!descriptor) {
        setRegisterStatus("顔が見つかりません。カメラに近づいて、明るい場所で正面から写ってください");
        return;
      }
      captured.push([...descriptor]);
      await delay(700);
    }
    let entry = state.faceDb.find((person) => person.name === name);
    if (!entry) {
      entry = { name, descriptors: [] };
      state.faceDb.push(entry);
    }
    entry.descriptors.push(...captured);
    if (entry.descriptors.length > FACE_MAX_SAMPLES) {
      entry.descriptors = entry.descriptors.slice(-FACE_MAX_SAMPLES);
    }
    saveFaceDb();
    renderRegisteredList();
    setRegisterStatus(
      `${name}さんの顔を登録しました（サンプル${entry.descriptors.length}件）。下の照合表示で距離を確認できます`,
    );
  } catch (error) {
    console.warn("Face registration failed", error);
    setRegisterStatus("登録に失敗しました。もう一度お試しください");
  } finally {
    registerFaceButton.disabled = false;
    registerClothingButton.disabled = false;
  }
}

// ============================================================
// 来訪者の判別（顔 → 服装 → デモの順で判定）
// ============================================================

async function identifyVisitor(attempts = 6) {
  if (state.demoVisitorPerson) return { ...state.demoVisitorPerson };
  if ((!state.faceDb.length && !state.clothingDb.length) || !state.cameraStream) return null;
  if (state.identifyBusy) return null;
  state.identifyBusy = true;
  let lastFaceHit = null; // 2連続で同じ人と判定されたときだけ確定する
  try {
    for (let i = 0; i < attempts; i += 1) {
      // 顔識別を最優先（個人名で呼べる）
      if (state.faceDb.length) {
        const descriptor = await computeFaceDescriptor();
        if (descriptor) {
          const best = findBestFaceMatch(descriptor);
          if (best) {
            const runnerText = best.runnerUp
              ? `（2位: ${best.runnerUp.name} ${best.runnerUp.distance.toFixed(3)}）`
              : "";
            console.info(
              `[顔照合] 一番近い: ${best.name} 距離${best.distance.toFixed(3)}/${state.faceMatchThreshold.toFixed(2)}${runnerText}`,
            );
            if (isFaceMatchAccepted(best)) {
              if (lastFaceHit === best.name) return { name: best.name, kind: "face" };
              lastFaceHit = best.name;
            } else {
              lastFaceHit = null;
            }
          } else {
            lastFaceHit = null;
          }
        }
      }
      // 顔で分からなければ服装（制服）で判定
      if (state.clothingDb.length) {
        const signature = computeClothingSignature();
        if (signature) {
          const best = findBestClothingMatch(signature);
          if (best) {
            console.info(
              `[服装照合] 一番近い: ${best.name} 類似${best.similarity.toFixed(3)}（しきい値${CLOTHING_MATCH_THRESHOLD}）`,
            );
            if (best.similarity >= CLOTHING_MATCH_THRESHOLD) {
              return { name: best.name, kind: "clothing" };
            }
          }
        }
      }
      if (i < attempts - 1) await delay(500);
    }
    return null;
  } catch (error) {
    console.warn("Visitor identification failed", error);
    return null;
  } finally {
    state.identifyBusy = false;
  }
}

// 登録パネルを開いている間、服装類似度をリアルタイム表示する（調整用）
// 登録パネルを開いている間、照合結果をリアルタイム表示する（調整用）
function startMatchTestLoop() {
  stopMatchTestLoop();
  state.matchTestTimer = window.setInterval(async () => {
    if (!matchTest || employeeDemo.hidden) return;
    if (!state.cameraStream) {
      matchTest.textContent = "カメラ停止中のため照合テストできません";
      matchTest.classList.remove("is-match");
      return;
    }
    if (!state.faceDb.length && !state.clothingDb.length) {
      matchTest.textContent = "登録するとここに照合結果が表示されます";
      matchTest.classList.remove("is-match");
      return;
    }
    if (state.identifyBusy || state.descriptorBusy) return;

    const parts = [];
    let anyMatch = false;

    if (state.faceDb.length) {
      const descriptor = await computeFaceDescriptor();
      if (!descriptor) {
        parts.push("顔: 検出できません（近づく・明るくする）");
      } else {
        const best = findBestFaceMatch(descriptor);
        if (best) {
          const accepted = isFaceMatchAccepted(best);
          const ambiguous = best.distance <= state.faceMatchThreshold && !accepted;
          anyMatch = anyMatch || accepted;
          const runnerText = best.runnerUp ? `、2位: ${best.runnerUp.name} ${best.runnerUp.distance.toFixed(2)}` : "";
          parts.push(
            `顔: ${best.name}（距離 ${best.distance.toFixed(2)} / ${state.faceMatchThreshold.toFixed(2)}${runnerText}）→ ${accepted ? "本人" : ambiguous ? "紛らわしいため保留" : "別人"}`,
          );
        }
      }
    }

    if (state.clothingDb.length) {
      const signature = computeClothingSignature();
      if (!signature) {
        parts.push("服装: 取り込めません（胸まで写るように）");
      } else {
        const best = findBestClothingMatch(signature);
        if (best) {
          const ok = best.similarity >= CLOTHING_MATCH_THRESHOLD;
          anyMatch = anyMatch || ok;
          parts.push(
            `服装: ${best.name}（類似 ${best.similarity.toFixed(2)} / ${CLOTHING_MATCH_THRESHOLD}）→ ${ok ? "一致" : "不一致"}`,
          );
        }
      }
    }

    if (!parts.length) return;
    matchTest.textContent = parts.join(" ／ ");
    matchTest.classList.toggle("is-match", anyMatch);
  }, 1500);
}

function stopMatchTestLoop() {
  if (!state.matchTestTimer) return;
  window.clearInterval(state.matchTestTimer);
  state.matchTestTimer = null;
}

function renderRegisteredList() {
  registeredList.innerHTML = "";
  if (!state.faceDb.length && !state.clothingDb.length) {
    const item = document.createElement("li");
    item.className = "registered-empty";
    item.textContent = "登録された方はまだいません";
    registeredList.appendChild(item);
    return;
  }
  state.faceDb.forEach((person) => {
    registeredList.appendChild(
      createRegisteredItem(`顔: ${person.name}（サンプル${person.descriptors.length}件）`, () => {
        state.faceDb = state.faceDb.filter((entry) => entry !== person);
        saveFaceDb();
      }),
    );
  });
  state.clothingDb.forEach((entry) => {
    registeredList.appendChild(
      createRegisteredItem(`服装: ${entry.name}（サンプル${entry.signatures.length}件）`, () => {
        state.clothingDb = state.clothingDb.filter((item) => item !== entry);
        saveClothingDb();
      }),
    );
  });
}

function createRegisteredItem(labelText, onRemove) {
  const item = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = labelText;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "削除";
  remove.addEventListener("click", () => {
    onRemove();
    renderRegisteredList();
  });
  item.append(label, remove);
  return item;
}

function setRegisterStatus(text) {
  if (registerStatus) registerStatus.textContent = text;
}

function personLabel(person) {
  if (!person?.name) return "";
  return person.kind === "clothing" ? `${person.name}の方` : `${person.name}さん`;
}

function updateVisitorLabel() {
  if (state.visitorPerson?.name) {
    visitorStatus.textContent = `${personLabel(state.visitorPerson)}が見えています`;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, delay(ms).then(() => null)]).catch(() => null);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandomLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

// ============================================================
// 来客センサー（カメラ + 顔検出）
// ============================================================

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "このブラウザはカメラ非対応";
    cameraToggle.disabled = true;
    return;
  }
  try {
    cameraStatus.textContent = "カメラ起動中…";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    state.cameraStream = stream;
    cameraPreview.srcObject = stream;
    await cameraPreview.play().catch(() => {});
    cameraStatus.textContent = "カメラ動作中";
    cameraToggle.textContent = "カメラ停止";
    await ensureFaceDetector();
    startDetectionLoop();
    // 顔の登録がある場合は、識別モデルも裏で先読みしておく
    if (state.faceDb.length) ensureFaceApi();
  } catch (error) {
    console.warn("Camera start failed", error);
    cameraStatus.textContent =
      error?.name === "NotAllowedError" ? "カメラ許可がありません" : "カメラを起動できません";
    cameraToggle.textContent = "カメラ開始";
  }
}

function stopCamera() {
  stopDetectionLoop();
  stopMatchTestLoop();
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  cameraPreview.srcObject = null;
  state.faceVisible = false;
  cameraStatus.textContent = "カメラ停止中";
  cameraToggle.textContent = "カメラ開始";
  visitorStatus.textContent = "来客なし";
  cameraView.classList.remove("is-detecting");
  cameraFaceMark.hidden = true;
}

async function ensureFaceDetector() {
  if (state.faceDetector || state.detectorFailed) return;
  try {
    cameraStatus.textContent = "顔検出を準備中…";
    const vision = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );
    state.faceDetector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
    cameraStatus.textContent = "カメラ動作中（顔検出あり）";
  } catch (error) {
    console.warn("Face detector failed to load", error);
    state.detectorFailed = true;
    cameraStatus.textContent = "顔検出を読み込めません（来客テストで確認可）";
  }
}

function startDetectionLoop() {
  stopDetectionLoop();
  if (!state.faceDetector) return;
  state.detectTimer = window.setInterval(() => {
    if (!state.faceDetector || !state.cameraStream) return;
    if (cameraPreview.readyState < 2 || !cameraPreview.videoWidth) return;
    try {
      const result = state.faceDetector.detectForVideo(cameraPreview, performance.now());
      const detections = result?.detections || [];
      const box = detections[0]?.boundingBox;
      if (box) {
        // 服装識別（胴体の切り出し）用に、直近の顔位置を覚えておく
        state.lastFaceBox = box;
        state.lastFaceBoxAt = Date.now();
      }
      updateFacePresence(detections.length);
    } catch (error) {
      console.warn("Face detection error", error);
    }
  }, DETECT_INTERVAL_MS);
}

function stopDetectionLoop() {
  if (!state.detectTimer) return;
  window.clearInterval(state.detectTimer);
  state.detectTimer = null;
}

function updateFacePresence(faceCount) {
  const now = Date.now();
  const visible = faceCount > 0;
  if (visible) {
    if (!state.faceVisible) state.faceFirstSeenAt = now;
    state.faceLastSeenAt = now;
  }
  state.faceVisible = visible;
  cameraView.classList.toggle("is-detecting", visible);
  cameraFaceMark.hidden = !visible;
  visitorStatus.textContent = visible
    ? state.visitorPerson?.name
      ? `${personLabel(state.visitorPerson)}が見えています`
      : faceCount > 1
        ? `${faceCount}名 いらっしゃいます`
        : "お客さまが見えています"
    : state.behavior === "attending"
      ? "確認中…"
      : "来客なし";
}

// ============================================================
// HUD・発話
// ============================================================

function loadSensorPanelVisible() {
  try {
    return window.localStorage.getItem(SENSOR_PANEL_STORAGE_KEY) !== "hidden";
  } catch (error) {
    return true;
  }
}

function setSensorPanelVisible(visible, { persist = true } = {}) {
  state.sensorPanelVisible = visible;
  if (cameraPanel) cameraPanel.hidden = !visible;
  if (!visible && employeeDemo) employeeDemo.hidden = true;
  if (sensorPanelToggle) {
    sensorPanelToggle.classList.toggle("is-active", visible);
    sensorPanelToggle.setAttribute("aria-pressed", visible ? "true" : "false");
    sensorPanelToggle.textContent = visible ? "センサーON" : "センサーOFF";
    sensorPanelToggle.title = visible ? "来客センサーを隠す" : "来客センサーを表示";
  }
  if (!persist) return;
  try {
    window.localStorage.setItem(SENSOR_PANEL_STORAGE_KEY, visible ? "visible" : "hidden");
  } catch (error) {
    console.warn("Sensor panel state could not be saved", error);
  }
}

function initHudEvents() {
  setSensorPanelVisible(state.sensorPanelVisible, { persist: false });

  sensorPanelToggle.addEventListener("click", () => {
    setSensorPanelVisible(!state.sensorPanelVisible);
  });

  soundToggle.addEventListener("click", () => {
    if (state.soundEnabled) {
      unlockSpeechFromGesture("sound-toggle", { forceReplay: true });
      return;
    }
    state.soundEnabled = !state.soundEnabled;
    soundToggle.classList.toggle("is-active", state.soundEnabled);
    soundToggle.setAttribute("aria-label", state.soundEnabled ? "音声を開始・もう一度再生" : "音声オフ");
    if (!state.soundEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      stopSpeechTracking();
    } else if (state.soundEnabled) {
      retryLastSpeech("sound-on");
    }
  });

  cameraToggle.addEventListener("click", () => {
    if (state.cameraStream) stopCamera();
    else startCamera();
  });

  visitorTest.addEventListener("click", () => triggerVisitorDemo(null));

  employeeDemoToggle.addEventListener("click", () => {
    employeeDemo.hidden = !employeeDemo.hidden;
    if (!employeeDemo.hidden) {
      renderRegisteredList();
      startMatchTestLoop();
    } else {
      stopMatchTestLoop();
    }
  });

  demoEmployeeWoman.addEventListener("click", () => triggerVisitorDemo(EMPLOYEE_DEMO_PROFILES.woman));
  demoEmployeeMan.addEventListener("click", () => triggerVisitorDemo(EMPLOYEE_DEMO_PROFILES.man));
  registerFaceButton.addEventListener("click", registerCurrentFace);
  registerClothingButton.addEventListener("click", registerCurrentClothing);
  registerName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      registerCurrentFace();
    }
  });
}

function speak(text, options = {}) {
  speechText.textContent = text;
  showBubble();
  startSpeechOutput(text, {
    minDuration: 2200,
    msPerCharacter: 135,
    rate: 1.03,
    pitch: 1.12,
    volume: 0.92,
    ...options,
  });
}

function showBubble() {
  hideBubbleTimer();
  speechBubble.classList.add("is-visible");
}

function scheduleBubbleHide(delay = 4000) {
  hideBubbleTimer();
  state.bubbleHideTimer = window.setTimeout(() => {
    speechBubble.classList.remove("is-visible");
  }, delay);
}

function hideBubbleTimer() {
  if (!state.bubbleHideTimer) return;
  window.clearTimeout(state.bubbleHideTimer);
  state.bubbleHideTimer = null;
}

// 読み上げ（TTS）をユーザー操作のタイミングでアンロックする。
// これをやらないと、録音WAVがある発話（起動・来客）は鳴るのに、
// 名前入り挨拶などTTSで読む発話だけが無音になる。
function primeSpeechSynthesis() {
  if (state.ttsPrimed || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.resume();
    const silent = new SpeechSynthesisUtterance("　");
    silent.volume = 0;
    silent.lang = "ja-JP";
    window.speechSynthesis.speak(silent);
    state.ttsPrimed = true;
  } catch (error) {
    console.warn("TTS prime failed", error);
  }
}

function unlockSpeechFromGesture(reason = "interaction", { forceReplay = false } = {}) {
  // 録音を鳴らす場合でも、TTSは必ずここでアンロックしておく（名前入り挨拶用）
  primeSpeechSynthesis();
  const unlockGeneric = !("speechSynthesis" in window);
  if (
    state.lastSpeechRequest &&
    findFallbackAudioFile(state.lastSpeechRequest.displayText || state.lastSpeechRequest.text, {
      includeGeneric: unlockGeneric,
    })
  ) {
    state.speechUnlocked = true;
    hideSoundPrimer();
    if (forceReplay || !state.lastSpeechRequest.started || !state.lastSpeechRequest.completed) {
      playFallbackAudioRequest(state.lastSpeechRequest, reason);
    }
    return;
  }
  if (!("speechSynthesis" in window)) {
    state.speechUnlocked = true;
    hideSoundPrimer();
    if (state.lastSpeechRequest) {
      if (forceReplay || !state.lastSpeechRequest.started || !state.lastSpeechRequest.completed) {
        playFallbackAudioRequest(state.lastSpeechRequest, reason);
      }
      return;
    }
    const currentText = speechText.textContent.trim();
    if (currentText) speak(currentText);
    return;
  }
  if (state.speechUnlocked) {
    if (forceReplay) replayLastSpeech(reason);
    return;
  }
  state.speechUnlocked = true;
  hideSoundPrimer();
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch (error) {
    console.warn("Speech unlock failed", error);
  }
  if (state.lastSpeechRequest) {
    state.lastSpeechRequest.completed = false;
    state.lastSpeechRequest.attempts = 0;
    if (state.lastSpeechRequest.token !== state.speechToken) {
      state.lastSpeechRequest.token = state.speechToken;
    }
    playSpeechRequest(state.lastSpeechRequest);
    return;
  }
  const currentText = speechText.textContent.trim();
  if (currentText) speak(currentText);
}

function showSoundPrimer() {
  if (!soundPrimer || !state.soundEnabled) return;
  soundPrimer.hidden = false;
}

function hideSoundPrimer() {
  if (!soundPrimer) return;
  soundPrimer.hidden = true;
}

function startSpeechOutput(text, options = {}) {
  const {
    minDuration = 1800,
    msPerCharacter = 130,
    rate = 1.03,
    pitch = 1.1,
    volume = 0.9,
  } = options;
  const spokenText = applySpeechPronunciations(text);
  const estimatedDuration = Math.max(minDuration, spokenText.length * msPerCharacter + 800);
  state.speechToken += 1;
  const token = state.speechToken;
  state.speechActive = false;
  clearSpeechKeepAlive();
  clearSpeechRetryTimer();
  stopCurrentFallbackAudio();
  state.speakingUntil = Date.now() + estimatedDuration;
  state.faceFrame = "";

  const request = {
    text: spokenText,
    displayText: text,
    token,
    rate,
    pitch,
    volume,
    estimatedDuration,
    attempts: 0,
    started: false,
    completed: false,
  };
  state.lastSpeechRequest = request;
  if (!state.soundEnabled) return;
  const hasTts = "speechSynthesis" in window;
  // 名前入りのセリフはTTSで名前を呼ぶ。TTSが無い環境だけ汎用録音も候補に含める
  if (findFallbackAudioFile(text, { includeGeneric: !hasTts })) {
    playFallbackAudioRequest(request, "preferred-audio");
  } else if (hasTts) {
    playSpeechRequest(request);
  } else {
    playFallbackAudioRequest(request, "no-speech-api");
  }
}

function playSpeechRequest(request) {
  if (!request || request.token !== state.speechToken || !state.soundEnabled || !("speechSynthesis" in window)) return;
  clearSpeechRetryTimer();
  stopCurrentFallbackAudio();
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch (error) {
    console.warn("Speech synthesis could not be reset", error);
  }
  state.speechActive = true;
  state.speakingUntil = Date.now() + Math.max(request.estimatedDuration, 15000);
  request.started = false;
  request.completed = false;
  const runId = (request.runId || 0) + 1;
  request.runId = runId;
  const utterance = new SpeechSynthesisUtterance(request.text);
  state.currentUtterance = utterance;
  utterance.lang = "ja-JP";
  utterance.rate = request.rate;
  utterance.pitch = request.pitch;
  utterance.volume = request.volume;
  const voice = chooseJapaneseVoice();
  if (voice) utterance.voice = voice;
  utterance.addEventListener("start", () => {
    if (request.token !== state.speechToken || request.runId !== runId) return;
    state.speechUnlocked = true;
    hideSoundPrimer();
    request.started = true;
    state.speechActive = true;
    state.speakingUntil = Date.now() + Math.max(request.estimatedDuration, 3000);
  });
  utterance.addEventListener("boundary", () => {
    if (request.token !== state.speechToken || request.runId !== runId || !state.speechActive) return;
    state.speakingUntil = Date.now() + 1800;
  });
  utterance.addEventListener("end", () => {
    if (request.runId !== runId) return;
    request.completed = true;
    if (state.currentUtterance === utterance) state.currentUtterance = null;
    finishSpeechTracking(request.token);
  });
  utterance.addEventListener("error", () => {
    if (request.runId !== runId) return;
    request.completed = false;
    if (state.currentUtterance === utterance) state.currentUtterance = null;
    finishSpeechTracking(request.token);
    if (playFallbackAudioRequest(request, "speech-error")) return;
    scheduleSpeechRetry(request);
  });
  state.speechKeepAliveTimer = window.setInterval(() => {
    if (request.token !== state.speechToken || request.runId !== runId || !state.speechActive) {
      clearSpeechKeepAlive();
      return;
    }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      state.speakingUntil = Date.now() + 1800;
    }
  }, 900);
  window.speechSynthesis.speak(utterance);
  scheduleSpeechStartCheck(request);
}

function playFallbackAudioRequest(request, reason = "fallback") {
  if (!request || request.token !== state.speechToken || !state.soundEnabled) return false;
  const file = findFallbackAudioFile(request.displayText || request.text);
  if (!file) {
    if (reason !== "speech-start-timeout") showSoundPrimer();
    return false;
  }
  clearSpeechRetryTimer();
  stopCurrentFallbackAudio();
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch (error) {
    console.warn("Speech synthesis could not be cancelled before audio fallback", error);
  }

  const runId = (request.runId || 0) + 1;
  request.runId = runId;
  request.started = false;
  request.completed = false;
  request.audioFallback = file;
  const audio = new Audio(`./audio/${file}.wav?v=${AUDIO_FALLBACK_VERSION}`);
  audio.preload = "auto";
  audio.volume = request.volume;
  state.currentFallbackAudio = audio;
  state.speechActive = true;
  state.speakingUntil = Date.now() + Math.max(request.estimatedDuration, 6000);
  if (reason === "sound-primer" || reason === "sound-toggle" || reason === "page-interaction") {
    state.speechUnlocked = true;
    hideSoundPrimer();
  }

  audio.addEventListener("playing", () => {
    if (request.token !== state.speechToken || request.runId !== runId) return;
    state.speechUnlocked = true;
    hideSoundPrimer();
    request.started = true;
    state.speechActive = true;
    state.speakingUntil = Date.now() + Math.max(request.estimatedDuration, 3000);
  });
  audio.addEventListener("timeupdate", () => {
    if (request.token !== state.speechToken || request.runId !== runId || audio.paused) return;
    state.speakingUntil = Date.now() + 1200;
  });
  audio.addEventListener("ended", () => {
    if (request.runId !== runId) return;
    request.completed = true;
    if (state.currentFallbackAudio === audio) state.currentFallbackAudio = null;
    finishSpeechTracking(request.token);
  });
  audio.addEventListener("error", () => {
    if (request.runId !== runId) return;
    request.completed = false;
    if (state.currentFallbackAudio === audio) state.currentFallbackAudio = null;
    finishSpeechTracking(request.token);
    showSoundPrimer();
  });

  const playPromise = audio.play();
  if (playPromise?.catch) {
    playPromise.catch((error) => {
      if (request.token !== state.speechToken || request.runId !== runId) return;
      request.completed = false;
      if (state.currentFallbackAudio === audio) state.currentFallbackAudio = null;
      finishSpeechTracking(request.token);
      showSoundPrimer();
      if (error?.name !== "NotAllowedError") console.warn("Audio fallback playback failed", error);
    });
  }
  return true;
}

// includeGeneric: false の場合、名前が読まれない汎用録音（known-visitor / clothing-visitor）は
// 候補から外す。名前入りのセリフは読み上げ（TTS）でちゃんと名前を呼ぶため。
function findFallbackAudioFile(text, { includeGeneric = true } = {}) {
  const normalized = normalizeSpeechAudioKey(text);
  const exact = AUDIO_FALLBACKS.get(normalized);
  if (exact) {
    if (!includeGeneric && (exact === "known-visitor" || exact === "clothing-visitor")) return null;
    return exact;
  }
  const raw = String(text || "");
  if (/^福田さん、おはようございます。/.test(raw)) return "fukuda-ohayo";
  if (/^福田さん、こんにちは。/.test(raw)) return "fukuda-konnichiwa";
  if (/^福田さん、こんばんは。/.test(raw)) return "fukuda-konbanwa";
  if (/^いつもお疲れさまです。ヤマトの方ですね。/.test(raw)) return "yamato-clothing";
  if (!includeGeneric) return null;
  if (/^.+さん、(?:おはようございます|こんにちは|こんばんは)。いつもありがとうございます。/.test(raw)) return "known-visitor";
  if (/^いつもお疲れさまです。.+の方ですね。/.test(raw)) return "clothing-visitor";
  return null;
}

function normalizeSpeechAudioKey(text) {
  return String(text || "").replace(/\s+/g, "");
}

function chooseJapaneseVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === "ja-JP" && /Kyoko|Otoya|Google|Microsoft|Japanese|日本/i.test(voice.name)) ||
    voices.find((voice) => voice.lang === "ja-JP") ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("ja")) ||
    null
  );
}

function scheduleSpeechStartCheck(request) {
  state.speechRetryTimer = window.setTimeout(() => {
    if (request.token !== state.speechToken || request.started || request.completed) return;
    if (window.speechSynthesis.speaking) return;
    if (playFallbackAudioRequest(request, "speech-start-timeout")) return;
    showSoundPrimer();
    scheduleSpeechRetry(request);
  }, 1400);
}

function scheduleSpeechRetry(request) {
  if (!request || request.token !== state.speechToken || request.completed || !state.soundEnabled) return;
  if (request.attempts >= 4) {
    showSoundPrimer();
    return;
  }
  request.attempts += 1;
  clearSpeechRetryTimer();
  const delay = [350, 900, 1800, 3200][request.attempts - 1] || 3200;
  state.speechRetryTimer = window.setTimeout(() => playSpeechRequest(request), delay);
}

function retryLastSpeech(reason = "retry") {
  const request = state.lastSpeechRequest;
  if (!request || !state.soundEnabled) return;
  if (
    findFallbackAudioFile(request.displayText || request.text, {
      includeGeneric: !("speechSynthesis" in window),
    })
  ) {
    playFallbackAudioRequest(request, reason);
    return;
  }
  if (!("speechSynthesis" in window)) {
    playFallbackAudioRequest(request, reason);
    return;
  }
  if (window.speechSynthesis.speaking) return;
  if (request.completed && reason !== "sound-on") return;
  if (request.token !== state.speechToken) {
    if (reason !== "sound-on") return;
    request.token = state.speechToken;
  }
  request.completed = false;
  request.attempts = Math.min(request.attempts, 2);
  playSpeechRequest(request);
}

function replayLastSpeech(reason = "replay") {
  const request = state.lastSpeechRequest;
  if (!request || !state.soundEnabled) return;
  if (request.token !== state.speechToken) request.token = state.speechToken;
  request.completed = false;
  request.started = false;
  request.attempts = 0;
  if (
    findFallbackAudioFile(request.displayText || request.text, {
      includeGeneric: !("speechSynthesis" in window),
    }) ||
    !("speechSynthesis" in window)
  ) {
    playFallbackAudioRequest(request, reason);
  } else {
    playSpeechRequest(request);
  }
}

function applySpeechPronunciations(text) {
  return SPEECH_PRONUNCIATION_RULES.reduce((current, [pattern, reading]) => current.replace(pattern, reading), text);
}

function isSpeaking(now = Date.now()) {
  if (state.currentFallbackAudio && !state.currentFallbackAudio.paused && !state.currentFallbackAudio.ended) {
    return true;
  }
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
  state.currentUtterance = null;
  stopCurrentFallbackAudio();
  clearSpeechKeepAlive();
  clearSpeechRetryTimer();
  closeMouthNow();
}

function stopCurrentFallbackAudio() {
  const audio = state.currentFallbackAudio;
  if (!audio) return;
  state.currentFallbackAudio = null;
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  } catch (error) {
    console.warn("Audio fallback could not be stopped", error);
  }
}

function clearSpeechKeepAlive() {
  if (!state.speechKeepAliveTimer) return;
  window.clearInterval(state.speechKeepAliveTimer);
  state.speechKeepAliveTimer = null;
}

function clearSpeechRetryTimer() {
  if (!state.speechRetryTimer) return;
  window.clearTimeout(state.speechRetryTimer);
  state.speechRetryTimer = null;
}

function closeMouthNow() {
  state.speakingUntil = 0;
  state.faceFrame = "";
  drawFaceTexture(false, getBlinkFrame(), 0);
  assistantMood.classList.remove("is-speaking");
}

function updateNamePlate() {
  if (!namePlate || !state.plateAnchor || !state.camera || !state.model) return;
  // 頭ボーンがあれば頭上に追従（座り・お辞儀などで頭の高さが変わっても付いていく）
  const worldPos = state.head
    ? state.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.34, 0))
    : state.plateAnchor.getWorldPosition(new THREE.Vector3());
  const projected = worldPos.clone().project(state.camera);
  if (projected.z > 1) {
    namePlate.classList.add("is-hidden");
    return;
  }
  namePlate.classList.remove("is-hidden");
  const rect = sceneHost.getBoundingClientRect();
  const x = (projected.x * 0.5 + 0.5) * rect.width;
  const y = (-projected.y * 0.5 + 0.5) * rect.height;
  const distance = state.camera.position.distanceTo(worldPos);
  const scale = (4.9 / Math.max(distance, 0.5)) * (rect.height / 720);
  namePlate.style.left = `${x}px`;
  namePlate.style.top = `${y}px`;
  namePlate.style.fontSize = `${15 * scale}px`;
}

function updateClock() {
  const now = new Date();
  clockText.textContent = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  updateWallClock(now);
}

function updateWallClock(now = new Date()) {
  if (!state.wallClockHour || !state.wallClockMinute) return;
  const minutes = now.getMinutes() + now.getSeconds() / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  state.wallClockMinute.rotation.z = -(minutes / 60) * Math.PI * 2;
  state.wallClockHour.rotation.z = -(hours / 12) * Math.PI * 2;
}

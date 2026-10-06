// 受付AI（worker-reception-3d）の背景・受付デスク・PC・イス・小物。
// キャラクターの寸法から決めた layout（app.js の computeLayout）に合わせて配置する。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const FONT = "'Hiragino Sans', 'Noto Sans JP', sans-serif";

function canvasTexture(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

const rounded = (w, h, d, r = 0.006, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// ---------------------------------------------------------------------------
// 素材
// ---------------------------------------------------------------------------

/** 明るいオーク材の木目（背景画像のルーバーに合わせた色）。 */
function oakTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = "#a87b52"; // 背景写真のルーバー（RGB 180,143,106）に、照明で明るくなる分を見込んで合わせた色
    g.fillRect(0, 0, w, h);
    // 年輪の筋
    for (let i = 0; i < 260; i += 1) {
      const x = Math.random() * w;
      const width = 1 + Math.random() * 3.5;
      const dark = Math.random() < 0.5;
      g.strokeStyle = dark ? `rgba(105,66,32,${0.08 + Math.random() * 0.16})` : `rgba(240,212,170,${0.06 + Math.random() * 0.12})`;
      g.lineWidth = width;
      g.beginPath();
      let px = x;
      g.moveTo(px, 0);
      for (let y = 0; y <= h; y += 32) {
        px += (Math.random() - 0.5) * 3;
        g.lineTo(px, y);
      }
      g.stroke();
    }
    // ゆるいムラ
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.05)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.03)");
    grad.addColorStop(1, "rgba(255,255,255,0.04)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** 観葉植物の葉（先のとがった楕円・葉脈・付け根から先へのグラデーション）。透明部分は切り抜く。 */
function leafTexture(light, dark) {
  return canvasTexture(128, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, dark);
    grad.addColorStop(1, light);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(w / 2, h);
    g.bezierCurveTo(w * 1.05, h * 0.7, w * 0.95, h * 0.25, w / 2, 0);
    g.bezierCurveTo(w * 0.05, h * 0.25, -w * 0.05, h * 0.7, w / 2, h);
    g.fill();
    g.strokeStyle = "rgba(225,240,200,0.55)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w / 2, h);
    g.quadraticCurveTo(w * 0.52, h * 0.5, w / 2, h * 0.04);
    g.stroke();
    g.strokeStyle = "rgba(225,240,200,0.18)";
    g.lineWidth = 1.5;
    for (let i = 1; i < 9; i += 1) {
      const y = h * (1 - i / 10);
      g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w * 0.7, y - 18, w * 0.88, y - 40); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w * 0.3, y - 18, w * 0.12, y - 40); g.stroke();
    }
  });
}

/** メッシュ（網目）の背もたれ用。 */
function meshFabricTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#3a414a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 2;
    for (let i = -h; i < w; i += 8) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
  }, { repeat: [4, 4] });
}

function makeMaterials(envMap) {
  const M = makeBaseMaterials();
  for (const [name, m] of Object.entries(M)) {
    if (!m.isMeshStandardMaterial) continue;
    m.envMap = envMap;
    m.envMapIntensity = ["alu", "darkAlu", "chrome"].includes(name) ? 0.9 : name.startsWith("oak") ? 0.3 : 0.45;
  }
  return M;
}

function makeBaseMaterials() {
  const oak = oakTexture();
  const oakVertical = oak.clone();
  oakVertical.rotation = Math.PI / 2;
  oakVertical.center.set(0.5, 0.5);
  oakVertical.needsUpdate = true;
  return {
    oak: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.55, metalness: 0 }),
    oakSlat: new THREE.MeshStandardMaterial({ map: oakVertical, roughness: 0.6, metalness: 0 }),
    white: new THREE.MeshStandardMaterial({ color: 0xebe9e4, roughness: 0.55, metalness: 0 }),
    whiteGloss: new THREE.MeshStandardMaterial({ color: 0xfbfbfa, roughness: 0.25, metalness: 0 }),
    navyFabric: new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.92, metalness: 0 }),
    meshBack: new THREE.MeshStandardMaterial({ map: meshFabricTexture(), roughness: 0.85, metalness: 0.05 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc7cbd0, roughness: 0.32, metalness: 0.85 }),
    // 黒は背景写真のやわらかい光に合わせて、真っ黒にせず少し明るめにする
    darkAlu: new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.65 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x343a42, roughness: 0.6, metalness: 0.08 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.15, metalness: 1.0 }),
    keycap: new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.45, metalness: 0 }),
    potWhite: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.8, metalness: 0 }),
    leaf: new THREE.MeshStandardMaterial({ map: leafTexture("#8dbb5f", "#3f7a36"), alphaTest: 0.4, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
    leafDark: new THREE.MeshStandardMaterial({ map: leafTexture("#6fa04c", "#2f5f2c"), alphaTest: 0.4, roughness: 0.65, metalness: 0, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.9 }),
    led: new THREE.MeshBasicMaterial({ color: 0xfff1d8 }),
    acrylic: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.55, clearcoat: 1 }),
  };
}

// ---------------------------------------------------------------------------
// 照明・背景
// ---------------------------------------------------------------------------

/**
 * 部屋の環境光（金属やモニターに映り込む）を作る。
 * scene.environment に入れるとキャラクターにも全力でかかり（素材ごとの強さ指定が効かない）、
 * 顔や白いシャツが白く飛ぶので、家具の素材にだけ個別に設定する（buildReception に渡す）。
 */
export function createEnvironmentMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/** 背景画像の床に、デスクとキャラクターの影だけを落とす透明な床。 */
export function buildShadowFloor(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ color: 0x3a2f24, opacity: 0.22 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

// ---------------------------------------------------------------------------
// 受付デスク
// ---------------------------------------------------------------------------

function buildReceptionDesk(group, layout, M) {
  const { deskTopY, deskBackZ, deskFrontZ } = layout;
  const width = 1.56;
  const depth = deskFrontZ - deskBackZ + 0.05;
  const centerZ = deskBackZ + depth / 2 - 0.02;
  const panelH = deskTopY - 0.04;

  // 天板（オーク）
  const top = shadowed(new THREE.Mesh(rounded(width, 0.032, depth, 0.008), M.oak));
  top.position.set(0, deskTopY - 0.016, centerZ);
  group.add(top);

  // 天板の下の間接照明（来客側の縁に沿って光る線）
  const led = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.006, 0.006), M.led);
  led.position.set(0, deskTopY - 0.036, deskFrontZ - 0.018);
  group.add(led);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.04, 0.22),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(16, 128, (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(255,236,200,0.55)");
        grad.addColorStop(1, "rgba(255,236,200,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
    }),
  );
  glow.position.set(0, deskTopY - 0.15, deskFrontZ + 0.012);
  group.add(glow);

  // 来客側の正面パネル: 白い下地＋オークのルーバー（縦格子）
  const front = shadowed(new THREE.Mesh(rounded(width, panelH, 0.03, 0.006), M.white));
  front.position.set(0, panelH / 2, deskFrontZ - 0.015);
  group.add(front);
  const slatW = 0.028;
  const gap = 0.014;
  const count = Math.floor((width - 0.1) / (slatW + gap));
  const slats = new THREE.InstancedMesh(rounded(slatW, panelH - 0.06, 0.02, 0.004, 2), M.oakSlat, count);
  const m4 = new THREE.Matrix4();
  const x0 = -((count - 1) * (slatW + gap)) / 2;
  for (let i = 0; i < count; i += 1) {
    m4.makeTranslation(x0 + i * (slatW + gap), (panelH - 0.06) / 2 + 0.03, deskFrontZ + 0.01);
    slats.setMatrixAt(i, m4);
  }
  slats.castShadow = true;
  slats.receiveShadow = true;
  group.add(slats);

  // BSTのロゴプレート（白い板に紺の文字）
  const plateTex = canvasTexture(1024, 384, (g, w, h) => {
    g.fillStyle = "#fbfbfa";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1f3a63";
    g.font = `800 150px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("BST", w / 2, h * 0.42);
    g.fillStyle = "#1593b8";
    g.fillRect(w / 2 - 120, h * 0.66, 240, 8);
    g.fillStyle = "#4c5a66";
    g.font = `500 44px ${FONT}`;
    g.fillText("RECEPTION", w / 2, h * 0.82);
  });
  const plate = shadowed(new THREE.Mesh(
    rounded(0.34, 0.13, 0.012, 0.004),
    [M.white, M.white, M.white, M.white, new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4 }), M.white],
  ));
  plate.position.set(0, panelH * 0.58, deskFrontZ + 0.028);
  group.add(plate);

  // 側板
  for (const sx of [-1, 1]) {
    const side = shadowed(new THREE.Mesh(rounded(0.03, panelH, depth - 0.04, 0.006), M.white));
    side.position.set(sx * (width / 2 - 0.015), panelH / 2, centerZ);
    group.add(side);
  }
  return { width, depth, centerZ };
}

// ---------------------------------------------------------------------------
// PC
// ---------------------------------------------------------------------------

function screenTexture() {
  return canvasTexture(1600, 960, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#f6f9fb");
    bg.addColorStop(1, "#eaf0f4");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // ヘッダー
    g.fillStyle = "#1f3a63";
    g.fillRect(0, 0, w, 96);
    g.fillStyle = "#ffffff";
    g.font = `800 46px ${FONT}`;
    g.fillText("BST", 40, 64);
    g.font = `600 34px ${FONT}`;
    g.fillText("受付システム", 160, 62);
    g.font = `500 30px ${FONT}`;
    g.textAlign = "right";
    g.fillText("10:24", w - 40, 62);
    g.textAlign = "left";
    // 見出し
    g.fillStyle = "#18222b";
    g.font = `700 40px ${FONT}`;
    g.fillText("本日の来客予定", 48, 176);
    g.fillStyle = "#1593b8";
    g.fillRect(48, 196, 120, 6);
    // 一覧
    const rows = [
      ["10:00", "山田 様", "株式会社サンプル", "営業部 田中", "ご案内済み", "#2c6e52", "#e6f1ea"],
      ["10:30", "佐々木 様", "ABC商事", "総務部 佐藤", "まもなく", "#8a5a10", "#f8efdd"],
      ["13:30", "高橋 様", "グリーン工業", "技術部 鈴木", "予定", "#4c5a66", "#eef1f4"],
      ["15:00", "配達", "宅配便", "受付", "予定", "#4c5a66", "#eef1f4"],
    ];
    rows.forEach(([t, name, co, staff, status, sc, sb], i) => {
      const y = 250 + i * 150;
      g.fillStyle = i === 1 ? "#e2f3f8" : "#ffffff";
      g.beginPath();
      g.roundRect(40, y, w - 80, 128, 18);
      g.fill();
      g.strokeStyle = "#d6dde2";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = "#1f3a63";
      g.font = `700 40px ${FONT}`;
      g.fillText(t, 80, y + 78);
      g.fillStyle = "#18222b";
      g.font = `700 38px ${FONT}`;
      g.fillText(name, 280, y + 62);
      g.fillStyle = "#4c5a66";
      g.font = `400 28px ${FONT}`;
      g.fillText(co, 280, y + 104);
      g.fillText(`担当: ${staff}`, 760, y + 78);
      g.fillStyle = sb;
      g.beginPath();
      g.roundRect(w - 320, y + 38, 240, 54, 27);
      g.fill();
      g.fillStyle = sc;
      g.font = `700 28px ${FONT}`;
      g.textAlign = "center";
      g.fillText(status, w - 200, y + 75);
      g.textAlign = "left";
    });
  });
}

function buildMonitor(group, layout, M) {
  const monitor = new THREE.Group();
  const W = 0.5;
  const H = 0.3;
  const bezel = shadowed(new THREE.Mesh(rounded(W, H, 0.016, 0.006), M.darkAlu));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.018, H - 0.03),
    new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }),
  );
  // 画面はキャラクター側（ローカル -Z）
  screen.position.set(0, 0.006, -0.0085);
  screen.rotation.y = Math.PI;
  // 背面の膨らみ
  const back = shadowed(new THREE.Mesh(rounded(W * 0.62, H * 0.6, 0.03, 0.012), M.alu));
  back.position.set(0, -0.01, 0.018);
  // スタンド（アルミの首と楕円の台座）
  const baseY = layout.deskTopY + 0.004 - layout.monitor.y; // モニターから見た天板の高さ
  const neckTop = -0.06;
  const neck = shadowed(new THREE.Mesh(rounded(0.05, neckTop - baseY, 0.016, 0.006), M.alu));
  neck.position.set(0, (neckTop + baseY) / 2, 0.05);
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.115, 0.008, 48), M.alu));
  base.scale.set(1, 1, 0.72);
  base.position.set(0, baseY, 0.07);
  monitor.add(bezel, screen, back, neck, base);
  monitor.position.copy(layout.monitor);
  monitor.rotation.y = layout.monitorYaw;
  group.add(monitor);

  // 画面の明かりがキャラクターの顔をうっすら照らす
  const screenLight = new THREE.PointLight(0xdfeefe, 0.25, 1.0, 2);
  screenLight.position.copy(layout.monitor).add(new THREE.Vector3(-0.1, 0, -0.1));
  group.add(screenLight);
  return monitor;
}

function buildKeyboard(group, layout, M) {
  const kb = new THREE.Group();
  const body = shadowed(new THREE.Mesh(rounded(0.36, 0.011, 0.122, 0.004), M.alu));
  kb.add(body);
  // キー（行ごとに少しずつずれる配列）
  const rows = [14, 14, 13, 12, 9];
  const key = 0.0205;
  const pitch = 0.0242;
  const caps = new THREE.InstancedMesh(rounded(key, 0.007, key, 0.003, 2), M.keycap, rows.reduce((a, b) => a + b, 0) + 1);
  const m4 = new THREE.Matrix4();
  let n = 0;
  rows.forEach((cols, r) => {
    const z = -0.046 + r * pitch;
    const offset = [0, 0.004, 0.008, 0.012, 0][r];
    for (let c = 0; c < cols; c += 1) {
      if (r === 4 && c >= 3 && c <= 5) continue; // スペースキーの場所
      const x = -0.16 + offset + c * pitch;
      m4.makeTranslation(x, 0.009, z);
      caps.setMatrixAt(n, m4);
      n += 1;
    }
  });
  // スペースキー
  m4.compose(new THREE.Vector3(-0.16 + 4 * pitch, 0.009, -0.046 + 4 * pitch), new THREE.Quaternion(), new THREE.Vector3(3.4, 1, 1));
  caps.setMatrixAt(n, m4);
  n += 1;
  caps.count = n;
  caps.castShadow = true;
  kb.add(caps);
  kb.position.copy(layout.keyboard).add(new THREE.Vector3(0, -0.003, 0));
  kb.rotation.x = -0.035; // 手前に少し傾ける
  group.add(kb);

  // マウスとマウスパッド（右側）
  const pad = shadowed(new THREE.Mesh(rounded(0.2, 0.003, 0.17, 0.0015), M.plastic), false, true);
  pad.position.set(layout.keyboard.x + 0.3, layout.deskTopY + 0.0015, layout.keyboard.z + 0.01);
  const mouse = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 32, 16), M.whiteGloss));
  mouse.scale.set(0.62, 0.38, 1.0);
  mouse.position.set(pad.position.x + 0.01, layout.deskTopY + 0.014, pad.position.z);
  group.add(pad, mouse);
}

// ---------------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------------

function buildPlant(M, height = 0.24) {
  const plant = new THREE.Group();
  const pot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.09, 40), M.potWhite));
  pot.position.y = 0.045;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 32), M.soil);
  soil.position.y = 0.087;
  plant.add(pot, soil);
  // 葉: 付け根から先へ反りながら広がる葉を、株の中心から放射状に重ねる
  const leafGeo = new THREE.PlaneGeometry(0.045, 0.13, 2, 8);
  const pos = leafGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) + 0.065; // 0（付け根）〜0.13（先）
    const x = pos.getX(i);
    pos.setY(i, y);
    pos.setZ(i, -y * y * 2.6 + Math.abs(x) * 0.35); // 先が外へ反り、中央の葉脈でわずかに折れる
  }
  leafGeo.computeVertexNormals();
  const leaves = 34;
  for (let i = 0; i < leaves; i += 1) {
    const leaf = new THREE.Mesh(leafGeo, i % 3 === 0 ? M.leafDark : M.leaf);
    const k = i / leaves;
    const a = i * 2.39996; // 黄金角で重ならないように
    const tilt = 0.15 + k * 0.95; // 内側の若い葉は立ち、外側は寝る
    leaf.position.set(0, 0.088, 0);
    leaf.rotation.set(-tilt, a, 0, "YXZ");
    leaf.scale.setScalar((0.7 + (1 - k) * 0.25) * (height / 0.24) * (0.9 + Math.random() * 0.2));
    leaf.castShadow = true;
    plant.add(leaf);
  }
  return plant;
}

function buildSign(M) {
  // 来客向けの「受付」案内サイン（アクリルのスタンド）
  const tex = canvasTexture(720, 480, (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1f3a63";
    g.font = `800 150px ${FONT}`;
    g.textAlign = "center";
    g.fillText("受付", w / 2, 230);
    g.fillStyle = "#1593b8";
    g.fillRect(w / 2 - 90, 268, 180, 8);
    g.fillStyle = "#4c5a66";
    g.font = `500 46px ${FONT}`;
    g.fillText("RECEPTION", w / 2, 350);
    g.font = `400 34px ${FONT}`;
    g.fillText("お気軽にお声がけください", w / 2, 418);
  });
  const sign = new THREE.Group();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  card.position.set(0, 0.058, 0.002);
  const acrylic = new THREE.Mesh(rounded(0.16, 0.112, 0.004, 0.002), M.acrylic);
  acrylic.position.set(0, 0.058, 0);
  const foot = shadowed(new THREE.Mesh(rounded(0.16, 0.008, 0.05, 0.003), M.acrylic));
  foot.position.set(0, 0.004, 0.0);
  sign.add(card, acrylic, foot);
  sign.rotation.x = -0.12;
  return sign;
}

function buildPenStand(M) {
  const g = new THREE.Group();
  const cup = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.09, 32, 1, true), M.alu));
  cup.position.y = 0.045;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.026, 32), M.alu);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.001;
  g.add(cup, bottom);
  const colors = [0x1f3a63, 0x1593b8, 0x23272b];
  colors.forEach((c, i) => {
    const pen = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })));
    pen.position.set(Math.cos(i * 2.1) * 0.01, 0.07, Math.sin(i * 2.1) * 0.01);
    pen.rotation.set(Math.cos(i * 2.1) * 0.18, 0, Math.sin(i * 2.1) * 0.18);
    g.add(pen);
  });
  return g;
}

// メモ帳（罫線入り・上に紺の綴じ）。原点は机の面、書く面は y=MEMO_SURFACE。
// 書く人から見て上（奥）が +z、書く人の左が +x になる向きで罫線を描く。
export const MEMO_SURFACE = 0.0073;
function buildPapers(M) {
  const g = new THREE.Group();
  const W = 0.105, D = 0.148;
  const stack = shadowed(new THREE.Mesh(rounded(W, 0.0068, D, 0.0015, 2), new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.92 })), true, true);
  stack.position.y = 0.0034;
  g.add(stack);
  // 一番上の紙（罫線）
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, 384, 512);
  const sheetD = 0.140, sheetTop = 0.067; // 紙の奥の端（メモ帳の中心から）
  const yOf = (v) => (sheetTop - v) / sheetD * 512;
  c.strokeStyle = '#bcd3e4'; c.lineWidth = 2;
  for (let v = 0.036 + 0.025; v > -0.07; v -= 0.025) {
    c.beginPath(); c.moveTo(14, yOf(v)); c.lineTo(370, yOf(v)); c.stroke();
  }
  c.fillStyle = '#8aa4ba'; c.font = '600 22px "Hiragino Sans", sans-serif';
  c.fillText('MEMO', 18, yOf(0.054));
  c.strokeStyle = '#c9d6e0'; c.lineWidth = 1.5;
  c.strokeRect(250, yOf(0.064), 116, yOf(0.050) - yOf(0.064));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sheetGeo = new THREE.PlaneGeometry(0.102, sheetD);
  sheetGeo.rotateX(-Math.PI / 2); sheetGeo.rotateY(Math.PI);
  const sheet = new THREE.Mesh(sheetGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  sheet.position.set(0, MEMO_SURFACE - 0.0002, sheetTop - sheetD / 2);
  sheet.receiveShadow = true;
  g.add(sheet);
  // 綴じ（奥の端）
  const bind = shadowed(new THREE.Mesh(rounded(W + 0.002, 0.0095, 0.013, 0.003), new THREE.MeshStandardMaterial({ color: 0x1f3a63, roughness: 0.55 })));
  bind.position.set(0, 0.0047, D / 2 - 0.0065);
  g.add(bind);
  return g;
}

// ---------------------------------------------------------------------------
// イス
// ---------------------------------------------------------------------------

function buildChair(layout, M) {
  const chair = new THREE.Group();
  const { seatY, seatZ } = layout;
  const seat = shadowed(new THREE.Mesh(rounded(0.46, 0.07, 0.44, 0.03, 4), M.navyFabric));
  seat.position.set(0, seatY - 0.035, seatZ);
  chair.add(seat);
  // 網目の背もたれ（枠＋メッシュ）
  const backFrame = shadowed(new THREE.Mesh(rounded(0.44, 0.5, 0.03, 0.03, 4), M.plastic));
  backFrame.position.set(0, seatY + 0.33, seatZ - 0.25);
  backFrame.rotation.x = -0.1;
  const backMesh = new THREE.Mesh(rounded(0.4, 0.46, 0.012, 0.02, 3), M.meshBack);
  backMesh.position.set(0, 0, 0.012);
  backFrame.add(backMesh);
  chair.add(backFrame);
  // 背もたれの支柱
  const spine = shadowed(new THREE.Mesh(rounded(0.05, 0.22, 0.03, 0.01), M.plastic));
  spine.position.set(0, seatY + 0.05, seatZ - 0.235);
  chair.add(spine);
  // 肘掛け
  for (const sx of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(rounded(0.025, 0.18, 0.04, 0.008), M.plastic));
    post.position.set(sx * 0.235, seatY + 0.07, seatZ - 0.02);
    const pad = shadowed(new THREE.Mesh(rounded(0.05, 0.022, 0.22, 0.01), M.plastic));
    pad.position.set(sx * 0.235, seatY + 0.17, seatZ);
    chair.add(post, pad);
  }
  // ガスシリンダーと5本脚・キャスター
  const gas = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, seatY - 0.12, 24), M.chrome));
  gas.position.set(0, (seatY - 0.12) / 2 + 0.07, seatZ);
  chair.add(gas);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const leg = shadowed(new THREE.Mesh(rounded(0.3, 0.025, 0.04, 0.01), M.alu));
    leg.position.set(Math.cos(a) * 0.15, 0.07, seatZ + Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    const caster = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), M.plastic));
    caster.position.set(Math.cos(a) * 0.29, 0.027, seatZ + Math.sin(a) * 0.29);
    chair.add(leg, caster);
  }
  return chair;
}

// ---------------------------------------------------------------------------
// まとめて配置
// ---------------------------------------------------------------------------

export function buildReception(scene, layout, envMap) {
  const M = makeMaterials(envMap);
  const group = new THREE.Group();
  const desk = buildReceptionDesk(group, layout, M);
  const applyEnv = () => group.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = envMap; m.envMapIntensity = 0.45; }
    }
  });
  const monitor = buildMonitor(group, layout, M);
  buildKeyboard(group, layout, M);

  // 小物（モニターと反対の左側に寄せる）
  const top = layout.deskTopY;
  const plant = buildPlant(M);
  plant.position.set(-0.6, top, layout.deskFrontZ - 0.12);
  const sign = buildSign(M); // 板の表は +Z（来客側）を向いている
  sign.position.set(-0.47, top, layout.deskFrontZ - 0.07);
  const pens = buildPenStand(M);
  pens.position.set(-0.46, top, layout.deskBackZ + 0.12);
  const papers = buildPapers(M);
  // 右手が肘を軽く曲げたまま届く、キーボードの右・体の近く（腕が短い体型に合わせる）
  papers.position.set(layout.keyboard.x - 0.235, top, layout.keyboard.z - 0.128);
  papers.rotation.y = 0.12; // 右利きの人が書きやすいよう、紙の上を少し左へ傾ける
  group.add(plant, sign, pens, papers);

  const chair = buildChair(layout, M);
  group.add(chair);
  applyEnv();
  scene.add(group);
  return { group, chair, monitor, desk, papers };
}

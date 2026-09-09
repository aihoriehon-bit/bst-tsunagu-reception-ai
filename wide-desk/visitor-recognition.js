import { ROLES, validVector, matchFace, clothingSignature, matchClothing } from './visitor-matching.mjs';

const STORAGE_KEY = 'tsunagu-desk-identities-v1';
const API_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createVisitorRecognition({ video, panel, onRegistrationChange, onDelivery }) {
  let db = { people: [], uniforms: [] }, storageError = false;
  try { db = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch { storageError = true; }
  let faces = [], facesAt = 0, epoch = 0, apiPromise = null, busy = false;
  let candidate = '', hits = 0, identity = null, identityAt = 0, capturing = false, stopped = false;
  let modelError = false, retryAt = 0;
  const canvas = document.createElement('canvas');
  const live = document.createElement('span');
  live.className = 'recognition-status';
  live.setAttribute('aria-live', 'polite');
  panel.querySelector('.camera-info').append(live);
  const open = document.createElement('button');
  open.type = 'button'; open.textContent = '顔・配達登録';
  const delivery = document.createElement('button');
  delivery.type = 'button'; delivery.textContent = '配達受付';
  panel.querySelector('.camera-buttons').append(open, delivery);
  delivery.addEventListener('click', onDelivery);

  const dialog = document.createElement('dialog');
  dialog.className = 'identity-dialog';
  dialog.setAttribute('aria-labelledby', 'identityTitle');
  dialog.innerHTML = `
    <div class="identity-heading"><h2 id="identityTitle">顔・配達の登録</h2><button type="button" data-close aria-label="登録画面を閉じる">閉じる</button></div>
    <p>本人の了承を得て登録してください。顔の特徴量・区分・名前と制服の色を、このブラウザ内だけに保存します。写真・映像は保存・送信しません。</p>
    <p>登録中は自動の挨拶を休止します。カメラに1人で、明るい場所で写ってください。</p>
    <video class="identity-preview" autoplay muted playsinline aria-label="登録用カメラ映像"></video>
    <label>お名前・会社名<input id="identityName" maxlength="40" autocomplete="off" placeholder="例：佐藤／ヤマト"></label>
    <label>区分<select id="identityRole"><option value="employee">社員</option><option value="guest">お客様</option><option value="delivery">配達</option></select></label>
    <label class="identity-consent"><input id="identityConsent" type="checkbox">本人から顔登録の了承を得ています</label>
    <div class="identity-actions"><button type="button" data-face>顔を登録（3回撮影）</button><button type="button" data-uniform>配達の制服を登録</button></div>
    <p class="identity-note">制服は胸からお腹まで写してください。色が似た服でも反応するため「配達の可能性」として扱います。判断できない場合はカメラ欄の「配達受付」を使えます。</p>
    <p class="identity-note">音声は既存のVOICEVOX音声を使用します。佐藤・田中・福田以外のお名前は画面に表示し、名前を含まない挨拶を使います。</p>
    <p data-message role="status"></p>
    <h3>登録一覧</h3><ul data-list></ul>
    <button type="button" data-import>以前の顔登録を取り込む</button>
    <p class="identity-note">同じ端末・ブラウザの旧版にある顔登録を取り込みます。旧登録は「お客様」で取り込み、一覧で区分を変更できます。以前の制服は再登録してください。別端末や別ブラウザには同期されません。</p>`;
  document.body.append(dialog);
  const q = s => dialog.querySelector(s);
  const message = text => { q('[data-message]').textContent = text; };
  const setBusy = value => {
    capturing = value;
    dialog.querySelectorAll('input, select, button:not([data-close])').forEach(el => { el.disabled = value; });
  };
  open.addEventListener('click', () => {
    reset(); dialog.showModal(); onRegistrationChange(true); render();
    q('video').srcObject = video.srcObject;
    q('video').play().catch(() => {});
    message(storageError ? '保存データを読み込めませんでした。登録内容を確認してください。' : '顔を正面から写して登録してください。');
  });
  q('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { q('video').srcObject = null; reset(); onRegistrationChange(false); });
  q('[data-face]').addEventListener('click', () => register(false));
  q('[data-uniform]').addEventListener('click', () => register(true));
  q('[data-import]').addEventListener('click', () => {
    try {
      const old = JSON.parse(localStorage.getItem('tsunagu-face-db-v3') || '[]');
      if (!Array.isArray(old)) throw new Error();
      const imported = sanitize({ people: old.map(p => ({ ...p, id: crypto.randomUUID(), role: 'guest' })) }).people;
      const additions = imported.filter(p => !db.people.some(x => x.name === p.name));
      if (!additions.length) { message('取り込める旧登録がありません。同じ公開サイト・ブラウザでご確認ください。'); return; }
      const next = { ...db, people: [...db.people, ...additions].slice(0, 100) };
      save(next); render(); message(`${additions.length}名を取り込みました。一覧で社員・お客様・配達の区分を確認してください。`);
    } catch { message('旧登録を読み込めないか、保存できませんでした。ブラウザの保存設定をご確認ください。'); }
  });

  function sanitize(value) {
    const read = (items, key, n) => (Array.isArray(items) ? items : []).filter(p => p && typeof p.name === 'string' && p.name.trim() && Array.isArray(p[key]))
      .map(p => ({ id: typeof p.id === 'string' ? p.id : crypto.randomUUID(), name: p.name.trim().slice(0, 40),
        role: ROLES[p.role] ? p.role : 'guest', [key]: p[key].filter(v => validVector(v, n)).slice(-12) }))
      .filter(p => p[key].length).slice(0, 100);
    return { people: read(value?.people, 'descriptors', 128), uniforms: read(value?.uniforms, 'signatures', 19) };
  }
  function save(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    db = next; storageError = false; reset();
  }
  function reset() { epoch++; identity = null; identityAt = 0; candidate = ''; hits = 0; }
  function singleFace() { return faces.length === 1 && Date.now() - facesAt < 1200 && video.readyState >= 2 && video.videoWidth > 0; }
  function snapshot(uniform = false) {
    if (!singleFace()) return null;
    const b = faces[0].boundingBox;
    if (!b || b.width < 45 || b.height < 45) return null;
    const cx = b.originX + b.width / 2, cy = b.originY + b.height / 2;
    let x, y, w, h;
    if (uniform) {
      x = Math.max(0, cx - b.width * 1.1); y = b.originY + b.height * 1.25;
      w = Math.min(b.width * 2.2, video.videoWidth - x); h = Math.min(b.height * 1.8, video.videoHeight - y);
      if (h < b.height || w < b.width * 1.5) return null;
    } else {
      const size = Math.max(b.width, b.height) * 2.2;
      x = Math.max(0, cx - size / 2); y = Math.max(0, cy - size / 2);
      w = Math.min(size, video.videoWidth - x); h = Math.min(size, video.videoHeight - y);
    }
    canvas.width = uniform ? 32 : 320; canvas.height = Math.round(h / w * canvas.width);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);
    return uniform ? clothingSignature(ctx.getImageData(0, 0, canvas.width, canvas.height).data) : canvas;
  }
  async function ensureApi() {
    if (!apiPromise) apiPromise = (async () => {
      live.textContent = '顔の識別を準備中…';
      const api = await import(API_URL);
      await Promise.race([
        Promise.all([api.nets.tinyFaceDetector.loadFromUri(MODEL_URL), api.nets.faceLandmark68Net.loadFromUri(MODEL_URL), api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]),
        delay(30000).then(() => { throw new Error('顔の識別モデルを読み込めませんでした。通信状態を確認して、もう一度お試しください。'); }),
      ]);
      modelError = false;
      return api;
    })().catch(error => { apiPromise = null; modelError = true; retryAt = Date.now() + 30000; throw error; });
    return apiPromise;
  }
  async function descriptor() {
    const api = await ensureApi();
    const crop = snapshot();
    if (!crop) return null;
    const result = await api.detectSingleFace(crop, new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 })).withFaceLandmarks().withFaceDescriptor();
    return result ? Array.from(result.descriptor) : null;
  }
  async function register(uniform) {
    const name = q('#identityName').value.trim(), role = q('#identityRole').value;
    if (!name) { message('お名前・会社名を入力してください。'); return; }
    if (!uniform && !q('#identityConsent').checked) { message('本人の了承を確認してチェックを入れてください。'); return; }
    if (!singleFace()) { message('カメラを開始し、1人で顔を写してください。'); return; }
    setBusy(true); reset(); const own = epoch;
    try {
      // Wait for the current inference to release its shared snapshot canvas.
      while (busy) { await delay(100); if (own !== epoch) return; }
      message('登録の準備中…初回は識別モデルを読み込みます。');
      if (!uniform) await ensureApi();
      const captured = [];
      for (let i = 0; i < 3; i++) {
        if (own !== epoch || !dialog.open) return;
        message(`${i === 0 ? '正面を向いてください' : i === 1 ? '少しだけ右を向いてください' : '少しだけ左を向いてください'}（${i + 1}/3）`);
        await delay(1000);
        if (own !== epoch || !dialog.open || !singleFace()) throw new Error('カメラには1人だけ、顔を十分大きく写してください。');
        const v = uniform ? snapshot(true) : await descriptor();
        if (own !== epoch || !dialog.open) return;
        if (!v) throw new Error(uniform ? '胸からお腹までカメラに入るよう、少し離れてください。' : '顔を取り込めません。明るい場所でカメラに近づいてください。');
        if (uniform && Math.hypot(...v.slice(0, 16)) < 0.25) throw new Error('白・グレー・黒だけの服装は判別しにくいため、顔を「配達」で登録するか「配達受付」をご利用ください。');
        if (!uniform && captured[0] && Math.hypot(...v.map((x, j) => x - captured[0][j])) > 0.5) throw new Error('撮影中の顔が安定しませんでした。同じ方で登録し直してください。');
        captured.push(v);
      }
      const key = uniform ? 'uniforms' : 'people', vectors = uniform ? 'signatures' : 'descriptors';
      const previous = db[key].find(p => p.name === name);
      if (!previous && db[key].length >= 100) throw new Error('登録は100件までです。不要な登録を削除してください。');
      const entry = { id: previous?.id || crypto.randomUUID(), name, role: uniform ? 'delivery' : role,
        [vectors]: [...(previous?.[vectors] || []), ...captured].slice(-12) };
      const next = { ...db, [key]: [...db[key].filter(p => p.id !== entry.id), entry] };
      save(next); render(); message(`${name}を${uniform ? '配達の制服' : ROLES[role]}として登録しました。画面を閉じると照合を再開します。`);
    } catch (error) { if (dialog.open) message(error.name === 'QuotaExceededError' || error.name === 'SecurityError' ? 'このブラウザに保存できませんでした。保存設定をご確認ください。' : error.message || '登録できませんでした。もう一度お試しください。'); }
    finally { setBusy(false); }
  }
  function render() {
    const list = q('[data-list]'); list.replaceChildren();
    for (const key of ['people', 'uniforms']) for (const p of db[key]) {
      const li = document.createElement('li'), label = document.createElement('span');
      label.textContent = `${key === 'people' ? '顔' : '制服'}：${p.name}`; li.append(label);
      if (key === 'people') {
        const select = document.createElement('select'); select.setAttribute('aria-label', `${p.name}の区分`);
        for (const [value, label] of Object.entries(ROLES)) select.add(new Option(label, value));
        select.value = p.role;
        select.addEventListener('change', () => {
          try { save({ ...db, people: db.people.map(x => x.id === p.id ? { ...x, role: select.value } : x) }); message('区分を更新しました。'); }
          catch { select.value = p.role; message('区分を保存できませんでした。'); }
        }); li.append(select);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '削除';
      remove.addEventListener('click', () => {
        if (!confirm(`${p.name}の${key === 'people' ? '顔' : '制服'}登録を削除しますか？`)) return;
        try { save({ ...db, [key]: db[key].filter(x => x.id !== p.id) }); render(); message('登録を削除しました。'); }
        catch { message('削除内容を保存できませんでした。'); }
      }); li.append(remove); list.append(li);
    }
    if (!list.children.length) { const li = document.createElement('li'); li.textContent = 'まだ登録がありません'; list.append(li); }
  }
  async function scan() {
    if (busy || capturing || stopped || dialog.open || document.hidden) return;
    if (!singleFace()) { live.textContent = faces.length > 1 ? '複数人のため個人の識別を保留' : '顔・配達の登録から識別を設定できます'; return; }
    if (!db.people.length && !db.uniforms.length) { live.textContent = '未登録の来訪者'; return; }
    busy = true; const own = epoch;
    try {
      let result = null;
      if (db.people.length && Date.now() >= retryAt) {
        try { const v = await descriptor(); if (v) result = matchFace(v, db.people); }
        catch { modelError = true; }
      }
      if (own !== epoch || !singleFace()) return;
      if (!result && db.uniforms.length) result = matchClothing(snapshot(true), db.uniforms);
      const next = result ? `${result.source}:${result.id}` : '';
      hits = next && next === candidate ? hits + 1 : next ? 1 : 0; candidate = next;
      identity = hits >= 3 ? result : null; identityAt = Date.now();
      live.textContent = identity ? identity.source === 'clothing' ? '配達の可能性（登録制服に類似）' : `${ROLES[identity.role]}：${identity.name}`
        : modelError ? '顔の識別を準備できません・通常受付中' : next ? '登録情報を照合中…' : '未登録・照合できない来訪者';
    } finally { busy = false; }
  }
  const timer = setInterval(() => { scan().catch(() => { reset(); live.textContent = '識別できません・通常受付中'; }); }, 800);
  live.textContent = '顔・配達の登録から識別を設定できます';
  return {
    get paused() { return dialog.open; },
    updateFaces(next) {
      if (next.length !== 1 || faces.length !== 1) reset();
      faces = next; facesAt = Date.now();
    },
    current() { return !dialog.open && singleFace() && Date.now() - identityAt < 1800 ? identity : null; },
    async identify() {
      if (!db.people.length && !db.uniforms.length) return null;
      const own = epoch, deadline = Date.now() + 2400;
      while (own === epoch && singleFace() && !dialog.open && Date.now() < deadline) {
        if (identity && Date.now() - identityAt < 1800) return identity;
        if (modelError && !db.uniforms.length) return null;
        await delay(100);
      }
      return null;
    },
    reset() { faces = []; facesAt = 0; reset(); },
    destroy() { stopped = true; clearInterval(timer); reset(); },
  };
}

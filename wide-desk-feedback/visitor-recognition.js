import { ROLES, validVector, matchFace, clothingSignature, matchClothing } from './visitor-matching.mjs?v=20260909-2';
import { previewName, cancelNameVoice } from './name-voice.js?v=20260911-devicevoice-1';
import { nameApprovalToken, isNameApproved, createNameAudition, shouldCallName, hasNameReading } from './name-confirmation.mjs?v=20260911-devicevoice-1';
import { NAME_RECORDINGS, normalizeNameReading } from './name-library.mjs?v=20260911-devicevoice-1';
import { bindNameAvailability } from './name-availability.mjs?v=20260911-devicevoice-1';
import { registrationName, restoreRegistrationName, validateRegistrationName } from './registration-name.mjs?v=20260911-fullname-1';
import { detectFaces, faceQuality, FACE_DETECTION_OPTIONS, FACE_DESCRIPTOR_OPTIONS } from './face-detection.mjs?v=20260915-auto-region-1';

import { cameraRegion, REGION_MODES, REGION_LABELS, createAutoRegion, frameLifetime } from './camera-region.mjs?v=20260915-auto-region-1';
import { captureDirection, mirroredRegionLeft, createShutterSound } from './enrollment-feedback.mjs';
import { bindReadingAutofill } from './reading-autofill.mjs';
import { captureProblem, faceMoved, CAPTURE_STABLE_MS, CAPTURE_TURN_MS } from './capture-guidance.mjs';
import { createDetectionOverlay } from './detection-overlay.mjs';
const STORAGE_KEY = 'tsunagu-feedback-identities-v1';
const REGION_KEY = 'tsunagu-feedback-camera-region-v2';
const API_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createVisitorRecognition({ video, panel, onRegistrationChange, onDelivery }) {
  let db = { people: [], uniforms: [] }, storageError = false;
  try { db = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tsunagu-preview-identities-v2') || localStorage.getItem('tsunagu-desk-identities-v1') || '{}')); }
  catch { storageError = true; }
  let faces = [], facesAt = 0, epoch = 0, apiPromise = null, busy = false;
  let candidate = '', hits = 0, identity = null, identityAt = 0, capturing = false, stopped = false;
  let modelError = false, retryAt = 0;
  const canvas = document.createElement('canvas');
  const descriptorFrame = document.createElement('canvas');
  const lightFrame = document.createElement('canvas'); lightFrame.width = 32; lightFrame.height = 24;
  const detectionCanvases = { frame: document.createElement('canvas'), tile: document.createElement('canvas') };
  let detectionMs = 0, descriptorMissing = false, lastSampleFrame = 0;
  let peopleCount = 0;
  let regionMode = 'auto', regionEpoch = 0, instructionAudio = null;
  const autoRegion = createAutoRegion();
  const shutter = createShutterSound();
  try { const saved = localStorage.getItem(REGION_KEY); if (REGION_MODES.includes(saved)) regionMode = saved; } catch {}
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
    <p class="identity-intro">本人の了承を得て登録してください。写真は保存せず、顔の特徴量と名前はこのブラウザ内だけに保存します。</p>
    <div class="identity-workspace"><section class="identity-camera-column" aria-label="撮影">
    <div class="enrollment-stage">
      <div class="enrollment-camera"><video class="identity-preview" autoplay muted playsinline aria-label="登録用カメラ映像（鏡と同じ向き）"></video><div class="enrollment-region" aria-hidden="true"></div><div class="capture-direction" hidden><span data-direction-arrow aria-hidden="true"></span><span data-direction-label></span></div></div>
      <div class="identity-actions capture-actions"><button type="button" data-face>写真を撮る（3回撮影）</button><button type="button" data-cancel-capture hidden>撮影を中止</button></div>
      <label class="identity-consent capture-sound"><input data-shutter type="checkbox" checked>撮影できたらシャッター音を鳴らす</label>
      <ol class="enrollment-steps"><li>1 正面</li><li>2 ご自身の右</li><li>3 ご自身の左</li></ol>
      <strong data-capture-guide role="status">3段階で撮影します</strong>
      <div data-capture-state aria-live="polite"></div><p data-quality role="status" aria-live="polite"></p>
    </div>
    <label>カメラの検知範囲<select data-region><option value="auto">自動（おすすめ）</option><option value="full">画面全体</option><option value="center70">中央70％</option><option value="center50">中央50％</option><option value="right">映像の左半分</option><option value="left">映像の右半分</option></select></label>
    <p class="identity-note camera-tip" data-region-status role="status" aria-live="polite"></p>
    <label class="identity-consent"><input data-guide-voice type="checkbox" checked>撮影の指示を音声でも案内する</label>
    </section><section class="identity-form-column" aria-label="名前と区分の登録">
    <div class="identity-meta-grid">
    <label>名前の登録方法<select id="identityNameMode"><option value="surname">名字だけ</option><option value="given">名前だけ</option><option value="full">名字＋名前（フルネーム）</option><option value="legacy">以前の形式・会社名</option></select></label>
    <label>区分<select id="identityRole"><option value="employee">社員</option><option value="guest">お客様</option><option value="delivery">配達</option></select></label>
    </div>
    <p class="identity-note field-tip">「さん」は自動で付きます。フルネームは名字と名前を分けて入力します。</p>
    <div class="identity-name-grid">
      <div><label><span data-first-name-label>名字</span><input id="identityName" maxlength="40" autocomplete="off" aria-describedby="nameAvailability" placeholder="例：山田"></label>
      <label><span data-first-reading-label>名字の読みがな</span><input id="identityReading" list="recordedNameReadings" maxlength="40" autocomplete="off" aria-describedby="nameAvailability readingHint" placeholder="例：やまだ"></label><div class="reading-assist"><small id="readingHint"></small><select data-reading-choice aria-label="名字・名前の読み候補" hidden></select></div></div>
      <div data-given-fields hidden><label>名前<input id="identityGivenName" maxlength="40" autocomplete="off" aria-describedby="nameAvailability" placeholder="例：太郎"></label>
      <label>名前の読みがな<input id="identityGivenReading" list="recordedGivenReadings" maxlength="40" autocomplete="off" aria-describedby="nameAvailability givenReadingHint" placeholder="例：たろう"></label><div class="reading-assist"><small id="givenReadingHint"></small><select data-given-choice aria-label="名前の読み候補" hidden></select></div></div>
    </div>
    <datalist id="recordedNameReadings"></datalist>
    <datalist id="recordedGivenReadings"></datalist>
    <div id="nameAvailability" class="name-availability" data-voice-type data-state="empty" role="status" aria-live="polite" aria-atomic="true"><strong data-availability-title>名字・名前の収録チェック</strong><p data-availability-detail>名前または読みがなを入力すると、自動で確認します。</p></div>
    <div class="identity-voice-options">
    <button type="button" data-test-name>名前を試聴（任意）</button>
    <label class="identity-consent"><input id="identityCallName" type="checkbox" checked>顔認証で名前を呼ぶ</label>
    </div>
    <p class="identity-note" data-name-state>試聴は任意です。呼びたくない場合はチェックを外してください。</p>
    <label class="identity-consent"><input id="identityConsent" type="checkbox">本人から顔登録の了承を得ています</label>
    <div class="identity-actions identity-secondary"><button type="button" data-back-camera>入力が終わったら撮影画面へ</button><button type="button" data-uniform>配達の制服を登録</button><button type="button" data-save-name>名前設定を保存</button><button type="button" data-new-name>別の人を新規登録</button></div>
    <p data-message role="status"></p>
    </section></div>
    <div class="identity-reference"><details><summary>登録済みの一覧・以前の登録を取り込む</summary>
    <ul data-list></ul>
    <button type="button" data-import>以前の顔登録を取り込む</button>
    <p class="identity-note">同じ公開サイト・ブラウザにある以前の登録を取り込みます。現在の同名・同IDの登録は上書きしません。別端末・ブラウザへは同期されません。</p>
    </details><details><summary>音声・写真・登録についての詳しい説明</summary>
    <p class="identity-note">登録中は自動の挨拶を休止します。写真・映像は保存・送信しません。画面に映った顔と実際の人を完全に区別する機能ではありません。</p>
    <p class="identity-note">顔で本人と照合できたら、社員・お客様・配達のどの区分でも登録名で呼びます。名字5,000種類・名前5,000種類分の春日部つむぎ音声を用意しています。未収録の場合は入力した読みがなを以前のAI音声で名前全体として読み上げます。読み方が分かれそうな漢字は読みがなを入力してください。</p>
    <p class="identity-note">制服は胸からお腹まで写してください。色が似た服でも反応するため「配達の可能性」として扱います。判断できない場合はカメラ欄の「配達受付」を使えます。</p>
    <p class="identity-note">同じ名前でもう一度撮影すると顔のサンプルを追加できます。普段使う距離・明るさでも追加してください。この改善確認版の変更は元ページの登録には反映されません。初回は元ページの登録を読み込みます。</p>
    </details></div>`;
  document.body.append(dialog);
  const q = s => dialog.querySelector(s);
  const overlays = [createDetectionOverlay(video), createDetectionOverlay(q('.identity-preview'))];
  let bodyBoxes = [];
  const detectionLegend = document.createElement('span'); detectionLegend.className = 'detection-legend';
  detectionLegend.textContent = '検出枠：青＝顔／橙＝人の姿';
  panel.querySelector('.camera-info').append(detectionLegend);
  const note = document.createElement('p'); note.className = 'identity-note camera-tip';
  note.textContent = '青枠＝顔／橙枠＝人の姿。番号は場所の目印です。同じ人に両方の枠が付きます。枠は本人確認済みの意味ではありません。';
  q('[data-region-status]').after(note);
  function drawDetections() {
    overlays.forEach(o => o.update(faces, bodyBoxes));
    detectionLegend.textContent = `検出枠：青＝顔 ${faces.length}／橙＝姿 ${bodyBoxes.length}`;
  }
  q('[data-region]').value = regionMode;
  const effectiveRegion = () => regionMode === 'auto' ? autoRegion.mode : regionMode;
  const region = () => cameraRegion(video.videoWidth, video.videoHeight, effectiveRegion());
  function showRegion() {
    const area = cameraRegion(100, 100, effectiveRegion()), box = q('.enrollment-region');
    box.style.left = `${mirroredRegionLeft(area)}%`; box.style.width = `${area.width}%`;
    const text = regionMode === 'auto' ? `自動：${REGION_LABELS[autoRegion.mode]}。顔の位置に合わせて調整し、範囲外も確認します。`
      : '手動設定中です。緑枠に1人で写り、背景のモニターを避けてください。';
    if (q('[data-region-status]').textContent !== text) q('[data-region-status]').textContent = text;
  }
  showRegion();
  q('[data-region]').addEventListener('change', () => {
    regionMode = q('[data-region]').value; autoRegion.reset(); regionEpoch++; faces = []; peopleCount = 0; bodyBoxes = []; overlays.forEach(o=>o.clear()); reset(); showRegion();
    try { localStorage.setItem(REGION_KEY, regionMode); } catch { message('検知範囲はこの画面を開いている間だけ有効です。保存設定をご確認ください。'); }
  });
  function stopInstruction() { if (instructionAudio) { instructionAudio.pause(); instructionAudio.dispatchEvent(new Event('ended')); instructionAudio = null; } }
  async function guideVoice(key) {
    stopInstruction();
    if (!q('[data-guide-voice]').checked) return;
    const audio = new Audio(new URL(`./audio/${key}.wav?v=20260915-guided-sequence-1`, import.meta.url)); instructionAudio = audio;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 15000);
      const done = () => { clearTimeout(timer); resolve(); };
      audio.addEventListener('ended', done, { once: true }); audio.addEventListener('error', done, { once: true });
      audio.play().catch(done);
    });
    if (instructionAudio === audio) instructionAudio = null;
  }
  // Bound DOM work for the large bank. Audio is still loaded only when selected.
  function refreshReadingSuggestions() {
    for (const [input, list] of [['#identityReading', '#recordedNameReadings'], ['#identityGivenReading', '#recordedGivenReadings']]) {
      const prefix = normalizeNameReading(q(input).value);
      const options = document.createDocumentFragment();
      let count = 0;
      for (const entry of NAME_RECORDINGS) {
        if (!entry.reading.startsWith(prefix)) continue;
        const option = document.createElement('option'); option.value = entry.reading;
        option.label = entry.names.slice(0, 5).join('・'); options.append(option);
        if (++count >= 80) break;
      }
      q(list).replaceChildren(options);
    }
  }
  q('#identityReading').addEventListener('input', refreshReadingSuggestions);
  q('#identityGivenReading').addEventListener('input', refreshReadingSuggestions);
  refreshReadingSuggestions();
  const message = text => { q('[data-message]').textContent = text; if (!capturing) q('[data-quality]').textContent = text; };
  const audition = createNameAudition(); let auditionId = 0;
  let editingId = null;
  const formPerson = () => registrationName(q('#identityNameMode').value, q('#identityName').value, q('#identityReading').value, q('#identityGivenName').value, q('#identityGivenReading').value);
  const refreshVoiceType = bindNameAvailability({ nameInput: q('#identityName'), readingInput: q('#identityReading'), additionalInputs: [q('#identityGivenName'), q('#identityGivenReading'), q('#identityNameMode')], getPerson: formPerson, panel: q('[data-voice-type]') });
  function refreshNameMode() {
    const mode = q('#identityNameMode').value;
    q('[data-given-fields]').hidden = mode !== 'full';
    q('.identity-name-grid').classList.toggle('is-full', mode === 'full');
    q('[data-first-name-label]').textContent = mode === 'given' ? '名前' : mode === 'legacy' ? 'お名前・会社名（以前の形式）' : '名字';
    q('[data-first-reading-label]').textContent = mode === 'given' ? '名前の読みがな' : mode === 'legacy' ? '読みがな（全体）' : '名字の読みがな';
    q('#identityName').placeholder = mode === 'given' ? '例：太郎' : mode === 'legacy' ? '例：ヤマト／以前の登録名' : '例：山田';
    q('#identityReading').placeholder = mode === 'given' ? '例：たろう' : mode === 'legacy' ? '例：やまと' : '例：やまだ';
    firstAutofill.refresh(); givenAutofill.refresh();
    clearAudition(); refreshReadingSuggestions();
  }
  function editPerson(p) {
    const saved = restoreRegistrationName(p);
    editingId = p.id;
    q('#identityNameMode').value = saved.nameMode;
    q('#identityName').value = saved.nameParts?.[0].name ?? saved.name;
    q('#identityReading').value = saved.nameParts?.[0].reading ?? saved.reading;
    q('#identityGivenName').value = saved.nameParts?.[1]?.name || '';
    q('#identityGivenReading').value = saved.nameParts?.[1]?.reading || '';
    q('#identityRole').value = p.role; q('#identityCallName').checked = shouldCallName(p);
    firstAutofill.adopt(); givenAutofill.adopt();
    refreshNameMode();
  }
  q('#identityNameMode').addEventListener('change', refreshNameMode);
  q('[data-new-name]').addEventListener('click', () => {
    editingId = null;
    for (const id of ['#identityName', '#identityReading', '#identityGivenName', '#identityGivenReading']) q(id).value = '';
    q('#identityNameMode').value = 'surname'; q('#identityConsent').checked = false; q('#identityCallName').checked = true;
    firstAutofill.adopt(); givenAutofill.adopt();
    refreshNameMode(); message('新しい方の名字・名前を入力してください。'); q('#identityName').focus();
  });
  function refreshApproval() {
    q('#identityCallName').disabled = capturing;
  }
  function clearAudition() {
    auditionId++; cancelNameVoice(); audition.clear();
    q('[data-test-name]').disabled = capturing;
    q('[data-name-state]').textContent = '名前・読みがなを保存すると、顔認証後に名前を呼びます。試聴は任意です。';
    refreshApproval();
    refreshVoiceType();
  }
  function approvalForForm() {
    return audition.canApprove(formPerson()) ? nameApprovalToken(formPerson()) : '';
  }
  const firstAutofill = bindReadingAutofill({ name: q('#identityName'), reading: q('#identityReading'), hint: q('#readingHint'), choice: q('[data-reading-choice]'), category: () => q('#identityNameMode').value === 'given' ? 'given' : 'surname', onChange() { clearAudition(); refreshReadingSuggestions(); } });
  const givenAutofill = bindReadingAutofill({ name: q('#identityGivenName'), reading: q('#identityGivenReading'), hint: q('#givenReadingHint'), choice: q('[data-given-choice]'), category: () => 'given', onChange() { clearAudition(); refreshReadingSuggestions(); } });
  q('#identityReading').addEventListener('input', clearAudition);
  q('#identityGivenName').addEventListener('input', clearAudition);
  q('#identityGivenReading').addEventListener('input', clearAudition);
  q('#identityName').addEventListener('input', () => {
    const p = db.people.find(p => editingId ? p.id === editingId : p.name === formPerson().name);
    q('#identityCallName').checked = p ? shouldCallName(p) : true;
    clearAudition();
  });
  const setBusy = value => {
    capturing = value;
    dialog.querySelectorAll('input, select, button:not([data-close]):not([data-cancel-capture])').forEach(el => { el.disabled = value; });
    q('[data-cancel-capture]').hidden = !value;
    q('[data-cancel-capture]').disabled = false;
    refreshApproval();
  };
  open.addEventListener('click', () => {
    reset(); dialog.showModal(); onRegistrationChange(true); render(); refreshVoiceType();
    q('video').srcObject = video.srcObject;
    q('video').play().catch(() => {});
    q('[data-capture-guide]').textContent = '正面・右・左の順に撮影します';
    q('[data-capture-state]').textContent = '';
    q('[data-quality]').dataset.level = '';
    q('.enrollment-steps').querySelectorAll('li').forEach(el => { el.dataset.state = 'next'; });
    message(storageError ? '保存データを読み込めませんでした。登録内容を確認してください。' : '顔を正面から写して登録してください。');
  });
  q('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { shutter.close(); q('.capture-direction').hidden = true; stopInstruction(); clearAudition(); q('video').srcObject = null; reset(); onRegistrationChange(false); });
  q('[data-face]').addEventListener('click', () => { if (q('[data-shutter]').checked) shutter.unlock(); register(false); });
  q('[data-uniform]').addEventListener('click', () => { if (q('[data-shutter]').checked) shutter.unlock(); register(true); });
  q('[data-cancel-capture]').addEventListener('click', () => {
    epoch++; stopInstruction(); q('[data-cancel-capture]').disabled = true;
    q('[data-capture-guide]').textContent = '撮影を中止しました'; q('[data-capture-state]').textContent = '';
    q('[data-quality]').dataset.level = ''; q('[data-quality]').textContent = '今回の撮影分は保存していません。設定を直して撮り直せます。';
    message('撮影を中止しました。設定を直して撮り直せます。');
  });
  q('[data-back-camera]').addEventListener('click', () => { q('.enrollment-stage').scrollIntoView({ block: 'start', behavior: 'smooth' }); q('[data-face]').focus({ preventScroll: true }); });
  q('[data-save-name]').addEventListener('click', async () => {
    const p = db.people.find(p => editingId ? p.id === editingId : p.name === formPerson().name);
    if (!p) { message('一覧の「名前・読みがな」を押すか、先に顔を登録してください。'); return; }
    setBusy(true);
    try {
      const nameAudioApproval = approvalForForm();
      const person = formPerson(), nameCallingEnabled = q('#identityCallName').checked;
      validateRegistrationName(person);
      if (db.people.some(x => x.id !== p.id && x.name === person.name)) throw new Error('同じ名前の別の登録があります。一覧を確認してください。');
      if (nameCallingEnabled && !hasNameReading(person)) throw new Error('名前を呼ぶには、ひらがなで読みがなを入力してください。');
      if (!dialog.open) return;
      save({ ...db, people: db.people.map(x => x.id === p.id ? { ...x, ...person, nameParts: person.nameParts, nameAudioApproval, nameCallingEnabled } : x) });
      editingId = p.id;
      render(); message(nameCallingEnabled ? '名前呼びONで保存しました。顔認証したら名前を呼んでから挨拶します。' : '名前呼びOFFで保存しました。名前を呼ばずに挨拶します。');
    } catch (error) { message(error.message || '保存できませんでした。'); }
    finally { setBusy(false); }
  });
  q('[data-test-name]').addEventListener('click', async () => {
    const name = formPerson().name;
    if (!name) { message('お名前を入力してください。'); return; }
    clearAudition(); const own = auditionId, person = formPerson();
    q('[data-test-name]').disabled = true;
    try {
      message('名前の音声を準備しています…');
      const completed = await previewName(person);
      if (!completed || own !== auditionId || !dialog.open) return;
      audition.completed(person); refreshApproval();
      q('[data-name-state]').textContent = '試聴が終わりました。変更した名前・読みがなは保存してください。確認チェックの操作は不要です。';
      message('試聴が終わりました。発音をご確認ください。');
    } catch (error) { if (own === auditionId) message(error.message || '音声を再生できません。読みがなと通信状態をご確認ください。'); }
    finally { if (own === auditionId) q('[data-test-name]').disabled = false; }
  });
  q('[data-import]').addEventListener('click', () => {
    try {
      const old = JSON.parse(localStorage.getItem('tsunagu-face-db-v3') || '[]');
      if (!Array.isArray(old)) throw new Error();
      const previous = sanitize(JSON.parse(localStorage.getItem('tsunagu-preview-identities-v2') || localStorage.getItem('tsunagu-desk-identities-v1') || '{}'));
      const ancient = sanitize({ people: old.map(p => ({ ...p, id: crypto.randomUUID(), role: 'guest' })) });
      const next = { people: [...db.people], uniforms: [...db.uniforms] };
      let added = 0;
      for (const key of ['people', 'uniforms']) for (const person of [...previous[key], ...ancient[key]]) {
        if (next[key].length >= 100 || next[key].some(p => p.id === person.id || p.name === person.name)) continue;
        next[key].push(person); added++;
      }
      if (!added) { message('取り込める旧登録がありません。同じ公開サイト・ブラウザでご確認ください。'); return; }
      save(next); render(); message(`${added}件を取り込みました。一覧で区分と読みがなを確認してください。`);
    } catch { message('旧登録を読み込めないか、保存できませんでした。ブラウザの保存設定をご確認ください。'); }
  });

  function sanitize(value) {
    const read = (items, key, n) => (Array.isArray(items) ? items : []).filter(p => p && typeof p.name === 'string' && p.name.trim() && Array.isArray(p[key]))
      .map(p => ({ id: typeof p.id === 'string' ? p.id : crypto.randomUUID(), ...restoreRegistrationName(p),
        role: ROLES[p.role] ? p.role : 'guest', nameCallingEnabled: p.nameCallingEnabled !== false, nameAudioApproval: typeof p.nameAudioApproval === 'string' ? p.nameAudioApproval.slice(0, 400) : '', [key]: p[key].filter(v => validVector(v, n)).slice(-12) }))
      .filter(p => p[key].length).slice(0, 100);
    return { people: read(value?.people, 'descriptors', 128), uniforms: read(value?.uniforms, 'signatures', 19) };
  }
  function save(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    db = next; storageError = false; reset();
  }
  function reset() { epoch++; identity = null; identityAt = 0; candidate = ''; hits = 0; lastSampleFrame = 0; }
  function singleFace() { return peopleCount <= 1 && faceQuality(faces, video.videoWidth, video.videoHeight).usable && Date.now() - facesAt < frameLifetime(detectionMs) && video.readyState >= 2 && video.videoWidth > 0; }
  function captureIssue(stepStartedAt = 0, moved = false) {
    let light = null;
    if (descriptorFrame.width && descriptorFrame.height) {
      try {
        const b = faces.length === 1 ? faces[0].boundingBox : null, area = region();
        const x = b?.originX ?? area.x, y = b?.originY ?? area.y;
        const ctx = lightFrame.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(descriptorFrame, x, y, b?.width ?? area.width, b?.height ?? area.height, 0, 0, 32, 24);
        const pixels = ctx.getImageData(0, 0, 32, 24).data;
        let sum = 0; for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
        light = sum / (pixels.length / 4);
      } catch { /* Brightness is an advisory; do not guess when pixels are unavailable. */ }
    }
    return captureProblem({ ready: video.readyState >= 2 && video.videoWidth > 0, modelError, faces, people: peopleCount, age: Date.now() - facesAt, lifetime: frameLifetime(detectionMs), fresh: facesAt >= stepStartedAt, light, moved });
  }
  function showCaptureIssue(issue) {
    const state = issue ? '撮影を待っています' : 'その向きで少し止まってください';
    if (q('[data-capture-state]').textContent !== state) q('[data-capture-state]').textContent = state;
    q('[data-quality]').dataset.level = issue ? 'problem' : 'ready';
    const detail = issue?.text || '顔を確認できました。自動で撮影します。';
    if (q('[data-quality]').textContent !== detail) q('[data-quality]').textContent = detail;
  }
  function snapshot(uniform = false) {
    if (!singleFace()) return null;
    const b = faces[0].boundingBox;
    if (!b || b.width < 40 || b.height < 40) return null;
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
    ctx.drawImage(descriptorFrame, x, y, w, h, 0, 0, canvas.width, canvas.height);
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
    descriptorMissing = !crop;
    if (!crop) return null;
    const options = new api.TinyFaceDetectorOptions(FACE_DESCRIPTOR_OPTIONS);
    let results = await api.detectAllFaces(crop, options).withFaceLandmarks().withFaceDescriptors();
    if (!results.length && singleFace()) {
      // Do not fall back to the full live frame: it may include a monitor outside the selected region.
      results = await api.detectAllFaces(crop, new api.TinyFaceDetectorOptions({ ...FACE_DESCRIPTOR_OPTIONS, inputSize: FACE_DETECTION_OPTIONS.inputSize })).withFaceLandmarks().withFaceDescriptors();
    }
    descriptorMissing = results.length !== 1;
    modelError = false;
    return !descriptorMissing ? Array.from(results[0].descriptor) : null;
  }
  async function register(uniform) {
    const person = formPerson(), name = person.name, role = q('#identityRole').value;
    try { validateRegistrationName(person); } catch (error) { message(error.message); q('[data-capture-guide]').textContent = error.message; q('#identityName').focus(); return; }
    if (!name) { message('お名前・会社名を入力してください。'); return; }
    if (!uniform && !q('#identityConsent').checked) { message('本人の了承を確認してチェックを入れてください。'); q('#identityConsent').focus(); return; }
    if (video.readyState < 2 || !video.videoWidth) { message('カメラを開始してから撮影してください。'); return; }
    setBusy(true); reset(); const own = epoch;
    try {
      if (!uniform && q('#identityCallName').checked && !hasNameReading(person)) throw new Error('名前を呼ぶには、ひらがなで読みがなを入力してください。');
      // Wait for the current inference to release its shared snapshot canvas.
      while (busy) { await delay(100); if (own !== epoch) return; }
      message('登録の準備中…初回は識別モデルを読み込みます。');
      q('[data-capture-state]').textContent = '撮影を準備しています';
      q('[data-quality]').dataset.level = '';
      q('[data-quality]').textContent = '初回は顔の検出モデルを読み込みます。そのままお待ちください。';
      if (!uniform) await ensureApi();
      q('.enrollment-stage').scrollIntoView({ block: 'start', behavior: 'smooth' });
      const captured = [];
      for (let i = 0; i < 3; i++) {
        if (own !== epoch || !dialog.open) return;
        const instruction = uniform ? '胸からお腹まで、正面で写してください' : ['正面を向いてください', '次は右を向いてください', '最後に左を向いてください'][i];
        const direction = captureDirection(i, uniform);
        q('.capture-direction').hidden = false;
        q('[data-direction-arrow]').textContent = direction.arrow;
        q('[data-direction-label]').textContent = direction.label;
        q('[data-capture-guide]').textContent = `${i + 1} / 3　${instruction}`;
        q('.enrollment-steps').querySelectorAll('li').forEach((el, j) => { el.dataset.state = j < i ? 'done' : j === i ? 'current' : 'next'; });
        message(instruction);
        const stepStartedAt = Date.now();
        // Spoken direction finishes before validated capture and shutter. No countdown.
        let guidanceDone = uniform;
        if (!uniform) guideVoice(['enrollFrontCue', 'enrollRightCue', 'enrollLeftCue'][i]).finally(() => { guidanceDone = true; });
        if (own !== epoch || !dialog.open) return;
        // Keep quality checks and a short settling interval, with an actionable reason for waiting.
        const deadline = Date.now() + 20000;
        let stableSince = 0, lastBox = null, lastFrame = 0, freshFrames = 0, lastIssue = null, lightCheckedAt = 0, currentIssue = null;
        while (Date.now() < deadline && own === epoch && dialog.open) {
          const newFrame = facesAt !== lastFrame;
          const box = faces[0]?.boundingBox;
          const moved = newFrame && faceMoved(lastBox, box);
          if (newFrame || Date.now() - lightCheckedAt > 300) { currentIssue = captureIssue(stepStartedAt, moved); lightCheckedAt = Date.now(); }
          if (newFrame) { lastFrame = facesAt; lastBox = box ? { ...box } : null; }
          if (currentIssue) {
            stableSince = 0; freshFrames = 0; lastIssue = currentIssue;
          } else {
            stableSince ||= Date.now();
            if (newFrame) freshFrames++;
            lastIssue = null;
            if (Date.now() - stableSince >= CAPTURE_STABLE_MS && Date.now() - stepStartedAt >= CAPTURE_TURN_MS && freshFrames >= 2 && guidanceDone) break;
          }
          showCaptureIssue(currentIssue);
          await delay(100);
        }
        if (own !== epoch || !dialog.open) return;
        if (lastIssue || !singleFace() || !stableSince || Date.now() - stableSince < CAPTURE_STABLE_MS || freshFrames < 2 || !guidanceDone) throw new Error((lastIssue?.text || '顔を安定して確認できませんでした。顔を正面寄りにして少し止まってください。') + ' 修正後に「写真を撮る」を押してください。まだ保存していません。');
        q('[data-capture-state]').textContent = '撮影中';
        q('[data-quality]').textContent = '顔の特徴を確認しています。';
        let v = uniform ? snapshot(true) : await descriptor();
        for (let retry = 0; !v && !uniform && retry < 3 && own === epoch && dialog.open; retry++) { await delay(400); v = await descriptor(); }
        if (own !== epoch || !dialog.open) return;
        if (!v) throw new Error(uniform ? '胸からお腹までカメラに入るよう、少し離れてください。' : '顔は見つかりましたが、特徴を読み取れません。顔を正面寄りに戻し、両目が見える状態で撮り直してください。');
        if (uniform && Math.hypot(...v.slice(0, 16)) < 0.25) throw new Error('白・グレー・黒だけの服装は判別しにくいため、顔を「配達」で登録するか「配達受付」をご利用ください。');
        if (!uniform && captured[0] && Math.hypot(...v.map((x, j) => x - captured[0][j])) > 0.5) throw new Error('撮影中の顔が安定しませんでした。同じ方で登録し直してください。');
        captured.push(v);
        if (q('[data-shutter]').checked) shutter.play();
        q('[data-capture-state]').textContent = '✓ 撮影できました';
        q('.enrollment-steps').children[i].dataset.state = 'done';
        await delay(180);
      }
      const key = uniform ? 'uniforms' : 'people', vectors = uniform ? 'signatures' : 'descriptors';
      const previous = db[key].find(p => !uniform && editingId ? p.id === editingId : p.name === name);
      if (db[key].some(p => p.name === name && p.id !== previous?.id)) throw new Error('同じ名前の別の登録があります。一覧を確認してください。');
      if (!previous && db[key].length >= 100) throw new Error('登録は100件までです。不要な登録を削除してください。');
      const entry = { id: previous?.id || crypto.randomUUID(), ...person, role: uniform ? 'delivery' : role, nameCallingEnabled: !uniform && q('#identityCallName').checked, nameAudioApproval: uniform ? '' : approvalForForm(),
        [vectors]: [...(previous?.[vectors] || []), ...captured].slice(-12) };
      const next = { ...db, [key]: [...db[key].filter(p => p.id !== entry.id), entry] };
      if (!uniform) editingId = entry.id;
      save(next); render(); message(`${name}を${uniform ? '配達の制服' : ROLES[role]}として登録しました。${uniform ? '制服だけでは個人名は呼びません。' : entry.nameCallingEnabled ? '顔認証したら名前を呼んでから挨拶します。' : '名前呼びはOFFです。'}画面を閉じると照合を再開します。`);
      q('[data-capture-guide]').textContent = '3 / 3　登録が完了しました';
      q('[data-quality]').textContent = '撮影は完了です。画面を閉じると受付に戻ります。';
      q('[data-quality]').dataset.level = 'ready';
    } catch (error) { if (dialog.open) { q('[data-capture-guide]').textContent = '登録できませんでした'; q('[data-capture-state]').textContent = ''; q('[data-quality]').dataset.level = 'problem'; const detail = error.name === 'QuotaExceededError' || error.name === 'SecurityError' ? 'このブラウザに保存できませんでした。保存設定をご確認ください。' : error.message || '登録できませんでした。もう一度お試しください。'; q('[data-quality]').textContent = detail; message(detail); } }
    finally { q('.capture-direction').hidden = true; stopInstruction(); setBusy(false); }
  }
  function render() {
    const list = q('[data-list]'); list.replaceChildren();
    for (const key of ['people', 'uniforms']) for (const p of db[key]) {
      const li = document.createElement('li'), label = document.createElement('span');
      label.textContent = `${key === 'people' ? '顔' : '制服'}：${p.name}${key === 'people' ? !shouldCallName(p) ? '（名前呼びOFF）' : hasNameReading(p) ? '（名前呼びON）' : '（読みがなを入力してください）' : ''}`; li.append(label);
      if (key === 'people') {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '名前・読みがな';
        edit.addEventListener('click', () => {
          editPerson(p);
          if (isNameApproved(p)) audition.completed(p);
          q('#identityCallName').checked = shouldCallName(p);
          refreshVoiceType(); refreshReadingSuggestions();
          refreshApproval(); q('#identityReading').focus();
          q('[data-name-state]').textContent = '名前・読みがなを保存すると、最初の挨拶で名前を呼びます。試聴は任意です。';
          message(`${p.name}の名前設定を編集中です。旧形式のフルネームを変更する場合は「名字＋名前」を選び、名字と名前を別々に入力して保存してください。顔の撮り直しは不要です。`);
        });
        li.append(edit);
        const distant = document.createElement('button'); distant.type = 'button'; distant.textContent = '離れた顔を追加';
        distant.addEventListener('click', () => {
          editPerson(p);
          q('#identityCallName').checked = shouldCallName(p); q('#identityConsent').checked = false; clearAudition();
          message('普段使う離れた位置に立ち、本人の了承をチェックして「入力が終わったら撮影画面へ」で戻り、「写真を撮る（3回撮影）」を押してください。同じ方の登録にサンプルを追加します（直近12枚まで）。');
          q('#identityConsent').focus();
        });
        li.append(distant);
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
    if (!singleFace()) { identity = null; candidate = ''; hits = 0; live.textContent = faces.length > 1 || peopleCount > 1 ? '複数人のため個人の識別を保留' : faces.length ? '顔を十分確認できたら名前を呼びます' : peopleCount ? '来訪を検知・顔を確認できるまで名前は呼びません' : '顔・配達の登録から識別を設定できます'; return; }
    if (!db.people.length && !db.uniforms.length) { live.textContent = '未登録の来訪者'; return; }
    if (lastSampleFrame === facesAt) return;
    lastSampleFrame = facesAt;
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
      const quality = faceQuality(faces, video.videoWidth, video.videoHeight);
      live.textContent = identity ? identity.source === 'clothing' ? '配達の可能性（登録制服に類似）' : `${ROLES[identity.role]}：${identity.name}${!shouldCallName(identity) ? '・名前呼びOFF' : !hasNameReading(identity) ? '・読みがな未設定' : ''}`
        : modelError ? '顔の識別を準備できません・通常受付中' : next ? '登録情報を照合中…'
          : !quality.usable ? '顔は検出済み・本人照合には小さすぎます'
          : descriptorMissing ? '顔は検出済み・明るさと顔の向きを確認してください'
          : '顔は検出済み・登録サンプルと一致しません';
    } finally { busy = false; }
  }
  const timer = setInterval(() => { scan().catch(() => { reset(); live.textContent = '識別できません・通常受付中'; }); }, 500);
  // Load before the first visitor arrives, rather than spending their greeting window downloading models.
  if (db.people.length) ensureApi().catch(() => {});
  live.textContent = '顔・配達の登録から識別を設定できます';
  return {
    async prepareDetection() { await ensureApi(); },
    async detectFaces() {
      const api = await ensureApi(), start = performance.now();
      const own = regionEpoch;
      // Automatic focus adds one pass; retain all five whole-frame/corner passes.
      // An off-center second person must not disappear just because focus narrowed.
      const automatic = regionMode === 'auto';
      const result = await detectFaces(api, video, detectionCanvases, automatic ? null : region(), automatic && autoRegion.mode !== 'full' ? region() : null);
      detectionMs = Math.round(performance.now() - start);
      if (own === regionEpoch) {
        descriptorFrame.width = detectionCanvases.frame.width; descriptorFrame.height = detectionCanvases.frame.height;
        descriptorFrame.getContext('2d').drawImage(detectionCanvases.frame, 0, 0);
        if (automatic) { autoRegion.observe({ faces: result, people: peopleCount, width: video.videoWidth, height: video.videoHeight }); showRegion(); }
      }
      return own === regionEpoch ? result : [];
    },
    diagnostics() { return `${faceQuality(faces, video.videoWidth, video.videoHeight).text}／顔${faces.length}・全身${peopleCount}／検出 ${detectionMs}ms`; },
    get paused() { return dialog.open; },
    // Body detection must also keep seeing visitors outside the automatic focus area.
    get region() { return regionMode === 'auto' ? cameraRegion(video.videoWidth, video.videoHeight, 'full') : region(); },
    updatePeople(count, boxes = []) {
      bodyBoxes = boxes;
      peopleCount = count;
      if (count > 1) { identity = null; candidate = ''; hits = 0; if (regionMode === 'auto') { autoRegion.reset(); showRegion(); } }
    },
    canIdentify() { return singleFace(); },
    updateFaces(next) {
      if (!next.length && regionMode === 'auto') { autoRegion.reset(); showRegion(); }
      if (!faceQuality(next, video.videoWidth, video.videoHeight).usable) { identity = null; candidate = ''; hits = 0; }
      faces = next; facesAt = next[0]?.capturedAt || Date.now();
      drawDetections();
    },
    current() { return !dialog.open && singleFace() && Date.now() - identityAt < frameLifetime(detectionMs) ? identity : null; },
    async identify(timeoutMs = 2400) {
      if (!db.people.length && !db.uniforms.length) return null;
      const own = epoch, deadline = Date.now() + timeoutMs;
      while (own === epoch && !dialog.open && Date.now() < deadline) {
        if (singleFace() && identity && Date.now() - identityAt < frameLifetime(detectionMs)) return identity;
        if (modelError && !db.uniforms.length) return null;
        scan().catch(() => {});
        await delay(100);
      }
      return null;
    },
    reset() { faces = []; facesAt = 0; peopleCount = 0; bodyBoxes = []; overlays.forEach(o=>o.clear()); detectionLegend.textContent = '検出枠：青＝顔／橙＝人の姿'; autoRegion.reset(); showRegion(); reset(); },
    destroy() { stopped = true; clearInterval(timer); overlays.forEach(o=>o.destroy()); detectionLegend.remove(); reset(); },
  };
}

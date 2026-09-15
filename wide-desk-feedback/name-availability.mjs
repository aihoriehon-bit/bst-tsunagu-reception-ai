import { recordedName, normalizeNameReading } from './name-library.mjs?v=20260911-devicevoice-1';
import { structuredParts } from './registration-name.mjs?v=20260911-fullname-1';
import { canJoinNames } from './full-name-audio.mjs?v=20260911-fullname-1';

export function nameAvailability(person) {
  const parts = structuredParts(person);
  if (parts?.length === 2) {
    const status = parts.map(nameAvailability);
    const labels = status.map((s, i) => `${i === 0 ? '名字' : '名前'}：${s.state === 'empty' ? '未入力' : s.state === 'recorded' ? '収録済み' : s.state === 'missing' ? '未収録' : '読みがなを確認'}${s.state === 'recorded' ? `（${recordedName(parts[i]).reading}）` : ''}`).join(' ／ ');
    if (status.some(s => s.state === 'empty' || s.state === 'reading-needed')) return { state: 'reading-needed', title: '名字と名前をそれぞれ確認してください', detail: labels + '。名字と名前は別々の欄に入力してください。' };
    const canJoin = canJoinNames(...parts.map(recordedName));
    return canJoin ? { state: 'recorded', title: '名字・名前ともに収録済み', detail: labels + '。名字と名前の録音をつなぎ、最後にだけ「さん」を付けます。フルネーム全体を一度に収録した音声とはイントネーションが異なる場合があります。' }
      : { state: 'missing', title: 'フルネームは以前のAI音声で読み上げます', detail: labels + '。両方の事前収録音声がそろわないため、入力した読みがなを名前全体として、以前のAI音声で読み上げます。' };
  }
  if (parts?.length === 1) return nameAvailability(parts[0]);
  const name = String(person?.name || '').trim();
  const reading = String(person?.reading || '').trim();
  if (!name && !reading) return { state: 'empty', title: '名字・名前の収録チェック', detail: '名前または読みがなを入力すると、自動で確認します。' };
  const found = recordedName({ name, reading });
  if (found) return { state: 'recorded', title: '収録済み', detail: `「${found.reading}さん」の事前収録音声があります。VOICEVOXの春日部つむぎで自然に呼びかけます。` };
  const normalized = normalizeNameReading(reading || name);
  if (!normalized || !/^[ぁ-ゖー]+$/.test(normalized)) return {
    state: 'reading-needed', title: reading ? '読みがなを確認してください' : '読みがなを入力してください',
    detail: reading ? 'ひらがな・カタカナで、呼んでほしい読み方を入力してください。'
      : '漢字だけでは読みを確定できません。読みがなを入れると、収録済みか確認できます。',
  };
  return { state: 'missing', title: '未収録（以前のAI音声）', detail: `「${normalized}さん」の事前収録音声はありません。入力した読みがなを名前全体として、以前のAI音声で読み上げます。` };
}

// Local dictionary lookup only: no registration, microphone, or network request.
export function bindNameAvailability({ nameInput, readingInput, panel, additionalInputs = [], getPerson }) {
  const composing = new Set();
  const refresh = () => {
    if (composing.size) return;
    const result = nameAvailability(getPerson ? getPerson() : { name: nameInput.value, reading: readingInput.value });
    panel.dataset.state = result.state;
    panel.querySelector('[data-availability-title]').textContent = result.title;
    panel.querySelector('[data-availability-detail]').textContent = result.detail;
  };
  for (const field of [nameInput, readingInput, ...additionalInputs]) {
    field.addEventListener('compositionstart', () => composing.add(field));
    field.addEventListener('compositionend', () => { composing.delete(field); refresh(); });
    field.addEventListener('input', event => { if (!event.isComposing) refresh(); });
  }
  refresh();
  return refresh;
}

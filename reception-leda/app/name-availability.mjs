import { recordedName, normalizeNameReading } from './name-library.mjs?v=20261006-device-names-1';
import { structuredParts } from './registration-name.mjs?v=20261006-device-names-1';

export function nameAvailability(person) {
  const parts = structuredParts(person);
  if (parts?.length === 2) {
    const status = parts.map(nameAvailability);
    const labels = status.map((s, i) => `${i === 0 ? '名字' : '名前'}：${s.state === 'empty' ? '未入力' : s.state === 'recorded' ? '収録済み' : s.state === 'missing' ? '未収録' : '読みがなを確認'}${s.state === 'recorded' ? `（${recordedName(parts[i]).reading}）` : ''}`).join(' ／ ');
    if (status.some(s => s.state === 'empty' || s.state === 'reading-needed')) return { state: 'reading-needed', title: '名字と名前をそれぞれ確認してください', detail: labels + '。名字と名前は別々の欄に入力してください。' };
    return { state: 'missing', title: 'フルネームは端末音声で読み上げます', detail: labels + '。Ledaのフルネーム結合は準備中のため、読みがなをつなげて端末の日本語音声で一度に読み上げます。名字だけ・名前だけでは準備済みのLeda音声を優先します。' };
  }
  if (parts?.length === 1) return nameAvailability(parts[0]);
  const name = String(person?.name || '').trim();
  const reading = String(person?.reading || '').trim();
  if (!name && !reading) return { state: 'empty', title: '名字・名前の収録チェック', detail: '名前または読みがなを入力すると、自動で確認します。' };
  const found = recordedName({ name, reading });
  if (found?.voice === 'Gemini Leda') return { state: 'recorded', title: '収録済み（Leda音声）', detail: `「${found.reading}さん」はGeminiのLeda音声で試聴・呼びかけます。${found.listeningApproved ? '試聴確認済みです。' : '名前を試聴して発音をご確認ください。'}` };
  if (found) return { state: 'missing', title: 'Leda未準備（端末音声）', detail: `「${found.reading}さん」は端末の日本語音声で試聴・呼びかけます。` };
  const normalized = normalizeNameReading(reading || name);
  if (!normalized || !/^[ぁ-ゖー]+$/.test(normalized)) return {
    state: 'reading-needed', title: reading ? '読みがなを確認してください' : '読みがなを入力してください',
    detail: reading ? 'ひらがな・カタカナで、呼んでほしい読み方を入力してください。'
      : '漢字だけでは読みを確定できません。読みがなを入れると、収録済みか確認できます。',
  };
  return { state: 'missing', title: 'Leda未準備（端末音声）', detail: `「${normalized}さん」は、入力した読みがなを名前全体として端末の日本語音声で読み上げます。` };
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

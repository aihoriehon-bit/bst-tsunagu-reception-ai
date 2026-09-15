import { NAME_RECORDINGS } from './name-library.mjs';

const literal = value => String(value || '').normalize('NFKC').trim();
const hiragana = value => literal(value).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const names = new Map();
for (const entry of NAME_RECORDINGS) for (const name of entry.names) {
  const key = literal(name), choices = names.get(key) || [];
  if (!choices.some(c => c.reading === entry.reading)) choices.push(entry);
  names.set(key, choices);
}
export function predictReading(name, category = 'surname') {
  const text = literal(name), kana = hiragana(text);
  if (!text) return { reading: '', choices: [], kind: 'empty' };
  // Do not remove a real name's suffix (e.g. くさま), or split a full name.
  if (/^[ぁ-ゖー]+$/.test(kana)) return { reading: kana, choices: [kana], kind: 'kana' };
  const all = names.get(text) || [];
  const preferred = all.filter(e => e.categories?.includes(category));
  const choices = (preferred.length ? preferred : all).map(e => e.reading);
  return { reading: choices[0] || '', choices, kind: choices.length ? 'predicted' : 'unknown' };
}

export function bindReadingAutofill({ name, reading, hint, choice, category, onChange }) {
  let composing = false, source = name.value, manual = Boolean(reading.value);
  function render(prediction) {
    choice.replaceChildren();
    for (const value of prediction.choices) {
      const option = document.createElement('option'); option.value = value; option.textContent = value; choice.append(option);
    }
    choice.hidden = prediction.choices.length < 2;
    choice.value = prediction.choices.includes(reading.value) ? reading.value : '';
    hint.textContent = manual ? '読みは手入力した内容を使用します。'
      : prediction.kind === 'kana' ? '名前から読みを自動入力しました。'
      : prediction.kind === 'predicted' ? `予測した読みです。${prediction.choices.length > 1 ? '候補から選ぶか、' : ''}正しい読みか確認・修正してください。`
      : prediction.kind === 'unknown' ? '読みを予測できません。読みがなを入力してください。' : '';
  }
  function refresh() {
    if (composing) return;
    if (source !== name.value) { source = name.value; manual = false; }
    const prediction = predictReading(name.value, category());
    if (!manual) reading.value = prediction.reading;
    render(prediction); onChange();
  }
  name.addEventListener('compositionstart', () => { composing = true; });
  name.addEventListener('compositionend', () => { composing = false; refresh(); });
  name.addEventListener('input', e => { if (!e.isComposing) refresh(); });
  reading.addEventListener('input', e => { if (e.isComposing) return; manual = true; render(predictReading(name.value, category())); });
  reading.addEventListener('compositionend', () => { manual = true; render(predictReading(name.value, category())); });
  choice.addEventListener('change', () => { reading.value = choice.value; manual = true; render(predictReading(name.value, category())); onChange(); });
  return {
    refresh,
    // Existing saved readings are authoritative; never silently replace them on edit.
    adopt() { source = name.value; manual = Boolean(reading.value); refresh(); },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { registrationName, restoreRegistrationName, validateRegistrationName } from './registration-name.mjs';
import { nameAvailability, bindNameAvailability } from './name-availability.mjs';
import { NAME_RECORDINGS, recordedName } from './name-library.mjs';
import { nameLine } from './name-voice.js';
import { hasNameReading, nameApprovalToken } from './name-confirmation.mjs';
import { NAME_JOIN_POINTS } from './name-join-data.mjs';
import { canJoinNames, joinNameSamples } from './full-name-audio.mjs';
import { decodePCM16 } from './kana-name.mjs';
import { ROLES, validVector } from './visitor-matching.mjs';

test('surname, given, full name have distinct explicit fields; legacy strings are not guessed', () => {
  const surname = registrationName('surname', '福田', 'ふくだ');
  const given = registrationName('given', 'たける', 'たける');
  const full = registrationName('full', '福田', 'ふくだ', 'たける', 'たける');
  for (const p of [surname, given, full]) { validateRegistrationName(p); assert.equal(hasNameReading(p), true); assert.deepEqual(restoreRegistrationName(p), p); }
  assert.equal(surname.name, '福田'); assert.equal(given.name, 'たける');
  assert.equal(full.name, '福田 たける'); assert.equal(full.reading, 'ふくだたける');
  assert.equal(nameAvailability(full).state, 'recorded');
  assert.match(nameAvailability(full).detail, /名字：収録済み（ふくだ）.*名前：収録済み（たける）/);
  assert.equal(nameAvailability({ name: '福田たける', reading: 'ふくだたける' }).state, 'missing');
  assert.deepEqual(restoreRegistrationName({ name: '福田たける', reading: 'ふくだたける' }), { nameMode: 'legacy', name: '福田たける', reading: 'ふくだたける' });
  assert.notEqual(nameApprovalToken(full), nameApprovalToken({ ...full, nameParts: [{ name: '福', reading: 'ふく' }, { name: '田たける', reading: 'だたける' }] }));
});
test('partial full names, ambiguous readings, unavailable parts and OFF are reported honestly', () => {
  assert.throws(() => validateRegistrationName(registrationName('full', '福田', 'ふくだ')), /両方/);
  assert.throws(() => validateRegistrationName(registrationName('surname', '', 'ふくだ')), /お名前/);
  assert.throws(() => validateRegistrationName(registrationName('full', 'あ'.repeat(30), '', 'い'.repeat(30))), /40文字/);
  const missing = nameAvailability(registrationName('full', 'おおふさ', '', 'たける'));
  assert.equal(missing.state, 'missing'); assert.match(missing.detail, /名字：未収録.*名前：収録済み/);
  const unclear = registrationName('full', '山崎', '', 'たける');
  assert.equal(nameAvailability(unclear).state, 'reading-needed'); assert.equal(hasNameReading(unclear), false);
  const firstOnly = registrationName('surname', '福田', 'ふくだ', 'hidden value', 'hidden reading');
  assert.equal(firstOnly.reading, 'ふくだ'); assert.equal(firstOnly.nameParts.length, 1);
});
test('all four fields update status, and IME composition never produces a transient false warning', () => {
  function field(value = '') {
    const events = new Map();
    return { value, addEventListener(type, fn) { (events.get(type) || events.set(type, []).get(type)).push(fn); }, emit(type) { for (const fn of events.get(type) || []) fn({}); } };
  }
  const first = field('福田'), firstReading = field('ふくだ'), last = field('たける'), lastReading = field('たける'), mode = field('full');
  const title = {}, detail = {}, panel = { dataset: {}, querySelector: s => s.includes('title') ? title : detail };
  const refresh = bindNameAvailability({ nameInput: first, readingInput: firstReading, additionalInputs: [last, lastReading, mode], panel, getPerson: () => registrationName(mode.value, first.value, firstReading.value, last.value, lastReading.value) });
  assert.equal(panel.dataset.state, 'recorded');
  lastReading.emit('compositionstart'); lastReading.value = 'おお'; refresh(); assert.equal(panel.dataset.state, 'recorded');
  lastReading.value = 'おおふさ'; lastReading.emit('compositionend'); assert.equal(panel.dataset.state, 'missing');
  mode.value = 'surname'; mode.emit('input'); assert.equal(panel.dataset.state, 'recorded');
  mode.value = 'full'; mode.emit('input'); assert.equal(panel.dataset.state, 'missing');
  last.value = ''; lastReading.value = ''; last.emit('input'); assert.equal(panel.dataset.state, 'reading-needed');
});
test('actual storage sanitizer preserves both fields and face samples across reloads for all roles', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function sanitize('), source.indexOf('function save('));
  const sanitize = vm.runInNewContext('(' + code + ')', { ROLES, validVector, crypto, restoreRegistrationName });
  for (const role of ['employee', 'guest', 'delivery']) {
    const p = { ...registrationName('full', '福田', 'ふくだ', 'たける', 'たける'), id: role, role, nameCallingEnabled: false, descriptors: [Array(128).fill(.1)] };
    const one = sanitize({ people: [p] }); const two = sanitize(JSON.parse(JSON.stringify(one)));
    assert.equal(two.people[0].name, p.name); assert.equal(two.people[0].reading, p.reading);
    assert.equal(JSON.stringify(two.people[0].nameParts), JSON.stringify(p.nameParts));
    assert.equal(two.people[0].nameCallingEnabled, false); assert.equal(two.people[0].descriptors.length, 1);
  }
  assert.match(source, /editingId \? p.id === editingId : p.name === formPerson\(\).name/);
  assert.match(source, /\.\.\.x, \.\.\.person, nameParts: person.nameParts/);
});
test('all recordings have validated join boundaries within their exact PCM length', () => {
  const catalog = JSON.parse(readFileSync(new URL('./audio/name-bank/catalog.json', import.meta.url)));
  const metadata = new Map(catalog.entries.map(e => [e.reading, e]));
  assert.equal(Object.keys(NAME_JOIN_POINTS).length, NAME_RECORDINGS.length);
  for (const entry of NAME_RECORDINGS) {
    const [start, end, total] = NAME_JOIN_POINTS[entry.reading];
    assert.ok(start > 0 && start < end && end < total, entry.reading);
    assert.ok(Math.abs(total - metadata.get(entry.reading).seconds * 24000) < 1, entry.reading);
    assert.equal(canJoinNames(entry, recordedName({ reading: 'たける' })), true);
  }
});
test('join removes only prefix honorific, keeps one suffix honorific, works at 24/48 kHz', () => {
  for (const rate of [24000, 48000]) {
    const k = rate / 24000, a = [100, 400, 800], b = [100, 300, 700];
    const first = new Float32Array(800 * k).fill(.1); first.fill(.9, 400 * k);
    const last = new Float32Array(700 * k).fill(.2); last.fill(.8, 300 * k);
    const pcm = decodePCM16(joinNameSamples(first, last, a, b, rate).buffer);
    assert.equal(pcm.rate, rate); assert.equal(pcm.samples.length, 1000 * k + Math.round(.07 * rate));
    assert.ok(pcm.samples.slice(0, 400 * k).every(x => x < 4000));
    assert.ok(pcm.samples.at(-1) > 25000);
  }
  assert.throws(() => joinNameSamples(new Float32Array(1), new Float32Array(1), [1, 2, 2000], [1, 2, 2000], 24000), /長さが一致/);
});
test('actual greeting nameLine uses one joined clip for employee/guest/delivery, never browser voice', async () => {
  const oldFetch = globalThis.fetch, oldContext = globalThis.AudioContext;
  let requests = 0, decodes = 0;
  globalThis.fetch = async () => { requests++; return new Response(new ArrayBuffer(8)); };
  globalThis.AudioContext = class {
    sampleRate = 48000;
    async decodeAudioData() {
      const reading = ['ふくだ', 'たける'][decodes++];
      return { getChannelData: () => new Float32Array(NAME_JOIN_POINTS[reading][2] * 2).fill(.1) };
    }
    async close() {}
  };
  try {
    for (const role of ['employee', 'guest', 'delivery']) {
      const p = { ...registrationName('full', '福田', 'ふくだ', 'たける', 'たける'), role };
      const line = await nameLine(p);
      assert.equal(line.text, '福田 たけるさん。'); assert.match(line.audio, /^blob:/); assert.equal(line.spokenText, undefined);
      await assert.rejects(nameLine({ ...p, nameCallingEnabled: false }), /OFF/);
    }
    assert.equal(requests, 2); assert.equal(decodes, 2);
  } finally { globalThis.fetch = oldFetch; globalThis.AudioContext = oldContext; }
});

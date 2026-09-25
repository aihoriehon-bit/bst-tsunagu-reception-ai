import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('approved main and comparison resolve to the same guided runtime and styles', () => {
  const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../wide-desk-preview/index.html', import.meta.url), 'utf8');
  const site = 'https://aihoriehon-bit.github.io/bst-tsunagu-reception-ai/';
  assert.match(root, /<base href="\.\/wide-desk-preview\/"/);
  for (const pattern of [/src="([^\"]*guided-app.js[^\"]*)"/, /href="([^\"]*guided.css[^\"]*)"/]) {
    const mainAsset = root.match(pattern)?.[1];
    const previewAsset = preview.match(pattern)?.[1];
    assert.ok(mainAsset); assert.ok(previewAsset);
    assert.equal(new URL(mainAsset, new URL('./wide-desk-preview/', site)).href,
      new URL(previewAsset, site + 'wide-desk-preview/').href);
  }
  assert.match(root, /href="\.\.\/wide-desk-feedback\/preview.css\?v=20260915-mobile-audio-1"/);
});
test('previous main registrations merge only when explicitly imported, preserving newer names and OFF', () => {
  const source = readFileSync(new URL('./visitor-recognition.js', import.meta.url), 'utf8');
  const start = source.indexOf("const next = { people: [...db.people], uniforms: [...db.uniforms] }");
  const end = source.indexOf('if (!added)', start);
  const current = { id: 'a', name: '福田', reading: 'ふくだ', nameCallingEnabled: false };
  const context = { db: { people: [current], uniforms: [] }, previous: { people: [{ id: 'a', name: '福田旧名' }, { id: 'b', name: '福田' }, { id: 'c', name: '平井', role: 'employee' }], uniforms: [{ id: 'u', name: '配達制服', role: 'delivery' }] }, ancient: { people: [], uniforms: [] } };
  const result = vm.runInNewContext(source.slice(start, end) + ';({ next, added })', context);
  assert.equal(result.added, 2); assert.equal(result.next.people[0], current);
  assert.equal(result.next.people[0].nameCallingEnabled, false);
  assert.equal(result.next.people[1].role, 'employee'); assert.equal(result.next.uniforms[0].id, 'u');
  assert.equal(context.db.people.length, 1);
});

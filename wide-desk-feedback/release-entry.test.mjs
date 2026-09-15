import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('comparison and approved main entry both use the latest feedback runtime', () => {
  const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../wide-desk-preview/index.html', import.meta.url), 'utf8');
  assert.match(preview, /src="\.\.\/wide-desk-feedback\/app.js/);
  assert.match(root, /src="\.\.\/wide-desk-feedback\/app.js\?v=20260915-panel-size-1"/);
  assert.match(root, /href="\.\.\/wide-desk-feedback\/preview.css\?v=20260915-panel-size-1"/);
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

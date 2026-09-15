import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { conversationCue } from './conversation-cue.mjs';
const source = readFileSync(new URL('./automatic-conversation.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('  function renderCue()'), source.indexOf('  function append('));
function cue(change = {}) {
  const nodes = {};
  let view, listening, hidden = false;
  const context = {
    speaking: false, enabled: true, Recognition: class {}, audible: true, active: true, present: true,
    document: { hidden: false }, micStatus: 'listening', issue: '', completed: false,
    panel: { dataset: {} }, status: {}, conversationCue,
    confirmation: { setSpeaking() {}, cueHost: null },
    q(selector) { return nodes[selector] ||= { setAttribute() {} }; },
    turnIndicator: { show(c, options) { view = { ...c, ...options }; }, hide() { hidden = true; } },
    micLevel: { setListening(value) { listening = value; } },
    ...change,
  };
  vm.runInNewContext(render + ';renderCue()', context);
  return { view, listening, hidden };
}
test('centered listening invitation only appears on actual recognition start', () => {
  assert.equal(cue().view.mode, 'listening'); assert.equal(cue().listening, true);
  for (const micStatus of ['preparing', 'waiting', 'processing', 'network', 'permission']) {
    assert.notEqual(cue({ micStatus }).view.mode, 'listening');
    assert.equal(cue({ micStatus }).listening, false);
  }
});
test('AI playback, completion, absence, mic off and hidden page all stop amplitude capture', () => {
  for (const change of [{ speaking: true }, { completed: true }, { present: false }, { active: false }, { enabled: false }, { audible: false }, { document: { hidden: true } }]) assert.equal(cue(change).listening, false);
  assert.equal(cue({ completed: true }).hidden, true);
  assert.equal(cue({ present: false }).view.visible, false);
  assert.equal(cue({ speaking: true, active: false }).view.mode, 'speaking');
});
test('confirmation embeds the same indicator into the central card rather than overlapping buttons', () => {
  const host = {};
  assert.equal(cue({ confirmation: { setSpeaking() {}, cueHost: host } }).view.host, host);
});

test('bottom placement avoids adjustable controls and leaves confirmation-card layout alone', () => {
  const indicator = readFileSync(new URL('./turn-indicator.mjs', import.meta.url), 'utf8');
  const fn = indicator.slice(indicator.indexOf('  function positionNearBottom()'), indicator.indexOf('  const observer ='));
  function position({ card = false, hidden = false, left = 705, right = 1215, controlsTop = 510, height = 720 } = {}) {
    let offset;
    const panel = { getBoundingClientRect: () => ({ left: 14, right: 474, top: controlsTop, height: 180 }) };
    vm.runInNewContext(fn + ';positionNearBottom()', {
      el: { hidden, classList: { contains: () => card }, getBoundingClientRect: () => ({ left, right, height: 154 }), style: { setProperty(k, value) { offset = value; } } },
      document: { querySelector: () => panel }, window: { innerHeight: height }, observedPanel: panel, observer: null,
    });
    return offset;
  }
  assert.equal(position(), '32px');
  assert.equal(position({ left: 385, right: 895 }), '226px');
  assert.equal(position({ left: 16, right: 374, controlsTop: 626, height: 844 }), '234px');
  assert.equal(position({ card: true }), undefined);
  assert.equal(position({ hidden: true }), undefined);
});

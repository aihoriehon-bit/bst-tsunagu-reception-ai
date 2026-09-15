import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const cutoff = Number(source.match(/const DESK_BODY_CUTOFF_Y = ([\d.]+);/)[1]);
const improveSource = source.slice(source.indexOf("function improveMaterials("), source.indexOf("function createSimpleDeskSet("));
class Vector3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
class Plane {
  constructor(normal, constant) { Object.assign(this, { normal, constant }); }
  distanceToPoint({ x, y, z }) { return this.normal.x * x + this.normal.y * y + this.normal.z * z + this.constant; }
}
function applyTo(...nodes) {
  const ctx = { THREE: { Vector3, Plane, FrontSide: 0 }, DESK_BODY_CUTOFF_Y: cutoff };
  vm.createContext(ctx);
  vm.runInContext(improveSource, ctx);
  ctx.improveMaterials({ traverse: (fn) => nodes.forEach(fn) });
}

test("clip is enabled and its boundary is hidden by the desktop/front-panel overlap", () => {
  assert.match(source, /renderer\.localClippingEnabled = true/);
  // Current top: y .67, height .065; front panel: y .32, height .64.
  assert.ok(cutoff >= 0.67 - 0.065 / 2 && cutoff <= 0.32 + 0.64 / 2);
});

test("character-only clipping covers single and multiple materials plus shadows", () => {
  const a = {}, b = {}, deskMaterial = {};
  applyTo({ isMesh: true, material: a }, { isMesh: true, material: [b, null] }, { material: deskMaterial });
  for (const material of [a, b]) {
    assert.equal(material.clipShadows, true);
    assert.equal(material.needsUpdate, true);
    assert.equal(material.clippingPlanes.length, 1);
  }
  assert.equal(a.clippingPlanes[0], b.clippingPlanes[0]);
  assert.equal(deskMaterial.clippingPlanes, undefined);
});

test("below-desk geometry stays hidden on every side and posture; upper body remains", () => {
  const material = {};
  applyTo({ isMesh: true, material });
  const plane = material.clippingPlanes[0];
  for (const x of [-2, 0, 2]) for (const z of [-2, 0.31, 2]) {
    for (const y of [-0.35, 0, 0.3, cutoff - 0.0001]) assert.ok(plane.distanceToPoint({ x, y, z }) < 0);
    for (const y of [cutoff, 0.74, 1.1, 1.62]) assert.ok(plane.distanceToPoint({ x, y, z }) >= 0);
  }
  // Not attached to the moving root or enabled only for a particular motion.
  assert.equal((source.match(/clippingPlanes\s*=/g) || []).length, 1);
  assert.match(source, /improveMaterials\(model\);\s*characterRoot\.add\(model\)/);
});

/**
 * Scene3D per-object border OFFSET — declaration only (fs-c2-shadow Job 2).
 *
 * `obj.border.offset` is a new normalized field (params.js `normalizeObjectBorder`):
 * millimetres, default 0, clamped to [-2, 2]. Negative = inward, positive =
 * outward. This file owns ONLY the normalization contract — the geometry that
 * actually offsets the drawn border, and any UI control for it, land in a
 * separate effort (scene3d.js / the panel are out of scope here).
 *
 * RGR: every assertion below FAILS against the pre-change `normalizeObjectBorder`
 * (which returned `{ enabled, strength, penId }` with no `offset` key at all —
 * `border.offset` was `undefined`).
 *
 * Required directly (node environment, module.exports guard) — no DOM/runtime
 * loader needed, same pattern as scene3d-tone-law-params.test.js.
 */
const Params = require('../../src/core/scene3d/params.js');

describe('Scene3D.Params — obj.border.offset', () => {
  const borderOf = (raw) => Params.normalizeParams({ objects: [{ primitive: 'box', border: raw }] }).objects[0].border;

  test('defaults to 0 when the border block is absent entirely', () => {
    const p = Params.normalizeParams({ objects: [{ primitive: 'box' }] });
    expect(p.objects[0].border.offset).toBe(0);
  });

  test('defaults to 0 when border is present but offset is not', () => {
    expect(borderOf({ enabled: true, strength: 2 }).offset).toBe(0);
  });

  test('a plausible in-range value survives unchanged', () => {
    expect(borderOf({ offset: 0.75 }).offset).toBe(0.75);
    expect(borderOf({ offset: -1.2 }).offset).toBe(-1.2);
  });

  test('clamps at the +2 ceiling', () => {
    expect(borderOf({ offset: 2 }).offset).toBe(2);
    expect(borderOf({ offset: 5 }).offset).toBe(2);
    expect(borderOf({ offset: 1e9 }).offset).toBe(2);
  });

  test('clamps at the -2 floor', () => {
    expect(borderOf({ offset: -2 }).offset).toBe(-2);
    expect(borderOf({ offset: -5 }).offset).toBe(-2);
    expect(borderOf({ offset: -1e9 }).offset).toBe(-2);
  });

  test('non-finite / junk values fall back to the default (0), not NaN', () => {
    expect(borderOf({ offset: NaN }).offset).toBe(0);
    expect(borderOf({ offset: 'nope' }).offset).toBe(0);
    expect(borderOf({ offset: null }).offset).toBe(0);
    expect(borderOf({ offset: undefined }).offset).toBe(0);
  });

  test('round-trips alongside the sibling border fields (enabled/strength/penId untouched)', () => {
    const b = borderOf({ enabled: true, strength: 2.5, penId: 'pen-x', offset: -0.5 });
    expect(b).toEqual({ enabled: true, strength: 2.5, penId: 'pen-x', offset: -0.5 });
  });
});

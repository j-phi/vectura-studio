/*
 * TUX-019 static guard: the 350 ms hold-to-lift path is gone from the renderer.
 * A one-finger drag moves objects after the touch slop, with no hold timer and no vibrate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = fs.readFileSync(path.join(ROOT, 'src/render/renderer.js'), 'utf8');

describe('TUX-019 renderer has no touch hold-to-lift code', () => {
  it('has no touchHoldTimer', () => { expect(src).not.toMatch(/touchHoldTimer/); });
  it('has no touchHoldPending', () => { expect(src).not.toMatch(/touchHoldPending/); });
  it('has no clearTouchHold', () => { expect(src).not.toMatch(/clearTouchHold/); });
  it('has no navigator.vibrate(30)', () => { expect(src).not.toMatch(/navigator\.vibrate\(\s*30\s*\)/); });
  it('uses one _beginLayerMove helper for the mouse and touch move start', () => {
    const calls = src.match(/_beginLayerMove\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // definition + mouse branch + touch promotion
  });
  it('reads the touch drag slop from config, not a bare literal', () => {
    expect(src).toMatch(/touchDragSlopPx/);
  });
});

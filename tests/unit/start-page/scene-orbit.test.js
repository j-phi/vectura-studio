/**
 * Start Page turning 3D Scenes (src/ui/start-page/scene-orbit.js) — window.Vectura.StartPageSceneOrbit.
 * A 3D Scene piece keeps the drawing the app made (fills and shadow shapes included) and turns it with REAL renders of
 * the same document, camera moved: at rest the tile's own art, a gentle rock through rendered poses when idle, the exact
 * pose after a drag. The Ink tile and the renderer are fakes here so every pose that is shown can be traced to a render.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/ui/start-page/scene-orbit.js'), 'utf8');

const DOC = () => ({
  type: 'vectura',
  state: {
    engine: { layers: [
      { id: 'g', type: 'scene3d', isGroup: true, containerRole: 'scene', params: { camera: { projection: 'orthographic', yaw: -32, pitch: 22, roll: 0, zoom: 1.05 }, shadow: { shadowDensity: 50 } } },
      { id: 'o', type: 'object3d', parentId: 'g', params: { primitive: 'sphere', params: { radius: 20 } } },
    ] },
    settings: { paperSize: 'a4', pens: [{ id: 'p1', color: '#111111', width: 0.3 }] },
  },
});

let dom; let W; let S; let now; let timers; let renders; let still;
const load = () => {
  dom = new JSDOM('<!doctype html><html><body><div id="m"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  W = dom.window;
  now = 1000; timers = []; renders = [];
  W.performance.now = () => now;
  W.setTimeout = (f, ms) => { const t = { f, at: now + (ms || 0) }; timers.push(t); return timers.length; };
  W.clearTimeout = () => { /* a stale timer fires harmlessly: frame() re-checks its own state */ };
  W.matchMedia = () => ({ matches: still, addEventListener() {}, removeEventListener() {} });
  W.Element.prototype.getBoundingClientRect = () => ({ width: 300, height: 300, left: 0, top: 0, right: 300, bottom: 300 });
  vm.runInContext(SRC, dom.getInternalVMContext(), { filename: 'scene-orbit.js' });
  S = W.Vectura.StartPageSceneOrbit;
};
/* a mounted StartPageInk tile, reduced to what StartPageSceneOrbit uses */
const fakeTile = (el) => {
  const h = { art: { id: 'work:1', svg: '<svg data-own="1"/>' }, ready: Promise.resolve(), cur: null, log: [], prepared: [] };
  h.box = W.document.createElement('div'); h.box.className = 'sp-ink-art'; el.appendChild(h.box);
  h.prepareArt = (a) => { h.prepared.push(a.id); return Promise.resolve(true); };
  h.showArt = (a) => { h.cur = a || null; h.log.push(a ? a.id : null); return Promise.resolve(true); };
  h.shownArt = () => h.cur || h.art;
  el._spInk = h;
  return h;
};
/* the app's renderer, faked: one drawing per camera pose, and a record of every document it was given */
const render = (pl) => {
  const cam = pl.state.engine.layers[0].params.camera;
  renders.push(pl);
  return Promise.resolve({ svg: `<svg data-yaw="${cam.yaw}" data-pitch="${cam.pitch}"/>` });
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const run = async (ms) => {
  const end = now + ms;
  while (now < end) {
    now += 1000 / 60;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);
    due.forEach((t) => t.f());
    await flush();
  }
};
const yawOf = (id) => Number(String(id).split('@')[1].split(',')[0]);
const ptr = (el, type, x, y) => el.dispatchEvent(new W.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
const mountScene = async (opts) => {
  const el = W.document.getElementById('m');
  const tile = fakeTile(el);
  const h = S.attach(el, Object.assign({ payload: () => DOC(), render }, opts || {}));
  await flush();
  return { el, tile, h };
};

describe('StartPageSceneOrbit', () => {
  beforeEach(() => { still = false; load(); });
  afterEach(() => { const m = W.document.getElementById('m'); if (m && m._spScene) m._spScene.destroy(); dom.window.close(); });

  it('needs a mounted Ink tile that can show alternates', () => {
    const el = W.document.getElementById('m');
    expect(S.attach(el, { payload: DOC() })).toBe(null);
    el._spInk = { art: { id: 'x' } }; // an older handle without showArt
    expect(S.attach(el, { payload: DOC() })).toBe(null);
  });

  it('at rest the tile keeps its own drawing; every turned pose is the same document with only the camera moved', async () => {
    const { tile, h } = await mountScene();
    expect(h.home).toEqual({ yaw: -32, pitch: 22 });
    await run(1000); // before the idle delay
    expect(tile.log.filter((x) => x !== null)).toEqual([]); // nothing but the tile's own art has been shown
    expect(tile.shownArt()).toBe(tile.art);
    expect(renders.length).toBeGreaterThan(0); // the rock's poses render ahead, one at a time
    const strip = (pl) => { const c = JSON.parse(JSON.stringify(pl)); c.state.engine.layers.forEach((l) => { if (l.params && l.params.camera) { delete l.params.camera.yaw; delete l.params.camera.pitch; } }); return c; };
    renders.forEach((pl) => expect(strip(pl)).toEqual(strip(DOC())));
  });

  it('rocks gently back and forth through real renders when idle', async () => {
    const { tile } = await mountScene();
    await run(2000 + 12000);
    const shown = tile.log.filter((x) => x !== null);
    const yaws = shown.map(yawOf);
    expect(yaws.some((y) => y > -32)).toBe(true);
    expect(yaws.some((y) => y < -32)).toBe(true);
    yaws.forEach((y) => expect(Math.abs(y + 32)).toBeLessThanOrEqual(S.SWAY[0] + 0.05)); // subtle: within the sway
    // every pose shown is one the renderer drew (prepared on the tile first)
    shown.forEach((id) => expect(tile.prepared).toContain(id));
    const drawn = new Set(renders.map((pl) => pl.state.engine.layers[0].params.camera.yaw));
    yaws.forEach((y) => expect(drawn.has(y)).toBe(true));
  });

  it('parks on its own drawing after ~20 s without interaction', async () => {
    const { tile } = await mountScene();
    await run(26000);
    expect(tile.log.length).toBeGreaterThan(2);
    expect(tile.log[tile.log.length - 1]).toBe(null);
    expect(tile.shownArt()).toBe(tile.art);
    const scheduled = timers.length;
    await run(2000);
    expect(tile.log[tile.log.length - 1]).toBe(null);
    expect(timers.length).toBeLessThanOrEqual(scheduled); // the loop has ended
  });

  it('drag turns the camera through baked poses: nothing renders during it, the shown pose becomes home on release', async () => {
    const { el, tile, h } = await mountScene();
    const ov = el.querySelector('.sp-scene-orbit');
    expect(ov.getAttribute('role')).toBe('application');
    await run(6000); // the rock and the drag arc are baked ahead
    const before = renders.length;
    ptr(ov, 'pointerdown', 100, 100);
    for (let i = 1; i <= 6; i++) { ptr(ov, 'pointermove', 100 + i * 10, 100); await run(30); }
    expect(renders.length).toBe(before); // no render on the interaction path
    ptr(ov, 'pointerup', 160, 100);
    await run(500);
    expect(h.home.yaw).toBeLessThan(-32 - 10); // 60 px to the right turns the scene well past the sway
    expect(h.home.pitch).toBe(22);
    expect(tile.log[tile.log.length - 1]).toBe(`work:1@${h.poseKey(h.home)}`);
    expect(renders.some((pl) => pl.state.engine.layers[0].params.camera.yaw === h.home.yaw)).toBe(true); // it was baked
  });

  it('a drag before anything is baked stays on home; the arc widens as poses finish', async () => {
    const { el, h } = await mountScene();
    const ov = el.querySelector('.sp-scene-orbit');
    ptr(ov, 'pointerdown', 100, 100);
    ptr(ov, 'pointermove', 200, 100);
    ptr(ov, 'pointerup', 200, 100);
    expect(h.home.yaw).toBe(-32);
    expect(renders.length).toBeLessThanOrEqual(1);
  });

  it('a long drag keeps a bounded number of drawn poses (home and the rock\'s poses stay)', async () => {
    const { el, h } = await mountScene();
    await run(6000);
    const ov = el.querySelector('.sp-scene-orbit');
    ptr(ov, 'pointerdown', 0, 100);
    for (let i = 1; i <= 120; i++) { ptr(ov, 'pointermove', i * 2.5, 100); await run(20); }
    ptr(ov, 'pointerup', 300, 100);
    await run(300);
    expect(h.stats.drawn).toBeLessThanOrEqual(40);
  });

  it('arrow keys turn it in baked steps', async () => {
    const { el, h } = await mountScene();
    await run(6000);
    const n = renders.length;
    el.querySelector('.sp-scene-orbit').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(h.home.yaw).toBe(-27);
    expect(renders.length).toBe(n); // the turn itself rendered nothing
  });

  it('Still: no rocking and no background baking until engaged; then dragging turns it through baked poses', async () => {
    still = true; dom.window.close(); load();
    const { el, tile, h } = await mountScene();
    await run(8000);
    expect(renders.length).toBe(0);
    expect(tile.log.filter((x) => x !== null)).toEqual([]);
    const ov = el.querySelector('.sp-scene-orbit');
    ov.dispatchEvent(new W.Event('pointerenter'));
    await run(8000);
    expect(renders.length).toBeGreaterThan(0);
    const n = renders.length;
    ptr(ov, 'pointerdown', 100, 100); ptr(ov, 'pointermove', 140, 100); ptr(ov, 'pointerup', 140, 100);
    await run(300);
    expect(renders.length).toBe(n);
    expect(h.home.yaw).toBeLessThan(-32);
    expect(tile.log[tile.log.length - 1]).toBe(`work:1@${h.poseKey(h.home)}`);
  });

  it('a document with no 3D Scene layer leaves the drawing alone', async () => {
    const { el, h } = await mountScene({ payload: { state: { engine: { layers: [{ type: 'rings', params: {} }] } } } });
    await h.loaded;
    expect(h.failed).toBe(true);
    expect(el.querySelector('.sp-scene-orbit')).toBe(null);
    expect(el._spScene).toBeUndefined();
  });

  it('destroy removes the overlay and shows the tile its own drawing again', async () => {
    const { el, tile, h } = await mountScene();
    await run(9000);
    h.destroy();
    expect(el.querySelector('.sp-scene-orbit')).toBe(null);
    expect(el.classList.contains('sp-scene-live')).toBe(false);
    expect(tile.log[tile.log.length - 1]).toBe(null);
    const n = renders.length;
    await run(4000);
    expect(renders.length).toBe(n);
  });

  // ── per-move work is independent of the number of baked poses (perf/scene3d-instant-drag) ──────────────────────────
  // RED (pre-change): every pointermove read el.getBoundingClientRect() and scanned + string-split every drawn pose key.
  it('a drag move does no layout read and no per-pose scan: one sorted index, binary search', async () => {
    const { el, h } = await mountScene();
    await run(6000);
    const ov = el.querySelector('.sp-scene-orbit');
    let rects = 0;
    const prev = W.Element.prototype.getBoundingClientRect;
    W.Element.prototype.getBoundingClientRect = function () { rects += 1; return prev.call(this); };
    ptr(ov, 'pointerdown', 100, 100);
    const r0 = rects;
    const l0 = h.lookup.lookups; const b0 = h.lookup.rebuilds;
    for (let i = 1; i <= 60; i++) ptr(ov, 'pointermove', 100 + i * 2, 100);
    expect(rects).toBe(r0);                                   // no forced layout per move
    expect(h.lookup.lookups - l0).toBe(60);
    expect(h.lookup.rebuilds - b0).toBeLessThanOrEqual(1);    // the index is built once per change of the baked set
    ptr(ov, 'pointerup', 220, 100);
    W.Element.prototype.getBoundingClientRect = prev;
  });

  it('a pose that lands mid-drag waits for the gesture to end (its main-thread tail never falls inside it)', async () => {
    let release; const held = [];
    const gated = (pl) => { const cam = pl.state.engine.layers[0].params.camera; return new Promise((res) => { held.push(() => res({ svg: `<svg data-yaw="${cam.yaw}" data-pitch="${cam.pitch}"/>` })); }); };
    const { el, tile } = await mountScene({ render: gated });
    void release;
    await run(2500);
    expect(held.length).toBe(1);                              // one pose in flight
    const ov = el.querySelector('.sp-scene-orbit');
    ptr(ov, 'pointerdown', 100, 100);
    held.shift()();                                           // it lands during the drag
    await run(400);
    expect(tile.prepared.length).toBe(0);                     // not prepared (rastered) until the pointer is up
    ptr(ov, 'pointerup', 100, 100);
    await run(600);
    expect(tile.prepared.length).toBe(1);
  });

  it('no pose render starts within afterDragMs of a release; baking resumes after', async () => {
    const { el } = await mountScene();
    await run(1200);
    const ov = el.querySelector('.sp-scene-orbit');
    ptr(ov, 'pointerdown', 100, 100); ptr(ov, 'pointermove', 120, 100); ptr(ov, 'pointerup', 120, 100);
    const n = renders.length;
    await run(2200);
    expect(renders.length).toBe(n);
    await run(6000);
    expect(renders.length).toBeGreaterThan(n);
  });

  // RED (pre-change): a plate baked every pose regardless of memory (a 3x phone plate: ~3.4 MB a pose, 37 poses).
  it('stops baking when the plate\'s bitmap budget (ink.altCapacity) is spent', async () => {
    const el = W.document.getElementById('m');
    const tile = fakeTile(el);
    tile.altCapacity = () => 8;
    const h = S.attach(el, { payload: () => DOC(), render });
    await flush();
    await run(30000);
    expect(h.stats.drawn).toBeLessThanOrEqual(8);
    expect(renders.length).toBeLessThanOrEqual(8);
    expect(renders.length).toBeGreaterThan(0);
  });
});

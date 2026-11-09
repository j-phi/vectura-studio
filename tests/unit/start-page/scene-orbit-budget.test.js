/**
 * Start Page turning 3D Scenes, cost budget (src/ui/start-page/scene-orbit.js).
 * Dragging is PRE-BAKED: the drag shows the nearest already-drawn pose and never starts a render (not on move, not on release).
 * A scene whose pose render is slow (heavy) rocks through fewer poses (and bakes a narrower drag arc) or none; the rock's renders hold back while the page scrolls or the pointer moves and stop once
 * the rock has parked. The renderer is a fake that reports how long each pose "took" (ms) so the budget can be driven exactly.
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
let poseMs = 100; let poseDelay = 0;
const render = (pl) => {
  const cam = pl.state.engine.layers[0].params.camera;
  renders.push(pl);
  const out = { svg: `<svg data-yaw="${cam.yaw}" data-pitch="${cam.pitch}"/>`, ms: poseMs };
  if (!poseDelay) return Promise.resolve(out);
  return new Promise((res) => { W.setTimeout(() => res(out), poseDelay); });
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


const shown = (tile) => tile.log.filter((x) => x !== null);
const drag = async (ov, n, dx) => {
  ptr(ov, 'pointerdown', 100, 100);
  for (let i = 1; i <= n; i++) { ptr(ov, 'pointermove', 100 + i * dx, 100); await run(30); }
};

describe('StartPageSceneOrbit cost budget', () => {
  beforeEach(() => { still = false; poseMs = 100; poseDelay = 0; load(); });
  afterEach(() => { const m = W.document.getElementById('m'); if (m && m._spScene) m._spScene.destroy(); dom.window.close(); });

  it('a light scene keeps the full rock (12 poses) and bakes the drag arc (24 more: +-30 deg in 2.5 deg steps)', async () => {
    await mountScene();
    await run(6000);
    expect(renders.length).toBe(12 + 24);
    const yaws = renders.map((pl) => pl.state.engine.layers[0].params.camera.yaw);
    expect(Math.min(...yaws)).toBe(-62);
    expect(Math.max(...yaws)).toBe(-2);
  });

  it('a heavy scene (pose render > heavyMs) rocks through only the 2 poses of level 1', async () => {
    poseMs = 1500;
    const { h } = await mountScene();
    await run(10000);
    expect(h.stats.heavy).toBe(true);
    expect(renders.length).toBe(2 + 8); // +1 and -1 level, then the narrower drag arc (+-10 deg)
    const yaws = renders.map((pl) => pl.state.engine.layers[0].params.camera.yaw);
    expect(new Set(yaws).size).toBe(10);
    expect(Math.min(...yaws)).toBe(-42);
  });

  it('a scene past haltMs does not rock at all: after the probe pose it renders nothing and shows only its own art', async () => {
    poseMs = 5000;
    const { tile } = await mountScene();
    await run(26000);
    expect(renders.length).toBe(1);
    expect(shown(tile)).toEqual([]);
    expect(tile.shownArt()).toBe(tile.art);
  });

  it('a heavy scene renders nothing while dragging or on release: the drag shows the nearest baked pose, clamped to the baked arc', async () => {
    poseMs = 1500;
    const { el, tile, h } = await mountScene();
    await run(16000);
    const before = renders.length;
    expect(before).toBe(10);
    const ov = el.querySelector('.sp-scene-orbit');
    await drag(ov, 8, 10);
    expect(renders.length).toBe(before); // nothing rendered mid-drag
    shown(tile).forEach((id) => expect(tile.prepared).toContain(id)); // only drawn poses were shown
    ptr(ov, 'pointerup', 180, 100);
    await run(3000);
    expect(renders.length).toBe(before); // nor on release
    expect(h.home.yaw).toBe(-42); // 52 deg of drag, clamped to the +-10 deg baked arc
    expect(h.home.pitch).toBe(22); // the pitch stays home's
    expect(tile.cur.id).toBe(`work:1@${h.poseKey(h.home)}`);
  });

  it('a light scene drags through baked poses only, then bakes the poses around its new home', async () => {
    const { el, tile, h } = await mountScene();
    await run(6000);
    const before = renders.length;
    const ov = el.querySelector('.sp-scene-orbit');
    await drag(ov, 4, 10); // 26 deg: inside the baked arc
    expect(renders.length).toBe(before);
    ptr(ov, 'pointerup', 140, 100);
    expect(h.home.yaw).toBe(-57);
    expect(tile.cur.id).toBe(`work:1@${h.poseKey(h.home)}`);
    await run(6000);
    expect(renders.length).toBeGreaterThan(before); // the rock around the new home
  });
});

describe('StartPageSceneOrbit yield and pause', () => {
  beforeEach(() => { still = false; poseMs = 10; poseDelay = 0; load(); });
  afterEach(() => { const m = W.document.getElementById('m'); if (m && m._spScene) m._spScene.destroy(); dom.window.close(); });

  it('starts no rock render within yieldMs of a scroll of the scroller that holds the piece, and resumes after', async () => {
    const el = W.document.getElementById('m');
    fakeTile(el);
    S.attach(el, { payload: () => DOC(), render });
    const scroller = el.parentElement;
    for (let i = 0; i < 10; i++) { scroller.dispatchEvent(new W.Event('scroll')); await run(100); }
    expect(renders.length).toBe(0);
    await run(600);
    expect(renders.length).toBeGreaterThan(0);
  });

  it('holds the rock back for a pointer move or a wheel anywhere on the page', async () => {
    const el = W.document.getElementById('m');
    fakeTile(el);
    S.attach(el, { payload: () => DOC(), render });
    for (let i = 0; i < 10; i++) { W.document.body.dispatchEvent(new W.MouseEvent('pointermove', { bubbles: true })); await run(100); }
    expect(renders.length).toBe(0);
    for (let i = 0; i < 5; i++) { W.document.body.dispatchEvent(new W.Event('wheel', { bubbles: true })); await run(100); }
    expect(renders.length).toBe(0);
    await run(600);
    expect(renders.length).toBeGreaterThan(0);
  });

  it('a drag starts no render at all, scroll pause or not', async () => {
    const { el } = await mountScene();
    await run(6000);
    const before = renders.length;
    const ov = el.querySelector('.sp-scene-orbit');
    el.parentElement.dispatchEvent(new W.Event('scroll'));
    ptr(ov, 'pointerdown', 100, 100);
    ptr(ov, 'pointermove', 140, 100);
    await run(600);
    expect(renders.length).toBe(before);
  });

  it('once the rock has parked only the bounded drag ring keeps baking (to completion), then nothing more', async () => {
    poseDelay = 4000; // each pose takes 4 s of page time: the 12 rock poses alone would run to ~50 s
    const { el } = await mountScene();
    await run(24000); // parked at ~21.8 s
    const atPark = renders.length;
    expect(atPark).toBeGreaterThan(0);
    expect(atPark).toBeLessThan(12);
    await run(12000);
    expect(renders.length).toBeGreaterThanOrEqual(atPark);            // the ring is still being baked...
    await run(180000);
    const total = renders.length;
    expect(total).toBeLessThanOrEqual(12 + 24);                         // ...but it is bounded: 12 rock + 2 x (30 deg / 2.5 deg) ring poses
    await run(20000);
    expect(renders.length).toBe(total);                                 // and then stops for good
    el.querySelector('.sp-scene-orbit').dispatchEvent(new W.Event('pointerenter'));
    await run(1000);
    expect(renders.length).toBeGreaterThanOrEqual(total);               // a wake resumes the rock's own poses
  });
});

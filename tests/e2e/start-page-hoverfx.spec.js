const { test, expect } = require('@playwright/test');

// Start Page hover effects v2 (real WebGL): every shipped WebGL effect hands off, runs, settles to rest and
// hands the ink layer back; Still shows the still frame with no animation. Time is a fake clock
// (ctl._advance), so the settle budgets below are simulation seconds, not wall-clock.
const GL_EFFECTS = ['holo', 'ripple', 'stipple', 'breeze', 'gravity', 'current'];
// Seconds of simulated time allowed after the pointer leaves until the effect is at rest. The loader
// tears an effect down 2.6 s after the pointer leaves, so every effect must be at rest inside that window.
const SETTLE_BUDGET = 2.6;
const SIZE = 440;

const setup = async (page) => {
  await page.goto('/tests/fixtures/start-page/hoverfx-host.html');
  await page.evaluate(async (size) => {
    document.documentElement.style.setProperty('--tile', `${size}px`);
    const svg = await (await fetch('/tests/fixtures/start-page/lissajous-trefoil.svg')).text();
    const tile = document.getElementById('tile');
    window.__handle = await window.Vectura.StartPageInk.mount(tile, { id: 'trefoil', svg }, { colorway: { paper: '#f4efe4', ink: '#7a3b1e', ink2: null, key: 'k' }, fit: 'contain' });
  }, SIZE);
};

const hasWebGL = (page) => page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });

test.describe('Start Page hover effects v2 (WebGL)', () => {
  for (const id of GL_EFFECTS) {
    test(`${id}: hands off, runs, settles to rest and hands the ink layer back`, async ({ page }) => {
      await setup(page);
      test.skip(!(await hasWebGL(page)), 'no WebGL in this browser');
      const r = await page.evaluate(async ({ id, budget }) => {
        const H = window.Vectura.StartPageHoverFx; const tile = document.getElementById('tile'); const cap = document.getElementById('cap');
        const capBefore = JSON.stringify(cap.getBoundingClientRect());
        const ctl = H.attach(tile, id, { handle: window.__handle, manual: true, hovering: false });
        await ctl.ready;
        const inner = ctl.inner;
        if (!inner || !inner.ok) return { error: 'effect did not initialise' };
        const W = tile.clientWidth; const wrap = tile.querySelector('.sp-hfx-wrap');
        inner.stats.reset();
        inner.input('enter', W * 0.2, W * 0.3);
        let midHidden = false;
        for (let i = 0; i < 100; i++) {
          inner.input('move', W * (0.2 + 0.6 * i / 100), W * (0.3 + 0.3 * Math.sin(i / 12)));
          inner._advance(1 / 60, 1 / 60);
          if (i === 60) midHidden = tile.querySelector('.sp-ink-art').style.visibility === 'hidden';
        }
        inner.input('tap', W * 0.5, W * 0.5); inner._advance(0.2);
        const wr = wrap.getBoundingClientRect(); const tr = tile.getBoundingClientRect();
        const inside = wr.left >= tr.left - 1 && wr.top >= tr.top - 1 && wr.right <= tr.right + 1 && wr.bottom <= tr.bottom + 1;
        const capDuring = JSON.stringify(cap.getBoundingClientRect());
        inner.input('leave', W * 0.8, W * 0.5);
        let t = 0; while (!inner.idle && t < budget + 6) t += inner._advance(0.1);
        const s = inner.stats;
        const out = {
          settle: t, idle: inner.idle, midHidden, inside, capSame: capBefore === capDuring,
          inkBack: tile.querySelector('.sp-ink-art').style.visibility === '', wrapOn: wrap.classList.contains('on'),
          frames: s.frames, avg: s.avg, p95: s.p95,
        };
        ctl.destroy();
        out.gone = !tile.querySelector('.sp-hfx-wrap');
        return out;
      }, { id, budget: SETTLE_BUDGET });
      expect(r.error).toBeUndefined();
      expect(r.midHidden, 'the ink layer is hidden while the effect owns the art').toBe(true);
      expect(r.inside, 'the surface stays inside the art element').toBe(true);
      expect(r.capSame, 'the caption beside the art is untouched').toBe(true);
      expect(r.idle, `at rest after ${r.settle.toFixed(2)} s`).toBe(true);
      expect(r.settle, `settle time after pointer leave (${r.settle.toFixed(2)} s)`).toBeLessThanOrEqual(SETTLE_BUDGET);
      expect(r.inkBack).toBe(true);
      expect(r.wrapOn).toBe(false);
      expect(r.frames).toBeGreaterThan(100);
      expect(r.gone).toBe(true);
    });

    test(`${id}: Still shows the still frame with no animation frames`, async ({ page }) => {
      await setup(page);
      test.skip(!(await hasWebGL(page)), 'no WebGL in this browser');
      const r = await page.evaluate(async (id) => {
        const H = window.Vectura.StartPageHoverFx; const tile = document.getElementById('tile');
        window.Vectura.StartPageInk.setMotion({ still: true }); // the app's Still toggle; the loader reads StartPageInk.isStill()
        const ctl = H.attach(tile, id, { handle: window.__handle, manual: true, hovering: false });
        await ctl.ready;
        const inner = ctl.inner; const W = tile.clientWidth;
        inner.input('enter', W * 0.4, W * 0.4);
        for (let i = 0; i < 20; i++) inner.input('move', W * 0.4 + i, W * 0.4);
        const out = { active: inner.active, frames: inner.stats.frames, still: tile.querySelector('.sp-hfx-wrap').classList.contains('still') };
        inner.input('leave', 0, 0);
        await new Promise((res) => setTimeout(res, 450));
        out.afterLeave = tile.querySelector('.sp-hfx-wrap').classList.contains('on');
        out.inkVisible = tile.querySelector('.sp-ink-art').style.visibility === '';
        ctl.destroy(); window.Vectura.StartPageInk.setMotion({ still: false });
        return out;
      }, id);
      expect(r.active).toBe(false);
      expect(r.frames).toBe(0);
      expect(r.still).toBe(true);
      expect(r.afterLeave).toBe(false);
      expect(r.inkVisible).toBe(true);
    });
  }
});

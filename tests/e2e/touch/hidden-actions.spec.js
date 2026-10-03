const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const touch = require('../helpers/touch');

// TUX-036: no hidden-but-tappable actions on touch.
//  A  hidden <=> not hittable (layer row action strips)
//  B  tapping where a hidden Delete sits selects the row; it never deletes
//  C  no visible-but-dead strip after tapping the eye
//  D  modifier bar has no sticky :hover after a tap
//  E  preset gallery: Delete / Revert / Set-default reachable, Delete is two-tap on touch
//  F  static guard: reveal-on-hover rules sit inside @media (hover: hover)
//  G  Delete is >= 8 px from its neighbour on coarse pointers
//
// Row action strips (.lvl-acts / .lvl-grp-acts) belong to the desktop row template. The touch
// template (pointer: coarse) swaps them for the TUX-034 "more" button. A hybrid device (iPad with
// a trackpad, a fine primary pointer while fingers still tap) renders the desktop template and
// takes touch taps. "hybrid" mode below reproduces that by reporting (pointer: coarse) as false
// to the app only; CSS media queries still see the real touch emulation, which is the
// case where :hover sticks and the hidden strip sits under a finger.

const CSS_FILE = path.join(__dirname, '..', '..', '..', 'src', 'ui', 'skin', 'components.css');
const HIDDEN_BELOW = 0.1; // effective opacity treated as invisible (dim states such as .vis-off .4 stay visible)

const stubFinePointer = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    const res = real(q);
    if (/pointer:\s*coarse/.test(String(q))) {
      return new Proxy(res, { get: (t, k) => (k === 'matches' ? false : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
    }
    return res;
  };
};

const boot = async (page, { hybrid = false } = {}) => {
  if (hybrid) await page.addInitScript(stubFinePointer);
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine));
};

// Copied from docs/touch-audit/scripts/target-audit.js openPane (kept free of pane-handle DOM).
const openPane = async (page, side) => {
  await page.evaluate((s) => {
    const pane = document.getElementById(s === 'left' ? 'left-pane' : 'right-pane');
    const auto = document.body.classList.contains('auto-collapsed');
    const open = auto ? pane.classList.contains('pane-force-open') : !pane.classList.contains('pane-collapsed');
    if (open) return;
    const mob = document.getElementById(s === 'left' ? 'btn-mobile-pane-left' : 'btn-mobile-pane-right');
    const tog = document.getElementById(s === 'left' ? 'btn-pane-toggle-left' : 'btn-pane-toggle-right');
    const btn = (mob && mob.offsetParent) ? mob : tog;
    btn.click();
  }, side);
  await page.waitForTimeout(450);
};

// 3 plain layers + 1 group holding 2 of them. Active = first child (inside the group).
const buildFixture = async (page) => {
  const ids = await page.evaluate(() => {
    const { app } = window;
    const e = app.engine;
    const a = e.addLayer('spiral');
    const b = e.addLayer('spiral');
    const c = e.addLayer('spiral');
    const g = e.addGroupLayer();
    e.getLayerById(a).parentId = g;
    e.getLayerById(b).parentId = g;
    app.renderer.setSelection([a], a);
    e.activeLayerId = a;
    app.ui.renderLayers();
    return { a, b, c, g };
  });
  await openPane(page, 'right');
  await page.evaluate(() => window.app.ui.renderLayers());
  await page.waitForTimeout(250);
  return ids;
};

const layerIds = (page) => page.evaluate(() => window.app.engine.layers.map((l) => l.id));
const activeId = (page) => page.evaluate(() => window.app.engine.activeLayerId);
const setActive = async (page, id) => {
  await page.evaluate((i) => {
    window.app.renderer.setSelection([i], i);
    window.app.engine.activeLayerId = i;
    window.app.ui.renderLayers();
  }, id);
  await page.waitForTimeout(300);
};

// In-page probe: visibility, effective opacity, rect and hit target of one element.
const probeFn = (el) => {
  const vis = el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  let op = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const inView = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight && r.width > 0 && r.height > 0;
  const hit = inView ? document.elementFromPoint(cx, cy) : null;
  return { vis, op, inView, hittable: !!hit && (hit === el || el.contains(hit)), hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ').join('.')}` : null };
};

const HIDE_SEL = '#layer-list .lvl-ab, #layer-list .lvl-ib, #layer-list .lvl-grp-acts button, #layer-list .lvl-acts button';

const hiddenButHittable = (page) => page.evaluate(({ sel, below, fn }) => {
  const probe = new Function(`return (${fn})`)();
  const bad = [];
  document.querySelectorAll(sel).forEach((el) => {
    const p = probe(el);
    const hidden = !p.vis || p.op < below;
    if (hidden && p.hittable) {
      const row = el.closest('[data-layer-id]');
      bad.push(`${el.className} in ${row ? row.className : '?'} op=${p.op} vis=${p.vis} hit=${p.hit}`);
    }
  });
  return bad;
}, { sel: HIDE_SEL, below: HIDDEN_BELOW, fn: probeFn.toString() });

const probe = (page, selector) => page.evaluate(({ selector, fn }) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  return new Function(`return (${fn})`)()(el);
}, { selector, fn: probeFn.toString() });

for (const mode of ['natural', 'hybrid']) {
  test.describe(`layer rows (${mode})`, () => {
    test.beforeEach(async ({ page }) => {
      await boot(page, { hybrid: mode === 'hybrid' });
      await buildFixture(page);
    });

    test('A: hidden row actions are never hittable', async ({ page }) => {
      expect(await hiddenButHittable(page), 'hidden but hittable (selector, effective opacity, hit)').toEqual([]);
      // Also after activating a different row (active strip moves).
      const ids = await layerIds(page);
      await setActive(page, ids[2]);
      expect(await hiddenButHittable(page)).toEqual([]);
    });

    test('B: tap on a hidden Delete selects the card, never deletes', async ({ page }) => {
      test.skip(mode === 'natural', 'touch template has no inline Delete strip; hybrid mode covers it');
      const { a, c, g } = await page.evaluate(() => {
        const L = window.app.engine.layers;
        return { a: L.find((l) => l.parentId).id, c: L.find((l) => !l.parentId && !l.isGroup).id, g: L.find((l) => l.isGroup).id };
      });
      const before = await layerIds(page);
      expect(await activeId(page)).toBe(a);

      // Leaf card.
      const del = page.locator(`#layer-list [data-layer-id="${c}"] .lvl-acts .lvl-ab.del`);
      await del.scrollIntoViewIfNeeded();
      const pt = await del.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2; const y = r.top + r.height / 2;
        const card = el.closest('[data-layer-id]');
        const hit = document.elementFromPoint(x, y);
        return { x, y, inView: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight, inCard: !!hit && card.contains(hit), isBtn: hit === el || el.contains(hit) };
      });
      expect(pt.inView, 'Delete centre is inside the viewport (guards against a vacuous off-screen tap)').toBe(true);
      expect(pt.inCard, 'hit target at Delete centre belongs to the card').toBe(true);
      await touch.tap(page, { x: pt.x, y: pt.y });
      await page.waitForTimeout(350);
      expect(await layerIds(page), 'layer count unchanged').toEqual(before);
      expect(await activeId(page), 'tapped card is now active').toBe(c);
      const acts = await probe(page, `#layer-list [data-layer-id="${c}"] .lvl-acts .lvl-ab.del`);
      expect(acts.vis && acts.hittable, `active row Delete visible and hittable (${JSON.stringify(acts)})`).toBe(true);

      // Group header.
      const gdel = page.locator(`#layer-list [data-layer-id="${g}"] .lvl-grp-acts .lvl-ab.del`);
      await gdel.scrollIntoViewIfNeeded();
      const gp = await gdel.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await touch.tap(page, gp);
      await page.waitForTimeout(350);
      expect(await layerIds(page), 'group count unchanged').toEqual(before);
      expect(await activeId(page)).toBe(g);
    });

    test('C: tapping the eye leaves no visible-but-dead strip', async ({ page }) => {
      const ids = await layerIds(page);
      const c = await page.evaluate(() => window.app.engine.layers.find((l) => !l.parentId && !l.isGroup).id);
      expect(ids).toContain(c);
      const eye = page.locator(`#layer-list [data-layer-id="${c}"] .lvl-ib`).first();
      await eye.scrollIntoViewIfNeeded();
      await touch.tap(page, eye);
      await page.waitForTimeout(350);
      const sel = `#layer-list [data-layer-id="${c}"] .lvl-acts .lvl-ab.del`;
      if (!(await page.locator(sel).count())) return; // touch template: nothing to leave behind
      const p = await probe(page, sel);
      expect(!p.vis || p.hittable, `strip must be hidden, or visible AND hittable (${JSON.stringify(p)})`).toBe(true);
      expect(await hiddenButHittable(page)).toEqual([]);
    });

    test('G: Delete keeps >= 8 px from its neighbour', async ({ page }) => {
      test.skip(mode === 'natural', 'touch template has no inline Delete strip; hybrid mode covers it');
      const gap = (selDel) => page.evaluate((s) => {
        const d = document.querySelector(s);
        const prev = d.previousElementSibling;
        const a = d.getBoundingClientRect();
        const b = prev.getBoundingClientRect();
        return Math.round((a.left - b.right) * 10) / 10;
      }, selDel);
      const c = await page.evaluate(() => window.app.engine.layers.find((l) => !l.parentId && !l.isGroup).id);
      await setActive(page, c);
      expect(await gap(`#layer-list [data-layer-id="${c}"] .lvl-acts .lvl-ab.del`), 'leaf Delete gap').toBeGreaterThanOrEqual(8);
      const g = await page.evaluate(() => window.app.engine.layers.find((l) => l.isGroup).id);
      await setActive(page, g);
      expect(await gap(`#layer-list [data-layer-id="${g}"] .lvl-grp-acts .lvl-ab.del`), 'group Delete gap').toBeGreaterThanOrEqual(8);
    });
  });
}

test('D: modifier bar leaves no sticky :hover colour after a tap', async ({ page }) => {
  await boot(page);
  const btn = page.locator('#touch-modifier-bar [data-touch-mod="shift"]');
  await expect(btn).toBeVisible();
  const read = () => btn.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor, active: el.classList.contains('active') };
  });
  await page.waitForTimeout(300);
  const rest = await read();
  await touch.tap(page, btn);
  await page.waitForTimeout(300);
  expect((await read()).active).toBe(true);
  await touch.tap(page, btn);
  await page.waitForTimeout(300);
  const after = await read();
  expect(after.active).toBe(false);
  expect(after, 'colours equal at-rest values after tap on / tap off').toEqual(rest);
});

// ── Preset gallery ──────────────────────────────────────────────────────────────────────
const SYSTEM = 'harmonograph';
const USER_ID = 'user-harmonograph-tux036';
const USER_ID2 = 'user-harmonograph-tux036b';

const seedAndMount = async (page, { devMode = false, override = false } = {}) => {
  await boot(page);
  const info = await page.evaluate(({ system, userId, devMode, override }) => {
    const V = window.Vectura;
    const lib = V.PresetLibraries[system];
    const dflt = V.ALGO_DEFAULTS[system].preset;
    const builtin = lib.find((p) => p.id !== dflt);
    const list = [
      { id: userId, name: 'Tux Plain', preset_system: system, group: 'User', params: { ...(lib[0].params || {}) } },
      { id: `${userId}b`, name: 'Tux Second', preset_system: system, group: 'User', params: { ...(lib[0].params || {}) } },
    ];
    if (override) list.push({ ...builtin, params: { ...(builtin.params || {}) } });
    localStorage.setItem(`vectura.user_presets.${system}`, JSON.stringify(list));
    V.SETTINGS.devMode = devMode;
    return { builtinId: builtin.id };
  }, { system: SYSTEM, userId: USER_ID, devMode, override });
  await page.evaluate((system) => {
    const id = window.app.engine.addLayer(system);
    window.app.renderer.setSelection([id], id);
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
  }, SYSTEM);
  await openPane(page, 'left');
  return info;
};

const openGallery = async (page) => {
  const trig = page.locator('.hg-preset-trigger').first();
  await trig.scrollIntoViewIfNeeded();
  await touch.tap(page, trig);
  await expect(page.locator('.hg-preset-popover:not([hidden])')).toHaveCount(1);
  await page.waitForTimeout(200);
};

const userIdsInStore = (page) => page.evaluate((s) => (JSON.parse(localStorage.getItem(`vectura.user_presets.${s}`) || '[]')).map((p) => p.id), SYSTEM);
const optSel = (id) => `.hg-preset-option[data-preset-id="${id}"]`;
const revealRow = (page, id) => page.locator(optSel(id)).evaluate((el) => el.scrollIntoView({ block: 'center' }));

test.describe('preset gallery', () => {
  test('E1: user preset row selects on tap; Delete asks for a second tap', async ({ page }) => {
    await seedAndMount(page);
    await openGallery(page);
    await revealRow(page, USER_ID);
    const x = await probe(page, `${optSel(USER_ID)} .hg-preset-delete`);
    expect(x && x.vis && x.hittable, `Delete X visible and hittable at rest (${JSON.stringify(x)})`).toBe(true);

    // Row body applies, never deletes.
    await touch.tap(page, page.locator(`${optSel(USER_ID)} .hg-preset-option-label`));
    await page.waitForTimeout(400);
    expect(await userIdsInStore(page)).toContain(USER_ID);
    expect(await page.evaluate(() => window.app.engine.getActiveLayer?.().params.preset ?? window.app.engine.layers.find((l) => l.id === window.app.engine.activeLayerId).params.preset)).toBe(USER_ID);

    // First tap on X arms, second deletes. Deleting a non-active preset keeps the popover open
    // (deleting the active one re-mounts the panel by design: it falls back to Custom).
    await openGallery(page);
    await revealRow(page, USER_ID2);
    await touch.tap(page, page.locator(`${optSel(USER_ID2)} .hg-preset-delete`));
    await page.waitForTimeout(250);
    expect(await userIdsInStore(page), 'first tap must not delete').toContain(USER_ID2);
    await expect(page.locator(`${optSel(USER_ID2)} .hg-preset-delete.is-armed`)).toHaveCount(1);
    await touch.tap(page, page.locator(`${optSel(USER_ID2)} .hg-preset-delete`));
    await page.waitForTimeout(300);
    expect(await userIdsInStore(page)).not.toContain(USER_ID2);
    expect(await userIdsInStore(page)).toContain(USER_ID);
    await expect(page.locator('.hg-preset-popover:not([hidden])')).toHaveCount(1);
  });

  test('E1b: an armed Delete disarms when the user taps elsewhere', async ({ page }) => {
    await seedAndMount(page);
    await openGallery(page);
    await revealRow(page, USER_ID);
    await touch.tap(page, page.locator(`${optSel(USER_ID)} .hg-preset-delete`));
    await expect(page.locator('.hg-preset-delete.is-armed')).toHaveCount(1);
    await touch.tap(page, page.locator('.hg-preset-popover .hg-preset-group-title').first());
    await page.waitForTimeout(250);
    await expect(page.locator('.hg-preset-delete.is-armed')).toHaveCount(0);
    expect(await userIdsInStore(page)).toContain(USER_ID);
  });

  test('E2: Revert on a built-in override is visible and hittable', async ({ page }) => {
    const { builtinId } = await seedAndMount(page, { override: true });
    await openGallery(page);
    await revealRow(page, builtinId);
    const r = await probe(page, `${optSel(builtinId)} .hg-preset-revert`);
    expect(r && r.vis && r.hittable, `Revert visible and hittable (${JSON.stringify(r)})`).toBe(true);
  });

  test('E3: dev-mode Set-default and group select are visible and hittable', async ({ page }) => {
    await seedAndMount(page, { devMode: true });
    await openGallery(page);
    await revealRow(page, USER_ID);
    const s = await probe(page, `${optSel(USER_ID)} .hg-preset-set-default`);
    expect(s && s.vis && s.hittable, `Set-default visible and hittable (${JSON.stringify(s)})`).toBe(true);
    const g = await probe(page, `${optSel(USER_ID)} .hg-preset-group-select`);
    expect(g && g.vis && g.op >= 0.5 && g.hittable, `Group select fully shown (${JSON.stringify(g)})`).toBe(true);
  });
});

// ── F: static guard ─────────────────────────────────────────────────────────────────────
// Every rule whose selector list contains one of these reveal-on-hover selectors must sit in an
// @media (hover: hover) block. Brace-depth parse; tracks the enclosing @media prelude stack.
const GUARDED = [
  '.lvl-card:hover .lvl-acts',
  '.lvl-grp-hdr:hover .lvl-grp-acts',
  '.hg-preset-option:hover .hg-preset-delete',
  '.hg-preset-option:hover .hg-preset-set-default',
  '.hg-preset-option:hover .hg-preset-group-select',
  '#touch-modifier-bar button:hover',
  '.touch-modifier-bar button:hover',
];

const scanRules = (css) => {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const rules = [];
  const stack = []; // { media: string|null }
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') {
      const prelude = src.slice(start, i).trim();
      const line = src.slice(0, i).split('\n').length;
      stack.push({ prelude });
      if (!prelude.startsWith('@')) {
        rules.push({ selector: prelude, line, media: stack.slice(0, -1).filter((s) => /^@media/.test(s.prelude)).map((s) => s.prelude) });
      }
      start = i + 1;
    } else if (ch === '}') {
      stack.pop();
      start = i + 1;
    } else if (ch === ';' && stack.length === 0) {
      start = i + 1;
    }
  }
  return rules;
};

test('F: reveal-on-hover rules sit inside @media (hover: hover)', () => {
  const rules = scanRules(fs.readFileSync(CSS_FILE, 'utf8'));
  const offenders = [];
  let seen = 0;
  GUARDED.forEach((needle) => {
    rules.forEach((r) => {
      const parts = r.selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ').replace(/^\[data-ui-skin\]\s*/, ''));
      if (!parts.includes(needle)) return;
      seen += 1;
      if (!r.media.some((m) => /\(hover:\s*hover\)/.test(m))) offenders.push(`${needle} @ components.css:${r.line}`);
    });
  });
  expect(seen, 'guard found the rules it protects').toBeGreaterThanOrEqual(GUARDED.length);
  expect(offenders).toEqual([]);
});

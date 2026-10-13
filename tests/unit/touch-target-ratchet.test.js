/*
 * TUX-058: the touch target audit ratchet. Pure-Node proof of the comparator, the update merge,
 * the final-mode targets and the baseline serializer. The e2e spec
 * (tests/e2e/touch/target-audit.spec.js) measures the live app; this file proves the decision
 * logic it applies, so a regression in the ratchet itself fails fast.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../e2e/helpers/target-audit-core');

const base = () => ({
  hOverflow: 0, vOverflow: 0, innerWidthExcess: 0, under44: 5, under24: 2, wcag258Fail: 1, iosZoom: 0,
  covered: 3, safeUnprotected: 4, ghost: 0, stranded: 0, reachable: 19, pageErrors: 0, canvasPct: 44.5, scaleOk: false,
});

describe('compareCell (ratchet comparator)', () => {
  it('passes an identical cell', () => {
    const c = core.compareCell(base(), base());
    expect(c.worse).toEqual([]);
    expect(c.better).toEqual([]);
  });

  it('(i) a baseline cell 1 lower than measured fails as "rose"', () => {
    const b = base(); b.under44 -= 1;
    const c = core.compareCell(b, base());
    expect(c.worse.map((w) => w.metric)).toEqual(['under44']);
    expect(core.formatCompare('p|s', c)[0]).toBe('p|s|under44 rose: baseline 4, got 5');
  });

  it('(ii) a baseline cell 1 higher than measured fails as "ratchet down"', () => {
    const b = base(); b.under44 += 1;
    const c = core.compareCell(b, base());
    expect(c.better.map((w) => w.metric)).toEqual(['under44']);
    expect(core.formatCompare('p|s', c)[0]).toBe('ratchet down: p|s|under44 6 -> 5; run TOUCH_BASELINE=update');
  });

  it('canvasPct is higher-better with +/-1.0 pp tolerance', () => {
    const m = base();
    m.canvasPct = 43.6;
    expect(core.compareCell(base(), m).worse).toEqual([]);
    m.canvasPct = 43.4;
    expect(core.compareCell(base(), m).worse.map((w) => w.metric)).toEqual(['canvasPct']);
    m.canvasPct = 45.6;
    expect(core.compareCell(base(), m).better.map((w) => w.metric)).toEqual(['canvasPct']);
    expect(core.formatCompare('p|s', core.compareCell(base(), { ...base(), canvasPct: 40 }))[0]).toMatch(/canvasPct fell/);
  });

  it('scaleOk: true -> false is a regression, false -> true is a ratchet down', () => {
    const t = { ...base(), scaleOk: true };
    expect(core.compareCell(t, { ...t, scaleOk: false }).worse.map((w) => w.metric)).toEqual(['scaleOk']);
    expect(core.compareCell(base(), { ...base(), scaleOk: true }).better.map((w) => w.metric)).toEqual(['scaleOk']);
  });

  it('metricIds limits the comparison (browser-chrome variants)', () => {
    const m = { ...base(), under44: 99, canvasPct: 44.5 };
    expect(core.compareCell(base(), m, undefined, core.CHROME_METRICS).worse).toEqual([]);
    expect(core.compareCell(base(), { ...m, hOverflow: 7 }, undefined, core.CHROME_METRICS).worse.map((w) => w.metric)).toEqual(['hOverflow']);
  });

  it('a missing baseline metric is reported, never silently passed', () => {
    const b = base(); delete b.ghost;
    expect(core.compareCell(b, base()).worse.map((w) => w.kind)).toEqual(['missing']);
  });
});

describe('stranded and reachable guards', () => {
  it('stranded is lower-better: a rise is worse, a drop is a ratchet down', () => {
    expect(core.compareCell(base(), { ...base(), stranded: 2 }).worse.map((w) => w.metric)).toEqual(['stranded']);
    expect(core.formatCompare('p|s', core.compareCell(base(), { ...base(), stranded: 2 }))[0]).toBe('p|s|stranded rose: baseline 0, got 2');
    expect(core.compareCell({ ...base(), stranded: 2 }, base()).better.map((w) => w.metric)).toEqual(['stranded']);
  });
  it('reachable is higher-better with tolerance 0: a drop is worse, a rise is a ratchet down', () => {
    expect(core.METRICS.find((m) => m.id === 'reachable')).toMatchObject({ dir: 'higher', tol: 0 });
    const c = core.compareCell(base(), { ...base(), reachable: 16 });
    expect(c.worse.map((w) => w.metric)).toEqual(['reachable']);
    expect(core.formatCompare('p|s', c)[0]).toBe('p|s|reachable fell: baseline 19, got 16');
    expect(core.compareCell(base(), { ...base(), reachable: 20 }).better.map((w) => w.metric)).toEqual(['reachable']);
    expect(core.compareCell(base(), { ...base(), reachable: 19 }).worse).toEqual([]);
  });
  it('removing controls is worse even though every under-N count and the overflow fall', () => {
    const removed = { ...base(), under44: 2, under24: 0, wcag258Fail: 0, canvasPct: 49.9, reachable: 16 };
    expect(core.compareCell(base(), removed).worse.map((w) => w.metric)).toEqual(['reachable']);
  });
  it('clipping the overflow away is worse even though hOverflow falls to 0', () => {
    const before = { ...base(), hOverflow: 142, vOverflow: 309, innerWidthExcess: 142 };
    const clipped = { ...base(), stranded: 2 };
    expect(core.compareCell(before, clipped).worse.map((w) => w.metric)).toEqual(['stranded']);
  });
  it('update mode never lowers reachable and never raises stranded without update-any', () => {
    const merged = core.mergeCell(base(), { ...base(), reachable: 10, stranded: 4 });
    expect(merged.reachable).toBe(19);
    expect(merged.stranded).toBe(0);
    const waived = core.mergeCell(base(), { ...base(), reachable: 10, stranded: 4 }, undefined, true);
    expect(waived.reachable).toBe(10);
    expect(waived.stranded).toBe(4);
  });
  it('final mode gates stranded at 0', () => {
    const z = { ...base(), under44: 0, under24: 0, wcag258Fail: 0, safeUnprotected: 0, covered: 0, scaleOk: true, canvasPct: 99, stranded: 3 };
    expect(core.compareFinal(z, { device: 'iPhP', state: 'default', dockedPanes: 0 })).toEqual(['final: stranded 3 > 0']);
  });
  it('summarizeState derives stranded from the page record and reachable from reachable items', () => {
    const it = (o) => ({ onscreen: true, reach: true, hitState: 'ok', hig44: true, min24: true, wcag258: true, iosZoom: false, allow: false, safeUnprotected: [], ...o });
    const s = core.summarizeState({ items: [it(), it(), it({ hitState: 'covered', reach: false }), it({ onscreen: false, hitState: 'offscreen', reach: false })], stranded: 3 });
    expect(s).toMatchObject({ stranded: 3, reachable: 2 });
  });
});

describe('mergeCell (update mode never worsens)', () => {
  it('keeps the better value per metric', () => {
    const merged = core.mergeCell(base(), { ...base(), under44: 9, under24: 0, canvasPct: 30, scaleOk: true });
    expect(merged.under44).toBe(5);
    expect(merged.under24).toBe(0);
    expect(merged.canvasPct).toBe(44.5);
    expect(merged.scaleOk).toBe(true);
  });
  it('update-any writes the measured values as they are', () => {
    const merged = core.mergeCell(base(), { ...base(), under44: 9, canvasPct: 30 }, undefined, true);
    expect(merged.under44).toBe(9);
    expect(merged.canvasPct).toBe(30);
  });
  it('seeds a new cell with the measured values', () => {
    expect(core.mergeCell(undefined, base())).toEqual(base());
  });
});

describe('compareFinal (final targets, TOUCH_TARGET_MODE=final)', () => {
  it('every lower-better metric must be 0', () => {
    const msgs = core.compareFinal({ ...base(), canvasPct: 80, scaleOk: true }, { device: 'iPhP', state: 'default', dockedPanes: 0 });
    expect(msgs.some((m) => m.includes('under44 5 > 0'))).toBe(true);
    expect(msgs.some((m) => m.includes('hOverflow'))).toBe(false);
  });
  it('covered is gated in the default state only', () => {
    const z = { ...base(), under44: 0, under24: 0, wcag258Fail: 0, safeUnprotected: 0, scaleOk: true, canvasPct: 99 };
    expect(core.compareFinal(z, { device: 'iPhP', state: 'default', dockedPanes: 0 })).toEqual(['final: covered 3 > 0']);
    expect(core.compareFinal(z, { device: 'iPhP', state: 'menu-file', dockedPanes: 0 })).toEqual([]);
  });
  it('canvas thresholds follow section 1.5 (iPadL by docked pane count)', () => {
    expect(core.finalCanvasMin('iPadP', 'default', 0)).toBe(70);
    expect(core.finalCanvasMin('iPadL', 'default', 2)).toBe(45);
    expect(core.finalCanvasMin('iPadL', 'default', 1)).toBe(60);
    expect(core.finalCanvasMin('iPadL', 'default', 0)).toBe(75);
    expect(core.finalCanvasMin('iPhP', 'default', 0)).toBe(60);
    expect(core.finalCanvasMin('iPhL', 'default', 0)).toBe(60);
    expect(core.finalCanvasMin('iPhP-c', 'default', 0)).toBe(50);
  });
  it('scaleOk must be true', () => {
    const z = { ...base(), under44: 0, under24: 0, wcag258Fail: 0, safeUnprotected: 0, covered: 0, canvasPct: 99 };
    expect(core.compareFinal(z, { device: 'iPhL', state: 'default', dockedPanes: 0 })).toEqual(['final: scaleOk false']);
  });
  it('chrome variants gate only canvasPct and overflow', () => {
    expect(core.compareFinal({ ...base(), canvasPct: 10 }, { device: 'iPhP-c', state: 'default', dockedPanes: 0, chrome: true })).toEqual([expect.stringContaining('canvasPct 10 < 50')]);
  });
});

describe('summarizeState', () => {
  const item = (o) => ({ onscreen: true, reach: true, hitState: 'ok', hig44: true, min24: true, wcag258: true, iosZoom: false, allow: false, safeUnprotected: [], ...o });
  it('counts probed under-44 on reachable, non-allowlisted items only', () => {
    const s = core.summarizeState({
      items: [
        item({ hig44: false }), item({ hig44: false, allow: true }), item({ hig44: false, min24: false, wcag258: false }),
        item({ hig44: false, hitState: 'covered', reach: false }), item(), item({ iosZoom: true, safeUnprotected: ['top'] }),
      ],
      hOverflow: 5, innerWidthExcess: -3, canvasPct: 12, scaleOk: 1, ghost: 2, pageErrors: ['x'], pageErrorCount: 4,
    });
    expect(s).toMatchObject({ under44: 2, under24: 1, wcag258Fail: 1, iosZoom: 1, covered: 1, safeUnprotected: 1, hOverflow: 5, innerWidthExcess: 0, ghost: 2, pageErrors: 4, canvasPct: 12, scaleOk: true });
  });
});

describe('isBenignPageError', () => {
  it('ignores ResizeObserver loop notifications only', () => {
    expect(core.isBenignPageError('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(core.isBenignPageError('ResizeObserver loop limit exceeded')).toBe(true);
    expect(core.isBenignPageError("TypeError: Cannot read properties of undefined (reading 'x')")).toBe(false);
  });
});

describe('serializeBaseline', () => {
  const doc = () => ({
    _measuredAt: 'abc1234',
    linux: { 'z-proj': { b: base() } },
    darwin: { 'p2': { 'x': base(), 'a': base() }, 'p1': { default: base() } },
  });
  it('writes sorted keys, one line per project|state cell, and round-trips', () => {
    const text = core.serializeBaseline(doc());
    const lines = text.trim().split('\n');
    const cellLines = lines.filter((l) => l.includes('|'));
    expect(cellLines).toHaveLength(4);
    expect(cellLines.every((l) => l.trimEnd().match(/\{.*\},?$/))).toBe(true);
    expect(cellLines.map((l) => l.trim().split('"')[1])).toEqual(['p1|default', 'p2|a', 'p2|x', 'z-proj|b']);
    expect(text.indexOf('"darwin"')).toBeLessThan(text.indexOf('"linux"'));
    expect(core.parseBaseline(text)).toEqual(doc());
    expect(core.serializeBaseline(core.parseBaseline(text))).toBe(text);
  });
  it('merges concurrent cell writes from a fresh read (atomic, lock + rename)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tux058-'));
    const file = path.join(dir, 'baseline.json');
    fs.writeFileSync(file, '{}\n');
    core.updateBaselineCell(file, 'darwin', 'p1', 'default', base(), {});
    core.updateBaselineCell(file, 'darwin', 'p2', 'menu-file', { ...base(), under44: 1 }, { measuredAt: 'deadbee' });
    const back = core.readBaseline(file);
    expect(back.darwin.p1.default.under44).toBe(5);
    expect(back.darwin.p2['menu-file'].under44).toBe(1);
    expect(back._measuredAt).toBe('deadbee');
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('canvasShareExactInPage (TUX-058 exact canvas area)', () => {
  const canvas = { id: 'main-canvas', contains: (h) => h === canvas };
  const mk = (strips, canvasRect) => {
    const chrome = { id: 'chrome', contains: () => false };
    const hit = (x, y) => (strips.some((s) => x >= s.left && x < s.right && y >= s.top && y < s.bottom) ? chrome : canvas);
    return { canvas, canvasRect: canvasRect || { left: 0, right: 1000, top: 0, bottom: 1000 }, rects: strips, hit };
  };
  // Two 114 px strips on a 1000 px viewport: exact chrome = 22.8 %. A 48-row grid samples the
  // rows at 93.75 / 114.6 and counts only 5 + 5 rows (20.8 %): 2 pp too much canvas.
  const strips = [
    { left: 0, right: 1000, top: 0, bottom: 114 },
    { left: 0, right: 1000, top: 886, bottom: 1000 },
  ];
  const grid = (env, N = 48) => {
    let hits = 0;
    for (let gx = 0; gx < N; gx += 1) for (let gy = 0; gy < N; gy += 1) if (env.hit((gx + 0.5) * 1000 / N, (gy + 0.5) * 1000 / N) === canvas) hits += 1;
    return +(100 * hits / (N * N)).toFixed(1);
  };
  it('differs from the 48-cell grid by more than 1 pp and returns the exact value', () => {
    const env = mk(strips);
    expect(grid(env)).toBeCloseTo(79.2, 1);
    const exact = core.canvasShareExactInPage({ W: 1000, H: 1000 }, env);
    expect(exact).toBe(77.2);
    expect(Math.abs(grid(env) - exact)).toBeGreaterThan(1);
  });
  it('takes the union of overlapping covers and clips to the viewport', () => {
    const env = mk([...strips, { left: 0, right: 500, top: 50, bottom: 300 }], { left: -100, right: 1000, top: 0, bottom: 1000 });
    // canvas clipped to x 0..1000 (full width); extra block adds x 0..500, y 114..300 = 9.3 %
    expect(core.canvasShareExactInPage({ W: 1000, H: 1000 }, env)).toBe(67.9);
  });
});

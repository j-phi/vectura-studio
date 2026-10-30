/**
 * @vitest-environment jsdom
 *
 * P4 ux lane: Still stops the page-enter animation (CSS), lazy hover-fx URLs keep the release query, US spelling of the
 * Micron gray, the art provider has one source (StartPageArtSource), the cover Colorways fan.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('item 8: Still stops the .sp enter animation', () => {
  test('motion.css has a Still rule that clears the animation on .sp', () => {
    const css = read('src/ui/skin/motion.css');
    expect(css).toMatch(/\[data-sp-motion="still"\][^{}]*\.sp\b[^{}-][^{}]*\{[^}]*animation:\s*none/);
  });
});

describe('item 12: hover-fx lazy URLs keep the ?v= release query', () => {
  test('a script loaded for an effect carries the index.js query', async () => {
    delete window.Vectura; window.Vectura = {};
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    Object.defineProperty(document, 'currentScript', { configurable: true, value: { src: 'http://localhost/src/ui/start-page/hover-fx/index.js?v=9.9.9' } });
    const fetched = [];
    const realAppend = document.head.appendChild.bind(document.head);
    document.head.appendChild = (n) => { if (n && n.tagName === 'SCRIPT') { fetched.push(n.src); return n; } return realAppend(n); };
    try {
      window.eval(read('src/ui/start-page/hover-fx/index.js'));
      const el = document.createElement('div');
      window.Vectura.StartPageHoverFx.attach(el, 'lift', { handle: {} });
      window.Vectura.StartPageHoverFx.attach(document.createElement('div'), 'holo', { handle: {} });
      await new Promise((r) => setTimeout(r, 20));
    } finally { document.head.appendChild = realAppend; delete document.currentScript; }
    expect(fetched[0]).toBe('http://localhost/src/ui/start-page/hover-fx/lift.js?v=9.9.9');
    expect(fetched.every((u) => /\?v=9\.9\.9$/.test(u))).toBe(true);
  });
});

describe('item 14: US spelling', () => {
  test('no user-visible "Grey" in the pen model and the colorway catalogue', () => {
    expect(read('src/config/pen-models.js')).not.toMatch(/Grey \(cool\)/);
    expect(read('src/config/start-page-colorways.js')).not.toMatch(/Grey \(cool\)/);
    expect(read('src/config/pen-models.js')).toMatch(/Gray \(cool\)/);
  });
});

describe('item 15: art provider has no divergent recents fallback', () => {
  test('without an art source the provider lists nothing instead of building its own Art', async () => {
    delete window.Vectura; window.Vectura = {};
    window.eval(read('src/ui/start-page/art-provider.js'));
    const P = window.Vectura.StartPageArtProvider;
    expect(P.fromEntry).toBeUndefined();
    const app = { recents: { store: { listWorks: async () => [{ id: 'r1', name: 'a.vectura', thumb: { kind: 'svg', data: '<svg viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>' } }] } } };
    expect(await P.create(app).list()).toEqual([]);
  });
});

const rule = (css, sel) => { const out = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m; while ((m = re.exec(css))) { if (m[1].split(',').some((x) => x.trim() === sel)) out.push(m[2]); } return out.join(';'); };

describe('sweep (a): fan captions and heading are never clipped', () => {
  const css = read('src/ui/skin/components.css');
  test('caption wraps instead of ellipsizing', () => {
    const r = rule(css, '.sp-fan-cap');
    expect(r).not.toMatch(/nowrap/);
    expect(r).not.toMatch(/text-overflow/);
  });
  test('heading wraps instead of ellipsizing', () => {
    expect(rule(css, '.sp-fan-head')).not.toMatch(/nowrap/);
    expect(rule(css, '.sp-fan-head span')).not.toMatch(/text-overflow/);
  });
});

describe('sweep (b): narrow header chrome and keyboard hints', () => {
  const css = read('src/ui/skin/components.css');
  test('Ctrl+N / Ctrl+O hints are hidden on coarse pointers and at narrow widths', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{[^@]*\.sp-co-btn kbd\s*\{\s*display:\s*none/);
    expect(css).toMatch(/@container sp \(max-width: 460px\)\s*\{[^@]*\.sp-co-btn kbd\s*\{\s*display:\s*none/);
  });
});

describe('sweep (d): Resume has a visible focus ring', () => {
  const css = read('src/ui/skin/components.css');
  test('rail Resume and strip Resume use an inset ring like the recent rows', () => {
    expect(rule(css, '.sp-cont:focus-visible .sp-cth')).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--ui-accent\)/);
    expect(rule(css, '.sp-co-btn:focus-visible')).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--ui-accent\)/);
  });
});

describe('sweep (e): Community gap on narrow', () => {
  test('the stacked grid has a tight gap and an empty status takes no room', () => {
    const css = read('src/ui/skin/components.css');
    expect(css).toMatch(/max-width: 1100px\)\s*\{[^@]*\.sp-cm-grid\s*\{[^}]*gap:\s*(1\d|2\d)px/);
    expect(rule(css, '.sp-cm-status:empty')).toMatch(/display:\s*none|min-height:\s*0/);
  });
});

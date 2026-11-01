/**
 * @vitest-environment jsdom
 *
 * Start Page plate layouts (src/ui/start-page/plates/layouts.js): every layout renders for landscape, portrait,
 * square and 3D art, words are SVG sized from the real ink box, buttons are slots, nothing unsafe is injected.
 */
const fs = require('fs');
const path = require('path');

const SRC = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8');
const fixture = (n) => fs.readFileSync(path.resolve(__dirname, '../fixtures/start-page', n), 'utf8');

const ctxStub = () => new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 52, actualBoundingBoxLeft: 3, actualBoundingBoxRight: String(s).length * 52 - 4, actualBoundingBoxAscent: 74, actualBoundingBoxDescent: /[gjpqy]/.test(s) ? 22 : 0, fontBoundingBoxAscent: 92, fontBoundingBoxDescent: 24 });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

const FILES = ['src/core/start-page/art-geometry.js', 'src/core/start-page/plate-rhythm.js', 'src/core/start-page/plate-type.js',
  'src/ui/start-page/ink.js', 'src/ui/start-page/plates/layouts.js'];

const load = () => {
  vi.resetModules();
  delete window.Vectura;
  window.Vectura = {};
  HTMLCanvasElement.prototype.getContext = function () { if (!this._ctx) this._ctx = ctxStub(); return this._ctx; };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.Vectura.StartPageColorway = { contrast: () => 7, ensureContrast: (i) => ({ hex: i }) };
  FILES.forEach((f) => window.eval(SRC(f)));
  return window.Vectura;
};

const LONG = 'Drift and checks come from the Noise Rack. Radial cracks are separate strokes, ready for a second pen, and a very long sentence that goes on and on to stress the layout of every plate we render here.';
const texts = (over) => Object.assign({
  word: 'Flowgrey', title: 'Riverbed Rorschach', description: LONG, algorithm: 'Flowfield · Mirror',
  specs: [['Paper', 'A3 · 297 × 420 mm'], ['Pen', 'Triplus 0.3 Burnt Sienna'], ['Stock', 'Cotton rag · buff'], ['Plot time', '≈ 2 h 35 min']],
}, over || {});
const CW = { id: 'buff-sienna', ground: '#f6eac7', ink: '#9a3412', accent: '#0c4a6e', class: 'light' };
const svg = fixture('lissajous-trefoil.svg');

describe('StartPagePlateLayouts', () => {
  let L; let R; let V;
  beforeEach(() => { V = load(); L = V.StartPagePlateLayouts; R = V.StartPagePlateRhythm; document.body.innerHTML = ''; });

  const render = (id, o) => L.render(id, Object.assign({
    plate: { id: 'p1', orientation: 'landscape' }, art: { id: 'a', svg }, colorway: CW, index: 4, total: 26, texts: texts(),
  }, o || {}));

  it('exposes the 16 rhythm layout ids', () => {
    expect(L.LAYOUTS).toEqual(Array.from(R.LAYOUTS));
    expect(L.LAYOUTS).toHaveLength(16);
  });

  it('rejects an unknown layout id', () => { expect(() => render('nope')).toThrow(/unknown layout/i); });

  for (const orient of ['landscape', 'portrait', 'square', '3d']) {
    it(`renders every layout for ${orient} art`, () => {
      for (const id of L.LAYOUTS) {
        const el = render(id, { plate: { id: 'p', orientation: orient }, art: { id: 'a', svg, model: orient === '3d' ? 'torus' : undefined } });
        expect(el.nodeType).toBe(1);
        expect(el.classList.contains('spl')).toBe(true);
        expect(el.classList.contains(`spl-lay-${id}`)).toBe(true);
        expect(el.dataset.layout).toBe(id);
        expect(el.querySelectorAll('.spl-print, .spl-crop').length).toBeGreaterThan(0);
        expect(el.querySelector('[data-slot="actions"]')).toBeTruthy();
        expect(el.querySelector('[data-slot="tools"]')).toBeTruthy();
        expect(el.textContent).toContain('Riverbed Rorschach');
        expect(el.style.getPropertyValue('--spl-paper')).toBe(CW.ground);
        if (orient === '3d') expect(el.querySelector('.spl-print[data-3d]')).toBeTruthy();
      }
    });
  }

  it('big words are SVG text whose viewBox holds the real ink box (descender included)', () => {
    const el = render('diptych', { texts: texts({ word: 'Flowgrey' }) });
    const s = el.querySelector('svg.spl-hword');
    expect(s).toBeTruthy();
    const [, , vw, vh] = s.getAttribute('viewBox').split(/\s+/).map(Number);
    const t = s.querySelector('text');
    expect(t.textContent).toBe('Flowgrey');
    const y = +t.getAttribute('y'); const x = +t.getAttribute('x');
    expect(y + 22).toBeLessThanOrEqual(vh);            // descent inside
    expect(x + 8 * 52 - 4).toBeLessThanOrEqual(vw);    // right edge inside
    expect(x).toBeGreaterThan(0);
  });

  it('a word without descenders gets a shorter box than one with', () => {
    const hOf = (w) => +render('diptych', { texts: texts({ word: w }) }).querySelector('svg.spl-hword').getAttribute('viewBox').split(/\s+/)[3];
    expect(hOf('Flowgrey')).toBeGreaterThan(hOf('Flowfield'));
  });

  it('vertical layouts use a rotated word', () => {
    expect(render('vertical-word').querySelector('svg.spl-vword text').getAttribute('transform')).toMatch(/rotate\(-90\)/);
    const both = render('words-both-sides').querySelectorAll('svg.spl-vword');
    expect(both).toHaveLength(2);
    expect(both[1].querySelector('text').getAttribute('transform')).toMatch(/rotate\(90\)/);
  });

  it('waterfall has five sizes of the word with a pen percentage each', () => {
    const el = render('waterfall');
    expect(el.querySelectorAll('.spl-wf-row')).toHaveLength(5);
    expect(el.querySelectorAll('.spl-wf-row svg.spl-hword')).toHaveLength(5);
    expect(el.textContent).toMatch(/PEN 18%/); expect(el.textContent).toMatch(/PEN 100%/);
  });

  it('plot stages draw three partial proofs plus the finished print', () => {
    const el = render('plot-stages');
    expect(el.querySelectorAll('canvas.spl-stage')).toHaveLength(3);
    expect(el.querySelectorAll('.spl-print')).toHaveLength(1);
    expect(el.textContent).toMatch(/Stage 3 · 75%/);
  });

  it('big numeral shows the zero padded plate number; four crops has four crops', () => {
    expect(render('big-numeral', { index: 4 }).querySelector('svg.spl-hword text').textContent).toBe('05');
    expect(render('four-crops').querySelectorAll('.spl-crop')).toHaveLength(4);
    expect(render('detail-full').querySelectorAll('.spl-crop')).toHaveLength(1);
  });

  it('pull quote uses the first sentence of the description', () => {
    expect(render('pull-quote').querySelector('blockquote p').textContent).toBe('“Drift and checks come from the Noise Rack.”');
  });

  it('actions are an empty slot that takes buttons (and prefilled ones when given)', () => {
    const el = render('spec-sheet');
    expect(el.querySelector('[data-slot="actions"]').children).toHaveLength(0);
    let n = 0;
    const el2 = render('spec-sheet', { texts: texts({ actions: [{ id: 'open', label: 'Open', primary: true, onClick: () => { n++; } }, { id: 'tpl', label: 'Open as template' }] }) });
    const btns = el2.querySelectorAll('[data-slot="actions"] button');
    expect(btns).toHaveLength(2);
    expect(btns[0].classList.contains('spl-btn-p')).toBe(true);
    btns[0].click(); expect(n).toBe(1);
    const b = L.button({ label: 'Edit' }); expect(b.type).toBe('button');
  });

  it('never injects markup from text (all text is textContent)', () => {
    const el = render('text-wrap', { texts: texts({ title: '<img src=x onerror=alert(1)>', description: '<script>1</script> hi', word: '<b>x</b>' }) });
    expect(el.querySelector('img')).toBeNull(); expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('.spl-wrap-txt b').children).toHaveLength(0);
    expect(el.textContent).toContain('<b>x</b>'.slice(0, 0) + '<img src=x onerror=alert(1)>');
  });

  it('mounts the art with fit cover and the circle frame zoom for the text wrap disc', async () => {
    const calls = [];
    const real = V.StartPageInk.mount;
    V.StartPageInk.mount = (el, art, o) => { calls.push({ el, o }); return real(el, art, o); };
    const el = render('text-wrap', { plate: { id: 'p', orientation: 'square' } });
    document.body.appendChild(el);
    await L.mount(el);
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach((c) => expect(c.o.fit).toBe('cover'));
    const disc = calls.find((c) => c.el.closest('.spl-disc'));
    expect(disc.o.frame.z).toBeGreaterThan(1);
    expect(disc.o.colorway.paper).toBe(el.style.getPropertyValue('--spl-disc'));
    L.destroy(el);
    expect(el.querySelector('.sp-ink')).toBeNull();
  });

  it('recolor updates the plate variables and every mounted art tile', async () => {
    const el = render('diptych'); document.body.appendChild(el); await L.mount(el);
    L.recolor(el, { ground: '#1c1c1e', ink: '#f8f8f4', accent: '#b6bac0', class: 'dark' });
    expect(el.style.getPropertyValue('--spl-paper')).toBe('#1c1c1e');
    expect(el.dataset.cls).toBe('dark');
    expect(el.querySelector('.spl-print').style.getPropertyValue('--sp-ink')).toBe('#f8f8f4');
  });

  it('knockout fills the word with the art through fillWord', async () => {
    const seen = [];
    const real = V.StartPageInk.fillWord;
    V.StartPageInk.fillWord = (el, w, art, o) => { seen.push({ w, o }); return real(el, w, art, o); };
    const el = render('knockout'); document.body.appendChild(el); await L.mount(el);
    expect(seen).toHaveLength(1); expect(seen[0].w).toBe('Flowgrey');
    expect(seen[0].o.colorway.paper).toBe(CW.ground);
  });

  // Seen in the P4 gate as an unhandled "W.requestAnimationFrame is not a function": a plate
  // rendered but never attached keeps polling for isConnected, and a poll that runs after the
  // window's rAF is gone (teardown, closed window) must stop quietly.
  it('a never-attached plate stops polling once requestAnimationFrame is gone', async () => {
    const queued = [];
    window.requestAnimationFrame = (cb) => { queued.push(cb); return queued.length; };
    render('knockout');
    expect(queued).toHaveLength(1);
    window.requestAnimationFrame = undefined;
    expect(() => queued.shift()(0)).not.toThrow();
  });
});

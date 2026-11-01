/**
 * Start Page cold-open perf: the editor paper texture is not built while the page covers the editor, and is built
 * (warmed in idle time, or at the latest on hide) so the editor looks identical once shown.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const cover = (window) => { window.document.documentElement.dataset.startPage = 'open'; };
const uncover = (window) => {
  delete window.document.documentElement.dataset.startPage;
  window.dispatchEvent(new window.CustomEvent('vectura:start-page-hidden'));
};
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Start Page defers the editor paper texture', () => {
  let runtime; let window; let app; let r; let PT; let Paper; let surface;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    PT = window.Vectura.PaperTexture;
    Paper = window.Vectura.Paper;
    surface = 0;
    PT.drawSurface = () => { surface += 1; return true; }; // counts builds; the real surface needs a full 2D context
  });
  afterEach(() => runtime?.cleanup?.());

  const boot = () => {
    window.Vectura.bootCover = true; // what main.js sets before it builds the App
    app = new window.Vectura.App();
    r = app.renderer;
    r.canvas.width = 800; r.canvas.height = 600; r.ready = true;
    Paper.setActive(Paper.forType('cold-press'));
  };
  const ctx = () => ({
    canvas: r.canvas,
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
  });

  it('drawPaperTexture builds nothing while the page covers the editor, and reports not drawn', () => {
    boot(); surface = 0;
    cover(window);
    expect(r.drawPaperTexture(ctx(), app.engine.currentProfile)).toBe(false);
    expect(surface).toBe(0);
  });

  it('the first editor render of a launch that will show the page builds no texture', () => {
    // A fresh boot: the launch rule says the page opens, so the constructor render must already hold back.
    window.Vectura.bootCover = true;
    app = new window.Vectura.App();
    expect(app.shouldShowStartPageOnLaunch()).toBe(true);
    expect(surface).toBe(0);
    expect(app.renderer._paperBuilt).toBeFalsy();
  });

  it('builds the texture after the page hides (repaint of the held-back frame)', async () => {
    boot(); surface = 0;
    cover(window);
    r.drawPaperTexture(ctx(), app.engine.currentProfile);
    let draws = 0;
    const realDraw = r.draw.bind(r);
    r.draw = () => { draws += 1; return realDraw(); };
    uncover(window);
    await tick(80);
    expect(draws).toBeGreaterThan(0);
    expect(r.drawPaperTexture(ctx(), app.engine.currentProfile)).toBe(true);
    expect(surface).toBeGreaterThan(0);
  });

  it('warms the texture in idle time while the page is still open, so showing the editor has no pop', async () => {
    boot(); surface = 0;
    cover(window);
    r.drawPaperTexture(ctx(), app.engine.currentProfile);
    expect(surface).toBe(0);
    let draws = 0;
    r.draw = () => { draws += 1; };
    await tick(4600);
    expect(draws).toBeGreaterThan(0); // the warm-up repaints the held-back frame while the page is still open
    expect(r.drawPaperTexture(ctx(), app.engine.currentProfile)).toBe(true);
    expect(surface).toBeGreaterThan(0);
  }, 15000);

  it('a launch where the page does not open builds the texture at once (main.js clears the cover and repaints)', () => {
    boot(); surface = 0;
    window.Vectura.bootCover = false;
    expect(r.drawPaperTexture(ctx(), app.engine.currentProfile)).toBe(true);
    expect(surface).toBe(1);
  });

  it('scroll cues of inert editor panes are not measured while the page is open, then catch up on hide', async () => {
    const { document } = window;
    const pane = document.createElement('div');
    pane.setAttribute('inert', '');
    const el = document.createElement('div');
    let reads = 0;
    Object.defineProperty(el, 'scrollHeight', { get() { reads += 1; return 500; } });
    Object.defineProperty(el, 'clientHeight', { get() { return 100; } });
    pane.appendChild(el); document.body.appendChild(pane);
    cover(window);
    window.Vectura.UI.utils.scrollCue.bind(el);
    await tick(40);
    expect(reads).toBe(0);
    uncover(window);
    expect(reads).toBeGreaterThan(0);
    expect(el.dataset.scrollCue).toBe('below');
  });

  it('HUD cover step-aside does not hit-test while the page is open, and runs once on hide', async () => {
    const { document } = window;
    let hits = 0;
    document.elementFromPoint = () => { hits += 1; return null; };
    window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10 });
    cover(window);
    const queue = [];
    const raf = (fn) => { queue.push(fn); return queue.length; };
    const flush = () => { queue.splice(0).forEach((fn) => fn()); };
    window.requestAnimationFrame = raf; global.requestAnimationFrame = raf;
    window.Vectura.CanvasHud.init();
    document.body.appendChild(document.createElement('i')); // a mutation outside the editor viewport
    await tick(40);
    flush();
    expect(hits).toBe(0);
    uncover(window); // the parked pass is rescheduled
    flush();
    expect(hits).toBeGreaterThan(0);
  });

  it('paper swatch thumbnails are not rendered under the page, and fill in when it closes', async () => {
    let thumbs = 0;
    PT.thumbDataURL = () => { thumbs += 1; return 'data:image/png;base64,AA'; };
    boot();
    const sw = () => [...window.document.querySelectorAll('#paper-section-body .paper-swatch:not(.is-custom) [data-paper-thumb]')];
    expect(sw().length).toBeGreaterThan(3);
    expect(thumbs).toBe(0);
    expect(sw().every((el) => !el.style.backgroundImage)).toBe(true);
    uncover(window);
    expect(thumbs).toBeGreaterThan(3);
    expect(sw().filter((el) => el.style.backgroundImage).length).toBe(thumbs);
  });

  it('the hold covers the ink masks too (one gate, released with the surface)', () => {
    boot();
    expect(r._paperHeld()).toBe(true);
    cover(window);
    uncover(window); // releases
    expect(r._paperHeld()).toBe(false);
  });
});

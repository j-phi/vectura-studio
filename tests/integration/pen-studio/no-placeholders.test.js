/*
 * Pen Studio with the REAL ui-constants strings and real store/lab/complement:
 * no unresolved {placeholder} and no raw ALL-CAPS string keys may reach the DOM
 * (text, title, aria-label, placeholder, alt) in any view or dialog.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const PLACEHOLDER = /\{[a-zA-Z]+\}/;
const RAW_KEY = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\bTESTS?\b|\bTESTING\b/;

describe('Pen Studio shows no unresolved placeholders or raw keys', () => {
  let runtime, window, document, app, V, UI;
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  // Every user-visible string in the studio: text nodes + a11y/tooltip attributes.
  const visibleStrings = () => {
    const root = q('.vectura-modal.pen-studio') || q('.pen-studio');
    const out = [];
    const nodes = [root, ...qa('*', root)];
    nodes.forEach((n) => {
      ['title', 'aria-label', 'placeholder', 'alt'].forEach((a) => {
        const v = n.getAttribute && n.getAttribute(a);
        if (v) out.push(`[${a}] ${v}`);
      });
      if (n.tagName === 'TEXTAREA' || n.tagName === 'STYLE' || n.tagName === 'SCRIPT') return;
      Array.from(n.childNodes).forEach((c) => {
        if (c.nodeType === 3 && c.nodeValue.trim()) out.push(c.nodeValue.trim());
      });
    });
    // adjacent-node concatenation (e.g. "✓ 005" + "TESTS")
    out.push(root.textContent.replace(/<textarea[\s\S]*?<\/textarea>/g, ''));
    return out;
  };
  const expectClean = (label) => {
    const bad = visibleStrings().filter((s) => PLACEHOLDER.test(s) || RAW_KEY.test(s));
    expect({ label, bad }).toEqual({ label, bad: [] });
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    V = window.Vectura; UI = V.UI;
    app = new V.App();
    window.app = app;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  let handle;
  beforeEach(() => {
    window.localStorage.removeItem(V.PEN_STUDIO.STORAGE_KEY);
    V.SETTINGS.pens = [{ id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3 }, { id: 'pen-2', name: 'Pen 2', color: '#dbeafe', width: 0.5 }];
    app.ui.renderPens();
    handle = UI.PenStudio.open({ app });
  });
  afterEach(() => { try { handle && handle.close(); } catch (_e) { /* closed */ } });

  test('default view', () => expectClean('default'));

  test('all-papers view', () => {
    click(qa('.pen-studio-view-btn')[1]);
    expect(qa('.pen-studio-matrix-row, .pen-studio-matrix').length).toBeGreaterThan(0);
    expectClean('all-papers');
  });

  test('black stock paper (complement chips hidden note)', () => {
    const black = qa('.pen-studio-paper').find((b) => /black/i.test(b.textContent));
    expect(black).toBeTruthy();
    click(black);
    expectClean('black');
  });

  test('add-pen dialog', () => {
    click(q('.pen-studio-box-add'));
    expect(q('.pen-studio-add')).toBeTruthy();
    expectClean('add-pen');
  });

  test('export dialog (box and pen)', () => {
    click(q('.pen-studio-box-export'));
    expect(q('.pen-studio-dialog')).toBeTruthy();
    expectClean('export-box');
    click(q('.pen-studio-dialog-cancel'));
    click(q('.pen-studio-export-pen'));
    expect(q('.pen-studio-dialog')).toBeTruthy();
    expectClean('export-pen');
  });

  test('import dialog', () => {
    click(q('.pen-studio-import-box'));
    expect(q('.pen-studio-dialog')).toBeTruthy();
    expectClean('import');
  });

  test('save-as-new dialog', () => {
    click(q('.is-save-new'));
    expect(q('.pen-studio-save-new')).toBeTruthy();
    expectClean('save-as-new');
  });
});

describe('Pen Studio lab canvases fill their column', () => {
  test('a ResizeObserver callback re-renders strips at the new width', async () => {
    const runtime = await loadVecturaRuntime(FULL_STACK);
    const { window } = runtime;
    const observers = [];
    window.ResizeObserver = function RO(cb) { this.cb = cb; this.observe = () => observers.push(this); this.disconnect = () => {}; };
    const V = window.Vectura;
    const app = new V.App(); window.app = app;
    const handle = V.UI.PenStudio.open({ app });
    const doc = window.document;
    const root = doc.querySelector('.pen-studio-lab');
    const canvas = doc.querySelector('.pen-studio-strip-canvas');
    expect(observers.length).toBeGreaterThan(0);
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(HTMLCanvasElementProto(window), 'clientWidth', { configurable: true, get() { return 600; } });
    observers.forEach((o) => o.cb([]));
    await new Promise((r) => setTimeout(r, 80));
    expect(canvas.style.width).toBe('100%');
    expect(canvas.width).toBeGreaterThanOrEqual(600);
    handle.close(); runtime.cleanup();
  });
});
function HTMLCanvasElementProto(window) { return window.HTMLCanvasElement.prototype; }

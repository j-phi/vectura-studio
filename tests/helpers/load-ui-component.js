/*
 * Loads one or more Phase 1 UI component / overlay / utility scripts into a
 * minimal JSDOM context. Avoids touching the full index.html runtime so
 * component tests stay fast and don't depend on engine/renderer/core boot.
 *
 * Each loaded script's IIFE registers itself on `window.Vectura.UI.<Name>`
 * (or `window.Vectura.UI.overlays.<Name>`). The helper returns the JSDOM
 * window/document plus a `cleanup()` to close the DOM between suites.
 *
 * Usage:
 *   const { window, document, cleanup } = loadUIComponent(['btn-pulse']);
 *   const btn = window.Vectura.UI.BtnPulse(document.body, { ... });
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

// Default file resolution paths, in order. First hit wins.
const RESOLVE_DIRS = [
  'src/ui/components',
  'src/ui/overlays',
  'src/ui',
  'src/ui/skin',
];

const resolveScript = (name) => {
  // Allow explicit relative paths (e.g. 'src/ui/skin/skin-manager').
  if (name.includes('/')) {
    const candidate = path.join(ROOT, name.endsWith('.js') ? name : `${name}.js`);
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const dir of RESOLVE_DIRS) {
    const candidate = path.join(ROOT, dir, `${name}.js`);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`load-ui-component: cannot resolve "${name}"`);
};

const installDomShims = (window) => {
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // JSDOM doesn't ship HTMLCanvasElement.getContext; stub a minimal 2D context
  // so components that paint in their constructor (e.g. HarmonographPlotter)
  // don't log "Not implemented" warnings during tests.
  if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
    window.HTMLCanvasElement.prototype.getContext = function () {
      return {
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
        stroke() {}, fill() {}, save() {}, restore() {},
        translate() {}, rotate() {}, scale() {},
        clearRect() {}, fillRect() {}, strokeRect() {}, rect() {},
        setLineDash() {}, quadraticCurveTo() {}, bezierCurveTo() {},
        arc() {}, ellipse() {}, drawImage() {},
        fillText() {}, strokeText() {},
        measureText: (text = '') => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => null,
        clip() {}, isPointInPath: () => false, isPointInStroke: () => false,
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        putImageData() {},
      };
    };
  }
};

/**
 * @param {string|string[]} scripts  Script names to load (no .js suffix needed).
 *                                   Resolved against src/ui/components, src/ui/overlays, src/ui.
 * @param {object} [options]
 * @param {string} [options.html]    Optional initial HTML.
 * @returns {{ window: Window, document: Document, context: object, cleanup: () => void }}
 */
const loadUIComponent = (scripts, options = {}) => {
  const list = Array.isArray(scripts) ? scripts : [scripts];
  const html = options.html || '<!doctype html><html><head></head><body></body></html>';

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const { window } = dom;
  installDomShims(window);

  const context = dom.getInternalVMContext();
  context.window = window;
  context.document = window.document;
  context.global = context;
  context.globalThis = context;

  list.forEach((name) => {
    const file = resolveScript(name);
    const code = fs.readFileSync(file, 'utf8');
    vm.runInContext(code, context, { filename: file });
  });

  return {
    window,
    document: window.document,
    context,
    cleanup: () => dom.window.close(),
  };
};

module.exports = { loadUIComponent };

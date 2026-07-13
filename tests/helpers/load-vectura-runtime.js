const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const LOCAL_SRC_RE = /<script[^>]*src="([^"]+)"[^>]*><\/script>/g;

// 1x1 transparent PNG — what the stubbed canvas "exports".
const EMPTY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const parseLocalScripts = (html) => {
  const scripts = [];
  let match;
  while ((match = LOCAL_SRC_RE.exec(html)) !== null) {
    const src = match[1];
    if (!src || /^https?:\/\//i.test(src) || src.startsWith('//')) continue;
    scripts.push(src);
  }
  return scripts;
};

const shouldSkipScript = (src, options) => {
  const {
    includeRenderer = false,
    includeUi = false,
    includeApp = false,
    includeMain = false,
  } = options;

  if (!includeRenderer && src.includes('/src/render/renderer.js')) return true;
  // Meridian Unit 1.10 (2026-05-20): `_ui-legacy.js` was merged into
  // `src/ui/ui.js`; only the consolidated entry needs to be filtered out.
  if (!includeUi && (src.includes('/src/ui/randomization-utils.js') || src.includes('/src/ui/ui.js'))) return true;
  if (!includeApp && src.includes('/src/app/app.js')) return true;
  if (!includeMain && src.includes('/src/main.js')) return true;
  return false;
};

const create2DContextStub = () => ({
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  stroke() {},
  fill() {},
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  scale() {},
  setTransform() {},
  resetTransform() {},
  getLineDash() {
    return [];
  },
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  rect() {},
  setLineDash() {},
  quadraticCurveTo() {},
  bezierCurveTo() {},
  arc() {},
  ellipse() {},
  drawImage() {},
  fillText() {},
  strokeText() {},
  measureText(text = '') {
    return { width: String(text).length * 7 };
  },
  getImageData() {
    return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  },
  putImageData() {},
  createLinearGradient() {
    return { addColorStop() {} };
  },
  createRadialGradient() {
    return { addColorStop() {} };
  },
  createPattern() {
    return null;
  },
  clip() {},
  isPointInPath() {
    return false;
  },
  isPointInStroke() {
    return false;
  },
});

const loadVecturaRuntime = async (options = {}) => {
  const rootDir = options.rootDir || path.resolve(__dirname, '../..');
  const indexPath = path.join(rootDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const scriptSources = parseLocalScripts(indexHtml).filter((src) => !shouldSkipScript(src, options));
  const html = options.useIndexHtml
    ? indexHtml
    : '<!doctype html><html><body><canvas id="main-canvas"></canvas></body></html>';

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const { window } = dom;
  window.console = console;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.matchMedia =
    window.matchMedia ||
    (() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }));

  if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
    window.HTMLCanvasElement.prototype.getContext = () => create2DContextStub();
    // Export needs stubbing too, not just drawing. jsdom has no canvas backend, so its
    // real toDataURL/toBlob emit a "Not implemented" jsdomError that the default virtual
    // console forwards to console.error with a full stack trace — ~2,344 times across the
    // suite. Vitest's worker ships every console call to the parent over birpc, and the
    // flood starved the parent's event loop until it missed a worker's `onTaskUpdate` ack
    // past birpc's hard-coded 60s RPC timeout, failing CI with all tests green.
    window.HTMLCanvasElement.prototype.toDataURL = () => EMPTY_PNG_DATA_URL;
    window.HTMLCanvasElement.prototype.toBlob = (callback) => {
      if (typeof callback === 'function') callback(null);
    };
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  const context = dom.getInternalVMContext();
  context.window = window;
  context.document = window.document;
  context.global = context;
  context.globalThis = context;

  scriptSources.forEach((src) => {
    // Strip the ?v=<version> cache-busting query (stamped by version:sync) before
    // resolving to a disk path — it's a browser cache key, not part of the filename.
    const normalized = src.replace(/^\.\//, '').replace(/\?.*$/, '');
    const absPath = path.join(rootDir, normalized);
    const code = fs.readFileSync(absPath, 'utf8');
    vm.runInContext(code, context, { filename: absPath });
  });

  return {
    window,
    document: window.document,
    scripts: scriptSources,
    cleanup: () => dom.window.close(),
  };
};

module.exports = {
  loadVecturaRuntime,
  parseLocalScripts,
};

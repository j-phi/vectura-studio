const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const LOCAL_SRC_RE = /<script[^>]*src="([^"]+)"[^>]*><\/script>/g;

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
  clearRect() {},
  fillRect() {},
  strokeRect() {},
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

  const dom = new JSDOM('<!doctype html><html><body><canvas id="main-canvas"></canvas></body></html>', {
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
    window.HTMLCanvasElement.prototype.getContext = window.HTMLCanvasElement.prototype.getContext || (() => create2DContextStub());
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
    const normalized = src.replace(/^\.\//, '');
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

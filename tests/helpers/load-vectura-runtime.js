const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { PROFILES } = require('./runtime-profiles');

const COMPILED_CACHE_LIMIT = 256;
const compiledCache = new Map();

const createCryptoFacade = () => Object.freeze({
  randomUUID: () => crypto.randomUUID(),
  getRandomValues: (array) => crypto.webcrypto.getRandomValues(array),
});

const LOCAL_SRC_RE = /<script[^>]*src="([^"]+)"[^>]*>\s*<\/script[^>]*>/gi;

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

const normalizedScriptPath = (src) => src.replace(/^\.\//, '').replace(/\?.*$/, '');

const isCoverageRun = (argv = process.argv, env = process.env) =>
  argv.some((arg) => /^(--coverage|--coverage\.)/.test(arg)) ||
  Boolean(env.NODE_V8_COVERAGE || env.VITEST_COVERAGE || env.VECTURA_TEST_COVERAGE === '1');

const getProfileScripts = (profile, indexScripts, options) => {
  const definition = PROFILES[profile];
  if (!definition) throw new Error(`Unknown Vectura runtime profile: ${profile}`);
  if (profile === 'core') return getExplicitScripts(profile, definition.files, indexScripts, options);
  if (profile === 'feature' || profile === 'component') {
    if (!Array.isArray(options.files) || options.files.length === 0) {
      throw new Error(`Runtime profile "${profile}" requires a non-empty files manifest`);
    }
    return getExplicitScripts(profile, options.files, indexScripts, options);
  }
  if (profile === 'full') return indexScripts;
  return indexScripts.filter((src) => !shouldSkipScript(src, options));
};

const getExplicitScripts = (profile, files, indexScripts, options) => {
  if (files) {
    const listed = new Set(indexScripts.map(normalizedScriptPath));
    const missing = files.filter((file) => !listed.has(file));
    if (missing.length) throw new Error(`Runtime profile "${profile}" has dependencies missing from index.html: ${missing.join(', ')}`);
    for (const file of files) {
      if (!fs.existsSync(path.join(options.rootDir, file)) && options.scriptOverrides?.[file] === undefined) {
        throw new Error(`Runtime profile "${profile}" dependency is missing on disk: ${file}`);
      }
    }
    const selected = new Set(files);
    return indexScripts.filter((src) => selected.has(normalizedScriptPath(src)));
  }
  return [];
};

const getCompiledScript = (source, filename, identity, cacheEnabled) => {
  if (!cacheEnabled) return new vm.Script(source, { filename });
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  const key = `${identity}\0${filename}\0${digest}`;
  if (compiledCache.has(key)) {
    const hit = compiledCache.get(key);
    compiledCache.delete(key);
    compiledCache.set(key, hit);
    return hit;
  }
  const script = new vm.Script(source, { filename });
  compiledCache.set(key, script);
  if (compiledCache.size > COMPILED_CACHE_LIMIT) compiledCache.delete(compiledCache.keys().next().value);
  return script;
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
  const profile = options.profile || 'legacy';
  const normalizedOptions = { ...options, rootDir };
  const profileOptions = profile === 'full'
    ? { includeRenderer: true, includeUi: true, includeApp: true, includeMain: true }
    : {};
  const effectiveOptions = { ...profileOptions, ...options };
  const allIndexScripts = parseLocalScripts(indexHtml);
  const scriptSources = getProfileScripts(profile, allIndexScripts, normalizedOptions);
  const domMode = PROFILES[profile].dom;
  let dom = null;
  let context;
  let window;
  const animationTimers = new Set();
  const timeoutTimers = new Set();
  const intervalTimers = new Set();
  if (domMode === 'minimal' || domMode === 'component' || domMode === 'full') {
    const { JSDOM } = require('jsdom');
    const html = domMode === 'full' || (profile === 'legacy' && options.useIndexHtml)
      ? indexHtml
      : domMode === 'component'
        ? (options.html || '<!doctype html><html><body></body></html>')
        : '<!doctype html><html><body><canvas id="main-canvas"></canvas></body></html>';
    dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
    window = dom.window;
    window.console = console;
    window.requestAnimationFrame = (cb) => {
      const id = setTimeout(() => { animationTimers.delete(id); cb(Date.now()); }, 16);
      animationTimers.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { animationTimers.delete(id); clearTimeout(id); };
    window.matchMedia = window.matchMedia || (() => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    }));
    if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
      window.HTMLCanvasElement.prototype.getContext = () => create2DContextStub();
      window.HTMLCanvasElement.prototype.toDataURL = () => EMPTY_PNG_DATA_URL;
      window.HTMLCanvasElement.prototype.toBlob = (callback) => { if (typeof callback === 'function') callback(null); };
    }
    if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    context = dom.getInternalVMContext();
    context.document = window.document;
  } else {
    context = {};
    window = context;
    // Browser code uses crypto.randomUUID() to create engine/layer IDs. The
    // minimal VM deliberately has no DOM, but it still needs this browser
    // primitive for the same feature paths that run under JSDOM.
    context.crypto = createCryptoFacade();
    context.setTimeout = (callback, delay, ...args) => {
      let id;
      id = setTimeout(() => { timeoutTimers.delete(id); callback(...args); }, delay);
      timeoutTimers.add(id);
      return id;
    };
    context.clearTimeout = (id) => { timeoutTimers.delete(id); clearTimeout(id); };
    context.setInterval = (callback, delay, ...args) => {
      const id = setInterval(callback, delay, ...args);
      intervalTimers.add(id);
      return id;
    };
    context.clearInterval = (id) => { intervalTimers.delete(id); clearInterval(id); };
    context.requestAnimationFrame = (callback) => {
      let id;
      id = setTimeout(() => { animationTimers.delete(id); callback(Date.now()); }, 16);
      animationTimers.add(id);
      return id;
    };
    context.cancelAnimationFrame = (id) => { animationTimers.delete(id); clearTimeout(id); };
    context.console = console;
  }
  context.window = window;
  context.self = window;
  context.global = context;
  context.globalThis = context;
  const vmContext = dom ? context : vm.createContext(context);

  const coverageRun = isCoverageRun();
  const cacheEnabled = options.cacheScripts !== false && !coverageRun;
  const compileOptionsIdentity = JSON.stringify({
    profile,
    includeRenderer: effectiveOptions.includeRenderer === true,
    includeUi: effectiveOptions.includeUi === true,
    includeApp: effectiveOptions.includeApp === true,
    includeMain: effectiveOptions.includeMain === true,
    useIndexHtml: options.useIndexHtml === true,
    files: options.files || null,
    htmlDigest: options.html ? crypto.createHash('sha256').update(options.html).digest('hex') : null,
  });
  const cleanup = () => {
    for (const timer of [...animationTimers, ...timeoutTimers, ...intervalTimers]) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    animationTimers.clear();
    timeoutTimers.clear();
    intervalTimers.clear();
    dom?.window.close();
  };
  try {
    scriptSources.forEach((src) => {
    // Strip the ?v=<version> cache-busting query (stamped by version:sync) before
    // resolving to a disk path — it's a browser cache key, not part of the filename.
    const normalized = normalizedScriptPath(src);
    const absPath = path.join(rootDir, normalized);
    // A script LISTED in index.html but not on disk is what a browser sees as a
    // 404: it skips that file and keeps going. The harness has to behave the
    // same way, because index.html is this repo's only module manifest and a
    // module can legitimately be listed one commit before it lands (parallel
    // work units land the tag and the file separately). Throwing here would
    // take the ENTIRE suite down for one missing optional module, which hides
    // every real failure behind an unrelated ENOENT. The module's own absence
    // is still observable — its `window.Vectura.*` namespace is simply not
    // registered, which is what the consuming code must already handle.
    // `scriptOverrides` lets a test swap in a DIFFERENT source string for one
    // module by its index.html-relative path — used to drive a pre-fix
    // revision of a single file (e.g. `git show <sha>:path` for an RGR RED
    // proof) without checking out another commit in a shared worktree.
    const override = options.scriptOverrides && options.scriptOverrides[normalized];
    if (override !== undefined) {
      const script = getCompiledScript(override, `${absPath} (override)`, `${rootDir}|${normalized}|${compileOptionsIdentity}|override`, cacheEnabled);
      script.runInContext(vmContext);
      return;
    }
    if (!fs.existsSync(absPath)) return;
    const code = fs.readFileSync(absPath, 'utf8');
    const script = getCompiledScript(code, absPath, `${rootDir}|${normalized}|${compileOptionsIdentity}|disk`, cacheEnabled);
    script.runInContext(vmContext);
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  // Scene Seed (U4a): the APP gives every NEW 3D layer seedMode 'seeded' with a
  // random seed, so two engines never render the same scene. Fixture tests rely
  // on deterministic output, so the harness defaults new layers to 'legacy'
  // (seed-inert). Seed tests opt back in with `{ sceneSeedMode: 'seeded' }`.
  if (window.Vectura) window.Vectura.SCENE_SEED_NEW_LAYER_MODE = options.sceneSeedMode || 'legacy';

  return {
    window,
    document: window.document,
    scripts: scriptSources,
    cleanup,
  };
};

const clearCompiledScriptCache = () => compiledCache.clear();
const getCompiledScriptCacheSize = () => compiledCache.size;

module.exports = {
  loadVecturaRuntime,
  parseLocalScripts,
  clearCompiledScriptCache,
  getCompiledScriptCacheSize,
  isCoverageRun,
};

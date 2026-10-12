const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const {
  loadVecturaRuntime,
  clearCompiledScriptCache,
  getCompiledScriptCacheSize,
  isCoverageRun,
} = require('../helpers/load-vectura-runtime');

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vectura-loader-'));
const write = (root, relative, contents) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

describe('runtime loader contracts', () => {
  afterEach(() => clearCompiledScriptCache());

  test('coverage cache bypass recognizes the explicit queued-run marker and Vitest flags', () => {
    expect(isCoverageRun([], {})).toBe(false);
    expect(isCoverageRun([], { VECTURA_TEST_COVERAGE: '1' })).toBe(true);
    expect(isCoverageRun(['--coverage'], {})).toBe(true);
    expect(isCoverageRun([], { VITEST_COVERAGE: '1' })).toBe(true);
  });

  test('the explicit queued coverage marker actually bypasses compiled-script caching', async () => {
    const root = makeRoot();
    const oldMarker = process.env.VECTURA_TEST_COVERAGE;
    try {
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script>');
      write(root, 'src/core/rng.js', 'window.Vectura = { coverageProbe: true };');
      write(root, 'src/core/noise.js', '');
      process.env.VECTURA_TEST_COVERAGE = '1';
      const runtime = await loadVecturaRuntime({ rootDir: root, profile: 'core' });
      expect(runtime.window.Vectura.coverageProbe).toBe(true);
      expect(getCompiledScriptCacheSize()).toBe(0);
      runtime.cleanup();
    } finally {
      if (oldMarker === undefined) delete process.env.VECTURA_TEST_COVERAGE;
      else process.env.VECTURA_TEST_COVERAGE = oldMarker;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('core profile uses an isolated DOM-free VM context', async () => {
    const root = makeRoot();
    try {
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script>');
      write(root, 'src/core/rng.js', 'window.Vectura = window.Vectura || {}; window.Vectura.order = ["rng"];');
      write(root, 'src/core/noise.js', 'window.Vectura.order.push("noise");');
      const originalLoad = Module._load;
      Module._load = function (request, ...args) {
        if (request === 'jsdom') throw new Error('core profile must not load jsdom');
        return originalLoad.call(this, request, ...args);
      };
      let first;
      let second;
      try {
        first = await loadVecturaRuntime({ rootDir: root, profile: 'core' });
        second = await loadVecturaRuntime({ rootDir: root, profile: 'core' });
      } finally {
        Module._load = originalLoad;
      }
      expect(first.window.Vectura.order).toEqual(['rng', 'noise']);
      expect(second.window.Vectura.order).toEqual(['rng', 'noise']);
      expect(first.window).not.toBe(second.window);
      expect(first.document).toBeUndefined();
      expect(first.window.document).toBeUndefined();
      first.window.Vectura.order.push('changed');
      expect(second.window.Vectura.order).toEqual(['rng', 'noise']);
      first.cleanup();
      second.cleanup();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('source overrides are compiled and run in the isolated context', async () => {
    const root = makeRoot();
    try {
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script>');
      for (const name of ['rng', 'noise']) write(root, `src/core/${name}.js`, '');
      const runtime = await loadVecturaRuntime({
        rootDir: root,
        profile: 'core',
        scriptOverrides: { 'src/core/rng.js': 'window.Vectura = { marker: 42 };' },
      });
      expect(runtime.window.Vectura.marker).toBe(42);
      runtime.cleanup();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('compiled cache sees changed source bytes and rejects missing explicit dependencies', async () => {
    const root = makeRoot();
    try {
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script>');
      write(root, 'src/core/rng.js', 'window.Vectura = { marker: 1 };');
      write(root, 'src/core/noise.js', '');
      const first = await loadVecturaRuntime({ rootDir: root, profile: 'core' });
      first.cleanup();
      write(root, 'src/core/rng.js', 'window.Vectura = { marker: 2 };');
      const second = await loadVecturaRuntime({ rootDir: root, profile: 'core' });
      expect(second.window.Vectura.marker).toBe(2);
      second.cleanup();
      write(root, 'index.html', '<script src="./src/core/rng.js"></script>');
      await expect(loadVecturaRuntime({ rootDir: root, profile: 'core' })).rejects.toThrow(/dependencies missing from index\.html/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('feature profile requires listed, existing files and evaluates in index order', async () => {
    const root = makeRoot();
    try {
      write(root, 'index.html', '<script src="./src/core/noise.js"></script><script src="./src/core/rng.js"></script>');
      write(root, 'src/core/rng.js', 'window.order.push("rng"); window.Vectura = { order: window.order };');
      write(root, 'src/core/noise.js', 'window.order = ["noise"];');
      const runtime = await loadVecturaRuntime({ rootDir: root, profile: 'feature', files: ['src/core/rng.js', 'src/core/noise.js'] });
      expect(runtime.window.Vectura.order).toEqual(['noise', 'rng']);
      expect(runtime.document).toBeUndefined();
      runtime.cleanup();
      await expect(loadVecturaRuntime({ rootDir: root, profile: 'feature' })).rejects.toThrow(/requires a non-empty files manifest/);
      await expect(loadVecturaRuntime({ rootDir: root, profile: 'feature', files: ['src/core/missing.js'] })).rejects.toThrow(/missing from index\.html/);
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script><script src="./src/core/absent.js"></script>');
      await expect(loadVecturaRuntime({ rootDir: root, profile: 'feature', files: ['src/core/absent.js'] })).rejects.toThrow(/missing on disk/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('component profile runs only selected scripts against supplied markup', async () => {
    const root = makeRoot();
    try {
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script>');
      write(root, 'src/core/rng.js', 'window.Vectura = { selected: document.getElementById("probe")?.textContent };');
      write(root, 'src/core/noise.js', 'window.Vectura.unselected = true;');
      const runtime = await loadVecturaRuntime({
        rootDir: root,
        profile: 'component',
        files: ['src/core/rng.js'],
        html: '<!doctype html><div id="probe">component markup</div>',
      });
      expect(runtime.window.Vectura.selected).toBe('component markup');
      expect(runtime.window.Vectura.unselected).toBeUndefined();
      expect(runtime.scripts).toEqual(['./src/core/rng.js']);
      runtime.cleanup();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('script failures close the context and clear timers scheduled before the throw', async () => {
    const root = makeRoot();
    try {
      write(root, 'index.html', '<script src="./src/core/rng.js"></script><script src="./src/core/noise.js"></script>');
      write(root, 'src/core/rng.js', 'setTimeout(() => { window.unexpectedTimer = true; }, 5); throw new Error("stop");');
      write(root, 'src/core/noise.js', '');
      await expect(loadVecturaRuntime({ rootDir: root, profile: 'feature', files: ['src/core/rng.js'] })).rejects.toThrow('stop');
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

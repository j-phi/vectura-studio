/*
 * Compile gate for src/ui/persistence.js (Phase 2 step 5a).
 *
 * Verifies the persistence module:
 *   - registers as window.Vectura.UI.Persistence
 *   - exposes bind() + applyPersistedSettings + scrollLayerToTop +
 *     captureLeftPanelScrollPosition methods
 *   - throws a clear error if applyPersistedSettings is invoked before bind()
 *   - after bind(deps), captureLeftPanelScrollPosition returns a function
 *     when the left-panel-content element is missing
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('persistence compile gate', () => {
  let dom;
  let Persistence;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/ui/persistence.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Persistence = w.Vectura.UI.Persistence;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Persistence with bind + 3 methods', () => {
    expect(Persistence).toBeTruthy();
    expect(typeof Persistence.bind).toBe('function');
    expect(typeof Persistence.applyPersistedSettings).toBe('function');
    expect(typeof Persistence.scrollLayerToTop).toBe('function');
    expect(typeof Persistence.captureLeftPanelScrollPosition).toBe('function');
  });

  it('applyPersistedSettings throws a clear error before bind()', () => {
    expect(() => Persistence.applyPersistedSettings.call({}))
      .toThrow(/Persistence\.applyPersistedSettings invoked before Persistence\.bind/);
  });

  it('after bind(deps), captureLeftPanelScrollPosition returns a no-op when pane is missing', () => {
    Persistence.bind({
      getEl: () => null,
      SETTINGS: {},
      getContrastTextColor: () => '#000',
    });
    const result = Persistence.captureLeftPanelScrollPosition.call({});
    expect(typeof result).toBe('function');
    expect(() => result()).not.toThrow();
  });

  it('scrollLayerToTop is a no-op when container is missing', () => {
    Persistence.bind({
      getEl: () => null,
      SETTINGS: {},
      getContrastTextColor: () => '#000',
    });
    expect(() => Persistence.scrollLayerToTop.call({}, 'layer-1')).not.toThrow();
  });
});

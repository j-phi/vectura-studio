const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const CONFIG_PATH = path.resolve(__dirname, '../../src/config/breadcrumb.js');
const MODULE_PATH = path.resolve(__dirname, '../../src/ui/shell/breadcrumb-bar.js');

// The breadcrumb module's <script> tag is added to index.html by the phase
// integrator at merge (Lane I self-mounts, does NOT own index.html), so the
// runtime loader won't pick it up. Inject it into the same jsdom window so it
// registers on the identical window.Vectura the runtime built.
const injectScript = (window, filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  const runner = new Function(
    'window', 'document', 'globalThis',
    'requestAnimationFrame', 'cancelAnimationFrame',
    'setTimeout', 'clearTimeout', 'performance',
    code
  );
  runner(
    window,
    window.document,
    window,
    window.requestAnimationFrame,
    window.cancelAnimationFrame,
    window.setTimeout.bind(window),
    window.clearTimeout.bind(window),
    window.performance || { now: () => Date.now() }
  );
};

// Build a nested plain-group structure directly in engine.layers:
//   g1 "Group" (root) → g2 "Inner" → s1 (shape)
const buildNestedGroups = (app, Layer) => {
  const g1 = new Layer('g1', 'group', 'Group');
  g1.isGroup = true; g1.groupType = 'group'; g1.type = 'group';
  g1.parentId = null; g1.visible = true;

  const g2 = new Layer('g2', 'group', 'Inner');
  g2.isGroup = true; g2.groupType = 'group'; g2.type = 'group';
  g2.parentId = 'g1'; g2.visible = true;

  const s1 = new Layer('s1', 'shape', 'Shape 1');
  s1.parentId = 'g2'; s1.visible = true;

  app.engine.layers = [g1, g2, s1];
  return { g1, g2, s1 };
};

describe('Isolation breadcrumb bar (ISO-1 / ISO-2)', () => {
  let runtime;

  afterEach(() => {
    try { runtime?.window?.Vectura?.UI?.BreadcrumbBar?.destroy?.(); } catch (_) {}
    runtime?.cleanup?.();
    runtime = null;
  });

  const boot = async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    const { window } = runtime;
    injectScript(window, CONFIG_PATH);
    injectScript(window, MODULE_PATH);
    window.app = new window.Vectura.App();
    await waitForUi();
    return window;
  };

  test('exposes BreadcrumbBar API', async () => {
    const window = await boot();
    const BC = window.Vectura.UI.BreadcrumbBar;
    expect(BC).toBeTruthy();
    expect(typeof BC.mount).toBe('function');
    expect(typeof BC.sync).toBe('function');
  });

  test('ISO-1: while isolated, renders back-arrow + ancestry chain ending in the group name', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    BC.sync();

    // RED: no visible bar before isolation.
    let bar = document.querySelector('.iso-breadcrumb');
    expect(bar && bar.classList.contains('is-visible')).toBeFalsy();

    // Enter isolation of g2 (double-click semantics: isolate the container of s1).
    app.renderer.enterGroupEditMode(s1);
    BC.sync();

    bar = document.querySelector('.iso-breadcrumb');
    expect(bar).toBeTruthy();
    expect(bar.classList.contains('is-visible')).toBe(true);

    // Back-arrow affordance present.
    const back = bar.querySelector('.iso-bc-back');
    expect(back).toBeTruthy();

    // Ancestry chain: Document › Group › Inner (last crumb = active group).
    const crumbs = [...bar.querySelectorAll('.iso-bc-crumb')];
    expect(crumbs.length).toBeGreaterThanOrEqual(2);
    const labels = crumbs.map((c) => c.textContent.trim());
    expect(labels).toContain('Group');
    expect(labels[labels.length - 1]).toBe('Inner');
    const current = bar.querySelector('.iso-bc-current');
    expect(current).toBeTruthy();
    expect(current.textContent.trim()).toBe('Inner');
  });

  test('ISO-1: exiting isolation removes the bar', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    app.renderer.enterGroupEditMode(s1);
    BC.sync();
    expect(document.querySelector('.iso-breadcrumb.is-visible')).toBeTruthy();

    app.renderer.exitGroupEditMode();
    BC.sync();
    const bar = document.querySelector('.iso-breadcrumb');
    expect(bar.classList.contains('is-visible')).toBe(false);
  });

  test('ISO-1: back-arrow exits one level then out of isolation', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    app.renderer.enterGroupEditMode(s1); // isolates g2 (s1's parent)
    BC.sync();
    expect(app.renderer.groupEditMode.groupId).toBe('g2');

    const back = document.querySelector('.iso-bc-back');
    back.dispatchEvent(new window.Event('click', { bubbles: true }));
    BC.sync();

    // One level up from g2 → isolate its parent group g1.
    expect(app.renderer.groupEditMode && app.renderer.groupEditMode.groupId).toBe('g1');

    // Back again → g1 has no group parent → exit isolation entirely.
    document.querySelector('.iso-bc-back').dispatchEvent(new window.Event('click', { bubbles: true }));
    BC.sync();
    expect(app.renderer.groupEditMode).toBeNull();
    expect(document.querySelector('.iso-breadcrumb').classList.contains('is-visible')).toBe(false);
  });

  test('ISO-1: clicking an ancestor crumb jumps to that isolation level', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    app.renderer.enterGroupEditMode(s1); // isolate g2
    BC.sync();
    expect(app.renderer.groupEditMode.groupId).toBe('g2');

    // Click the "Group" (g1) ancestor crumb → isolate g1.
    const g1Crumb = [...document.querySelectorAll('.iso-bc-crumb')]
      .find((c) => c.textContent.trim() === 'Group');
    expect(g1Crumb).toBeTruthy();
    g1Crumb.dispatchEvent(new window.Event('click', { bubbles: true }));
    BC.sync();
    expect(app.renderer.groupEditMode.groupId).toBe('g1');
  });

  test('ISO-1: root crumb exits isolation fully', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    app.renderer.enterGroupEditMode(s1);
    BC.sync();

    const rootCrumb = document.querySelector('.iso-bc-crumb.iso-bc-root');
    expect(rootCrumb).toBeTruthy();
    rootCrumb.dispatchEvent(new window.Event('click', { bubbles: true }));
    BC.sync();
    expect(app.renderer.groupEditMode).toBeNull();
  });

  test('ISO-2: edge indicator visible only while isolated', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    BC.sync();

    const edge = document.querySelector('.iso-edge-indicator');
    expect(edge).toBeTruthy();
    expect(edge.classList.contains('is-visible')).toBe(false);

    app.renderer.enterGroupEditMode(s1);
    BC.sync();
    expect(edge.classList.contains('is-visible')).toBe(true);

    app.renderer.exitGroupEditMode();
    BC.sync();
    expect(edge.classList.contains('is-visible')).toBe(false);
  });

  test('feature-detects absent renderer: mount/sync no-op without throwing', async () => {
    const window = await boot();
    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.destroy();
    expect(() => BC.mount(null)).not.toThrow();
    expect(() => BC.sync()).not.toThrow();
  });

  // Phase 2 integration: Lane H fires document CustomEvent 'vectura:isolation-changed'
  // in enter/exitGroupEditMode; Lane I's breadcrumb listens for it. Prove the two
  // compose WITHOUT a manual BreadcrumbBar.sync() call (the event drives the update).
  test('P2: renderer isolation event drives the breadcrumb (no manual sync)', async () => {
    const window = await boot();
    const { document } = window;
    const app = window.app;
    const { Layer } = window.Vectura;
    const { s1 } = buildNestedGroups(app, Layer);

    const BC = window.Vectura.UI.BreadcrumbBar;
    BC.mount(app);
    BC.sync(); // establish the hidden baseline
    let bar = document.querySelector('.iso-breadcrumb');
    expect(bar && bar.classList.contains('is-visible')).toBeFalsy();

    // The renderer emits the event; do NOT call BC.sync() manually here.
    app.renderer.enterGroupEditMode(s1);

    bar = document.querySelector('.iso-breadcrumb');
    expect(bar).toBeTruthy();
    expect(bar.classList.contains('is-visible')).toBe(true);
    const current = bar.querySelector('.iso-bc-current');
    expect(current && current.textContent.trim()).toBe('Inner');

    // Exiting also emits the event → breadcrumb hides without a manual sync.
    app.renderer.exitGroupEditMode();
    bar = document.querySelector('.iso-breadcrumb');
    expect(bar && bar.classList.contains('is-visible')).toBeFalsy();
  });
});

/*
 * TB-9/10/11 — Task Bar sub-mode framework + stroke weight + simplify.
 *
 * Loads the config + StrokeModel + StrokeOptions panel + the sub-modes module
 * into JSDOM (mirrors stroke-options-panel.test harness), wires a fake ContextBar
 * exposing the shared-contract surface (getContentHost/restoreState/getContext/
 * anchorRectForBar/setBusy), and drives the rendered DOM. PathEditOps is stubbed
 * to observe the simplify wiring (its real geometry is covered elsewhere).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const buildHarness = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  for (const rel of [
    'src/config/stroke-options.js',
    'src/config/shape-props.js',
    'src/core/stroke-model.js',
    'src/ui/panels/stroke-options.js',
    'src/ui/shell/context-bar-modes.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: path.basename(rel) });
  }
  return dom;
};

const fire = (dom, node, type) => node.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
const fireKey = (dom, type, key) => {
  const e = new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  dom.window.document.dispatchEvent(e);
  return e;
};

const setupBar = (dom, { layer, app, renderer = null, kind = 'single-path' } = {}) => {
  const doc = dom.window.document;
  const contentHost = doc.createElement('div');
  contentHost.id = 'bar-content';
  doc.body.appendChild(contentHost);
  const state = { restored: 0, busy: [] };
  const restoreState = () => { state.restored += 1; contentHost.setAttribute('data-restored', `${state.restored}`); };
  dom.window.Vectura.UI.ContextBar = {
    getContentHost: () => contentHost,
    restoreState,
    getContext: () => ({ kind, layerIds: layer ? [layer.id] : [], primaryLayer: layer || null, app, renderer }),
    anchorRectForBar: () => ({ left: 100, top: 80, right: 240, bottom: 100, width: 140, height: 20, centerX: 170 }),
    // Mirror Lane G's real impl: exiting busy re-renders the prior state, so the
    // sub-modes must NOT also call restoreState() (would double-render).
    setBusy: (b) => { state.busy.push(b); if (!b) restoreState(); },
  };
  return { contentHost, state };
};

describe('TB-9 — sub-mode framework', () => {
  let dom;
  beforeEach(() => { dom = buildHarness(); });

  test('enter() morphs the content host and appends a Back exit; Escape restores prior state', () => {
    const { contentHost, state } = setupBar(dom, {});
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    let exited = null;
    Modes.enter({
      id: 'demo', exitKind: 'back',
      render: (host) => { host.appendChild(dom.window.document.createElement('span')); },
      onExit: (committed) => { exited = committed; },
    });
    expect(contentHost.getAttribute('data-ctxbar-submode')).toBe('demo');
    const exit = contentHost.querySelector('[data-ctxbar-exit="back"]');
    expect(exit).not.toBeNull();
    expect(exit.textContent).toBe('Back');
    fireKey(dom, 'keydown', 'Escape');
    expect(exited).toBe(false);
    expect(state.restored).toBe(1);
  });

  test('Done exit passes committed=true', () => {
    const { contentHost } = setupBar(dom, {});
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    let exited = null;
    Modes.enter({ id: 'd2', exitKind: 'done', render: () => {}, onExit: (c) => { exited = c; } });
    contentHost.querySelector('[data-ctxbar-exit="done"]').click();
    expect(exited).toBe(true);
  });

  test('no-op without a ContextBar (feature-detect)', () => {
    dom.window.Vectura = dom.window.Vectura || {};
    dom.window.Vectura.UI = dom.window.Vectura.UI || {};
    delete dom.window.Vectura.UI.ContextBar;
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    expect(Modes.enterStrokeWeight({})).toBeNull();
    expect(Modes.enterSimplify({})).toBeNull();
  });
});

describe('TB-10 — stroke weight sub-mode', () => {
  let dom;
  let layer;
  let events;
  let app;

  beforeEach(() => {
    dom = buildHarness();
    layer = { id: 'l1', strokeWidth: 0.3 };
    events = { pushes: 0, renders: 0 };
    app = {
      pushHistory: () => { events.pushes += 1; },
      render: () => { events.renders += 1; },
      engine: { getLayerById: (id) => (id === 'l1' ? layer : null) },
    };
    setupBar(dom, { layer, app });
  });

  test('renders slider + stepper + value field + overflow, and drives StrokeModel with one undo step per drag', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterStrokeWeight({ app, layerIds: ['l1'], primaryLayer: layer });
    const host = dom.window.document.getElementById('bar-content');
    const slider = host.querySelector('.ctxbar-weight-slider');
    const field = host.querySelector('.ctxbar-weight-field');
    expect(slider).not.toBeNull();
    expect(field).not.toBeNull();
    expect(host.querySelector('[data-weight-inc]')).not.toBeNull();
    expect(host.querySelector('[data-ctxbar-overflow]')).not.toBeNull();

    fire(dom, slider, 'pointerdown');
    slider.value = '1.5';
    fire(dom, slider, 'input');
    slider.value = '2.0';
    fire(dom, slider, 'input');
    fire(dom, slider, 'pointerup');

    expect(layer.strokeWidth).toBeCloseTo(2.0, 3);
    // begin fired only on the first input of the gesture → exactly one history push.
    expect(events.pushes).toBe(1);
  });

  test('stepper + field each commit one undo step', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterStrokeWeight({ app, layerIds: ['l1'], primaryLayer: layer });
    const host = dom.window.document.getElementById('bar-content');
    host.querySelector('[data-weight-inc]').click();
    expect(events.pushes).toBe(1);
    expect(layer.strokeWidth).toBeGreaterThan(0.3);

    const field = host.querySelector('.ctxbar-weight-field');
    field.value = '1';
    fire(dom, field, 'change');
    expect(events.pushes).toBe(2);
    expect(layer.strokeWidth).toBeCloseTo(1, 3);
  });

  test('overflow "…" menu offers Open Stroke Options → mounts the STR-2 panel as an anchored popover', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterStrokeWeight({ app, layerIds: ['l1'], primaryLayer: layer });
    const host = dom.window.document.getElementById('bar-content');
    host.querySelector('[data-ctxbar-overflow]').click();
    const item = dom.window.document.querySelector('.ctxbar-menu [data-open-stroke-options]');
    expect(item).not.toBeNull();
    expect(item.textContent).toBe('Open Stroke Options');
    item.click();
    const popover = dom.window.document.querySelector('.ctxbar-stroke-options-popover');
    expect(popover).not.toBeNull();
    // The STR-2 component rendered into it (its mount adds the .stroke-options
    // class to the host and builds the weight section).
    expect(popover.classList.contains('stroke-options')).toBe(true);
    expect(popover.querySelector('[data-stroke-section="weight"]')).not.toBeNull();
  });
});

describe('TB-11 — simplify sub-mode', () => {
  let dom;
  let app;
  let ops;

  const stubOps = (dom) => {
    const calls = { begin: [], preview: [], commit: 0, cancel: 0, auto: 0 };
    dom.window.Vectura.PathEditOps = {
      // maxSteps 100 → the slider is reducible (range 0..100).
      simplifyBegin: (ids) => { calls.begin.push(ids); return { layerIds: ids, pointsBefore: 100, maxSteps: 100 }; },
      simplifyPreview: (index) => { calls.preview.push(index); return { index, maxSteps: 100, pointsBefore: 100, pointsAfter: Math.round(100 - index / 2) }; },
      simplifyCommit: () => { calls.commit += 1; return { committed: true, index: 50 }; },
      simplifyCancel: () => { calls.cancel += 1; return true; },
      autoSmooth: () => { calls.auto += 1; return 42; },
    };
    return calls;
  };

  beforeEach(() => {
    dom = buildHarness();
    app = { pushHistory: () => {}, render: () => {}, engine: { getLayerById: (id) => ({ id }) } };
    setupBar(dom, { layer: { id: 'l1' }, app });
    ops = stubOps(dom);
  });

  test('enter begins a session and renders min/max wave icons + slider + Auto-Smooth + Done', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterSimplify({ app, layerIds: ['l1'] });
    expect(ops.begin).toHaveLength(1);
    const host = dom.window.document.getElementById('bar-content');
    expect(host.querySelector('.ctxbar-wave-min')).not.toBeNull();
    expect(host.querySelector('.ctxbar-wave-max')).not.toBeNull();
    expect(host.querySelector('.ctxbar-simplify-slider')).not.toBeNull();
    expect(host.querySelector('.ctxbar-auto-smooth')).not.toBeNull();
    expect(host.querySelector('[data-ctxbar-exit="done"]')).not.toBeNull();
  });

  test('slider live-previews a reduction-ladder rung and shows a "{pts} pts" badge', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterSimplify({ app, layerIds: ['l1'] });
    const slider = dom.window.document.querySelector('.ctxbar-simplify-slider');
    expect(slider.disabled).toBe(false); // reducible (maxSteps 100)
    expect(slider.getAttribute('max')).toBe('100');
    slider.value = '40';
    fire(dom, slider, 'input');
    expect(ops.preview[ops.preview.length - 1]).toBe(40);
    const badge = dom.window.document.querySelector('.ctxbar-simplify-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('80 pts');
  });

  test('Auto-Smooth positions the slider at the suggestion and previews', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterSimplify({ app, layerIds: ['l1'] });
    dom.window.document.querySelector('.ctxbar-auto-smooth').click();
    expect(ops.auto).toBe(1);
    const slider = dom.window.document.querySelector('.ctxbar-simplify-slider');
    expect(slider.value).toBe('42');
    expect(ops.preview[ops.preview.length - 1]).toBe(42);
  });

  test('Done commits; Escape cancels', () => {
    const Modes = dom.window.Vectura.UI.ContextBarModes;
    Modes.enterSimplify({ app, layerIds: ['l1'] });
    dom.window.document.querySelector('[data-ctxbar-exit="done"]').click();
    expect(ops.commit).toBe(1);
    expect(ops.cancel).toBe(0);

    // New session → Escape cancels without committing.
    ops.commit = 0;
    Modes.enterSimplify({ app, layerIds: ['l1'] });
    fireKey(dom, 'keydown', 'Escape');
    expect(ops.cancel).toBe(1);
    expect(ops.commit).toBe(0);
  });
});

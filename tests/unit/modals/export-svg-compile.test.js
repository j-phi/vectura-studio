/*
 * Compile gate for src/ui/modals/export-svg.js (Phase 3 step 5 — final modal).
 *
 * Verifies the export-svg module:
 *   - registers as window.Vectura.UI.Modals.ExportSvg
 *   - exposes bind() + the full set of prototype-callable methods
 *     (openExportModal, fitExportPreview, resizeExportPreviewCanvas,
 *      renderExportPreview, decorateExportControlsPanel,
 *      syncLegendSettingsControls, attachExportInfoButtons,
 *      buildExportPreviewPath, buildExportClipPolygons)
 *   - throws a clear error if any prototype-callable method runs before bind()
 *   - openExportModal composes this.openModal() with the expected scaffold
 *     (preview canvas, mode select, legend, settings scroll, footer Cancel +
 *     Export submit buttons) when the optimization-controls + stash elements
 *     are present in the DOM
 *   - openExportModal is a no-op (no openModal call) when either of the
 *     required #optimization-controls / #optimization-controls-stash hooks
 *     are missing — this matches legacy behavior and prevents partial-state
 *     openings during early DOM init.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

describe('export-svg compile gate', () => {
  let dom;
  let ExportSvg;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/export-svg.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    ExportSvg = w.Vectura.UI.Modals.ExportSvg;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.ExportSvg with bind + the full method set', () => {
    expect(ExportSvg).toBeTruthy();
    expect(typeof ExportSvg.bind).toBe('function');
    expect(typeof ExportSvg.openExportModal).toBe('function');
    expect(typeof ExportSvg.fitExportPreview).toBe('function');
    expect(typeof ExportSvg.resizeExportPreviewCanvas).toBe('function');
    expect(typeof ExportSvg.renderExportPreview).toBe('function');
    expect(typeof ExportSvg.decorateExportControlsPanel).toBe('function');
    expect(typeof ExportSvg.syncLegendSettingsControls).toBe('function');
    expect(typeof ExportSvg.attachExportInfoButtons).toBe('function');
    expect(typeof ExportSvg.buildExportPreviewPath).toBe('function');
    expect(typeof ExportSvg.buildExportClipPolygons).toBe('function');
  });

  it('openExportModal throws a clear error before bind()', () => {
    expect(() => ExportSvg.openExportModal.call({}))
      .toThrow(/ExportSvg\.openExportModal invoked before ExportSvg\.bind/);
  });

  it('renderExportPreview throws a clear error before bind()', () => {
    expect(() => ExportSvg.renderExportPreview.call({}))
      .toThrow(/ExportSvg\.renderExportPreview invoked before ExportSvg\.bind/);
  });

  // Meridian Unit 1.9b: bindExportButton moved from _ui-legacy.js bindGlobal
  it('installOn registers bindExportButton on the UI prototype (Unit 1.9b)', () => {
    expect(typeof ExportSvg.bindExportButton).toBe('function');
    const proto = {};
    ExportSvg.installOn(proto);
    expect(typeof proto.bindExportButton).toBe('function');
    expect(typeof proto.openExportModal).toBe('function');
  });

  it('bindExportButton returns silently when #btn-export is absent', () => {
    ExportSvg.bind({
      getEl: () => null,
    });
    expect(() => ExportSvg.bindExportButton.call({})).not.toThrow();
  });

  it('after bind(), openExportModal is a no-op when #optimization-controls is missing', () => {
    ExportSvg.bind({
      getEl: (id, opts = {}) => dom.window.document.getElementById(id),
      SETTINGS: {},
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      getThemeToken: (_, fb = '') => fb,
      getContrastTextColor: () => '#000',
      EXPORT_INFO: {},
      OPTIMIZATION_STEPS: [],
      openColorPickerAnchoredTo: () => {},
    });

    let openCalls = 0;
    const stub = {
      app: { renderer: null, render: () => {} },
      setTopMenuOpen() {},
      openModal() { openCalls += 1; },
      closeModal() {},
      buildControls() {},
      decorateExportControlsPanel() {},
      resizeExportPreviewCanvas() {},
    };
    ExportSvg.openExportModal.call(stub);
    expect(openCalls).toBe(0);
  });

  it('after bind() and DOM hooks present, openExportModal composes openModal with the export scaffold', () => {
    const w = dom.window;
    const d = w.document;
    // JSDOM ships without HTMLCanvasElement.prototype.getContext — stub it
    // here so the modal can capture its 2D context without throwing.
    if (!w.HTMLCanvasElement.prototype.getContext._patchedForExportTest) {
      const stubCtx = {
        save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
        fill() {}, clip() {}, translate() {}, scale() {}, setTransform() {},
        arc() {}, ellipse() {}, quadraticCurveTo() {},
        set fillStyle(_) {}, get fillStyle() { return ''; },
        set strokeStyle(_) {}, get strokeStyle() { return ''; },
        set lineWidth(_) {}, get lineWidth() { return 0; },
        set lineCap(_) {}, get lineCap() { return ''; },
        set lineJoin(_) {}, get lineJoin() { return ''; },
        set globalAlpha(_) {}, get globalAlpha() { return 1; },
        set shadowBlur(_) {}, get shadowBlur() { return 0; },
        set shadowColor(_) {}, get shadowColor() { return ''; },
      };
      const stub = function getContext() { return stubCtx; };
      stub._patchedForExportTest = true;
      w.HTMLCanvasElement.prototype.getContext = stub;
    }
    // Ensure the legacy hooks the modal expects are in the DOM.
    let controls = d.getElementById('optimization-controls');
    if (!controls) {
      controls = d.createElement('div');
      controls.id = 'optimization-controls';
      d.body.appendChild(controls);
    }
    let stash = d.getElementById('optimization-controls-stash');
    if (!stash) {
      stash = d.createElement('div');
      stash.id = 'optimization-controls-stash';
      d.body.appendChild(stash);
    }

    let lastCall = null;
    let openCalls = 0;
    const stub = {
      app: {
        renderer: { exportModalOpen: false },
        render() {},
      },
      setTopMenuOpen() {},
      openModal(opts) { openCalls += 1; lastCall = opts; },
      closeModal() {},
      buildControls() {},
      decorateExportControlsPanel() {},
      resizeExportPreviewCanvas() {},
    };

    ExportSvg.openExportModal.call(stub);
    expect(openCalls).toBe(1);
    expect(lastCall).toBeTruthy();
    expect(lastCall.title).toBe('Export SVG');
    expect(lastCall.cardClass).toContain('modal-card--export');

    // The body is the root <div id="export-modal-root"> itself — its id and
    // descendant scaffold ids are what we assert.
    expect(lastCall.body).toBeTruthy();
    expect(lastCall.body.id).toBe('export-modal-root');
    expect(lastCall.body.querySelector('#export-preview-canvas-wrap')).toBeTruthy();
    expect(lastCall.body.querySelector('#export-preview-canvas')).toBeTruthy();
    expect(lastCall.body.querySelector('#export-preview-mode')).toBeTruthy();
    expect(lastCall.body.querySelector('#export-preview-legend')).toBeTruthy();
    expect(lastCall.body.querySelector('#export-modal-cancel')).toBeTruthy();
    expect(lastCall.body.querySelector('#export-modal-submit')).toBeTruthy();
    expect(lastCall.body.querySelector('#export-settings-scroll')).toBeTruthy();
    // exportModalState is captured on the instance for cross-call reads.
    expect(stub.exportModalState).toBeTruthy();
    expect(stub.exportModalState.isOpen).toBe(true);
    // app.renderer.exportModalOpen flipped to true (matches legacy contract).
    expect(stub.app.renderer.exportModalOpen).toBe(true);
  });

  // Meridian Unit 1.9c: optimization-target methods moved from _ui-legacy.js
  it('installOn registers optimization-target methods on the UI prototype (Unit 1.9c)', () => {
    expect(typeof ExportSvg.getOptimizationTargets).toBe('function');
    expect(typeof ExportSvg.getOptimizationTargetIds).toBe('function');
    expect(typeof ExportSvg.optimizeTargetsForCurrentScope).toBe('function');
    const proto = {};
    ExportSvg.installOn(proto);
    expect(typeof proto.getOptimizationTargets).toBe('function');
    expect(typeof proto.getOptimizationTargetIds).toBe('function');
    expect(typeof proto.optimizeTargetsForCurrentScope).toBe('function');
  });

  it('getOptimizationTargets returns empty array when engine has no layers', () => {
    ExportSvg.bind({
      getEl: () => null,
      SETTINGS: { optimizationScope: 'all' },
      clamp: (v) => v,
      getThemeToken: (_, fb = '') => fb,
      getContrastTextColor: () => '#000',
      openColorPickerAnchoredTo: () => {},
    });
    const ctx = { app: { engine: { layers: [], getActiveLayer: () => null }, getSelectedLayers: () => [] } };
    expect(ExportSvg.getOptimizationTargets.call(ctx)).toEqual([]);
  });
});

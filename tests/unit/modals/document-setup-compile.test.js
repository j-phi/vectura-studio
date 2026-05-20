/*
 * Compile gate for src/ui/modals/document-setup.js (Phase 3 step 3).
 *
 * Verifies the document-setup panel module:
 *   - registers as window.Vectura.UI.Modals.DocumentSetup
 *   - exposes bind() + mount + bindHandlers + PANEL_HTML + PANEL_ID
 *   - throws a clear error if mount/bindHandlers run before bind()
 *   - after bind(), mount() injects #settings-panel into a host element
 *   - mount() is idempotent (re-mount no-ops)
 *   - mount() yields all expected control IDs in the markup
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
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

describe('document-setup panel compile gate', () => {
  let dom;
  let DocumentSetup;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/document-setup.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    DocumentSetup = w.Vectura.UI.Modals.DocumentSetup;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.DocumentSetup with bind + mount + bindHandlers', () => {
    expect(DocumentSetup).toBeTruthy();
    expect(typeof DocumentSetup.bind).toBe('function');
    expect(typeof DocumentSetup.mount).toBe('function');
    expect(typeof DocumentSetup.bindHandlers).toBe('function');
    expect(typeof DocumentSetup.PANEL_HTML).toBe('string');
    expect(DocumentSetup.PANEL_ID).toBe('settings-panel');
  });

  it('installOn registers bindDocumentSetupListeners on the UI prototype (Meridian Unit 1.9a)', () => {
    // Unit 1.9a moved the 30 Document Setup input handlers out of legacy
    // bindGlobal() and into a grouped installer on document-setup.js. The
    // installer must mount on UI.prototype as `bindDocumentSetupListeners`
    // so the residual bindGlobal() shell can invoke it as a single call.
    expect(typeof DocumentSetup.installOn).toBe('function');
    const proto = {};
    DocumentSetup.installOn(proto);
    expect(typeof proto.bindDocumentSetupListeners).toBe('function');
    // Legacy alias preserved so external callers still resolve.
    expect(typeof proto._bindDocumentSetupHandlers).toBe('function');
  });

  it('installOn registers bindBgColorListeners on the UI prototype (Meridian Unit 1.9b)', () => {
    // Unit 1.9b moved the inp-bg-color / bg-color-pill handlers from legacy
    // bindGlobal() into a grouped installer on document-setup.js (the panel
    // owns the markup for both elements). Surface check only — the runtime
    // smoke for bindBgColorListeners runs further down to avoid polluting
    // the "throws before bind()" assertions below.
    expect(typeof DocumentSetup.bindBgColorListeners).toBe('function');
    const proto = {};
    DocumentSetup.installOn(proto);
    expect(typeof proto.bindBgColorListeners).toBe('function');
  });

  it('mount throws a clear error before bind()', () => {
    const host = dom.window.document.createElement('div');
    expect(() => DocumentSetup.mount(host))
      .toThrow(/DocumentSetup\.mount invoked before DocumentSetup\.bind/);
  });

  it('bindHandlers throws a clear error before bind()', () => {
    expect(() => DocumentSetup.bindHandlers.call({}))
      .toThrow(/DocumentSetup\.bindHandlers invoked before DocumentSetup\.bind/);
  });

  it('after bind(), mount() injects the panel with all expected control IDs', () => {
    DocumentSetup.bind({ getEl: (id) => dom.window.document.getElementById(id) });
    const main = dom.window.document.querySelector('main');
    const panel = DocumentSetup.mount(main);
    expect(panel).toBeTruthy();
    expect(panel.id).toBe('settings-panel');
    // Smoke-check a representative subset of the ~30 inputs the panel owns.
    // Every preserved id must remain present so existing JS keeps wiring.
    const expectedIds = [
      'settings-panel',
      'btn-close-settings',
      'machine-profile',
      'set-document-units',
      'set-paper-width',
      'set-paper-height',
      'set-orientation',
      'set-margin',
      'set-truncate',
      'set-crop-exports',
      'set-outside-opacity',
      'set-margin-line',
      'set-margin-line-color-pill',
      'set-margin-line-color',
      'set-margin-line-weight',
      'set-margin-line-weight-slider',
      'set-margin-line-dotting',
      'set-margin-line-style-reset',
      'set-show-guides',
      'set-snap-guides',
      'set-show-document-dimensions',
      'set-cookie-preferences',
      'btn-clear-preferences',
      'set-show-tour',
      'bg-color-pill',
      'inp-bg-color',
      'set-selection-outline',
      'set-selection-outline-color-pill',
      'set-selection-outline-color',
      'set-selection-outline-width',
      'set-selection-outline-width-slider',
      'set-selection-outline-style-reset',
      'set-speed-down',
      'set-speed-up',
      'layer-bar-palette-trigger',
      'layer-bar-palette-name',
      'layer-bar-palette-preview',
      'layer-bar-palette-menu',
      'set-undo',
    ];
    for (const id of expectedIds) {
      expect(dom.window.document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
  });

  it('mount() is idempotent (re-mount no-ops)', () => {
    const main = dom.window.document.querySelector('main');
    const panel1 = DocumentSetup.mount(main);
    const panel2 = DocumentSetup.mount(main);
    expect(panel1).toBe(panel2);
    expect(dom.window.document.querySelectorAll('#settings-panel').length).toBe(1);
  });

  it('PANEL_HTML preserves headline labels and units options', () => {
    // Section labels were rewritten in the Var 01 (Meridian primitives)
    // refactor — `DOCUMENT SETUP` -> `Document Setup`, `Paper Size` -> `Paper`,
    // `History` -> `History & Preferences`. The other section names stay.
    expect(DocumentSetup.PANEL_HTML).toContain('Document Setup');
    expect(DocumentSetup.PANEL_HTML).toMatch(/data-sect-toggle[^>]*>\s*Paper\s/);
    expect(DocumentSetup.PANEL_HTML).toContain('Plotter Physics');
    expect(DocumentSetup.PANEL_HTML).toContain('UI Color Palette');
    expect(DocumentSetup.PANEL_HTML).toContain('<option value="metric">');
    expect(DocumentSetup.PANEL_HTML).toContain('<option value="imperial">');
  });

  it('PANEL_HTML uses Meridian primitive classes (Var 01 refactor)', () => {
    // Var 01 swapped the legacy Tailwind utility markup for the Meridian
    // component vocabulary. These class names are the contract that the
    // skin's components.css paints against — losing one regresses the
    // visual treatment back to inconsistent legacy styling.
    const html = DocumentSetup.PANEL_HTML;
    expect(html).toContain('class="sect sect--color-');
    expect(html).toContain('class="sect-hdr is-open"');
    expect(html).toContain('class="sect-body"');
    expect(html).toContain('class="seg-ctrl"');
    expect(html).toContain('class="ctrl-sel"');
    expect(html).toContain('class="num-step ');
    expect(html).toContain('class="num-step-inp"');
    expect(html).toContain('class="pane-hdr"');
    expect(html).toContain('class="pane-title"');
  });

  it('section headers collapse when clicked (toggle .is-open + aria-expanded)', () => {
    // The .is-open class and aria-expanded are the accessibility contract.
    // Visibility is driven by a max-height animation in JS/CSS rather than
    // display:none, so this test checks the class/aria state only.
    const fakeUi = {};
    DocumentSetup.bindHandlers.call(fakeUi);
    const panel = dom.window.document.getElementById('settings-panel');
    const hdr = panel.querySelector('[data-sect-toggle]');
    const body = hdr.nextElementSibling;
    expect(hdr.classList.contains('is-open')).toBe(true);
    expect(hdr.getAttribute('aria-expanded')).toBe('true');

    hdr.click();
    expect(hdr.classList.contains('is-open')).toBe(false);
    expect(hdr.getAttribute('aria-expanded')).toBe('false');
    expect(body.style.overflow).toBe('hidden');

    hdr.click();
    expect(hdr.classList.contains('is-open')).toBe(true);
    expect(hdr.getAttribute('aria-expanded')).toBe('true');
  });

  it('open animation reads offsetHeight after clearing max-height (accurate natural-height measure)', () => {
    // REGRESSION GUARD: offsetHeight is the rendered padding-box height and
    // is always affected by max-height constraints. We clear max-height first
    // so the element is unconstrained when we read it, giving the true natural
    // height including all padding. scrollHeight can undercount padding-bottom
    // in some browsers for flex containers; offsetHeight never does.
    //
    // There are two offsetHeight reads: the first is the measurement (must
    // happen with maxHeight=''), the second is a reflow-anchor after snapping
    // back (maxHeight='0'). We assert only the first read.
    const panel = dom.window.document.getElementById('settings-panel');
    const collapsedHdr = panel.querySelector('[data-sect-toggle][aria-expanded="false"]');
    expect(collapsedHdr).toBeTruthy();
    const body = collapsedHdr.nextElementSibling;

    const maxHeightLog = [];
    const origOffsetHeight =
      Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, 'offsetHeight') ||
      Object.getOwnPropertyDescriptor(dom.window.Element.prototype, 'offsetHeight');
    Object.defineProperty(body, 'offsetHeight', {
      configurable: true,
      get() {
        maxHeightLog.push(body.style.maxHeight);
        return origOffsetHeight ? origOffsetHeight.get.call(this) : 0;
      },
    });

    collapsedHdr.click();

    // First offsetHeight read must be the unconstrained natural-height
    // measurement (maxHeight=''). Later reads may be reflow anchors (maxHeight='0').
    expect(maxHeightLog.length).toBeGreaterThan(0);
    expect(maxHeightLog[0]).toBe('');

    delete body.offsetHeight;
  });

  it('transitionend on open clears maxHeight with transition suppressed (avoids hitch)', () => {
    // REGRESSION GUARD: after the open animation the section must have no
    // max-height constraint — leaving it at Npx clips content if the
    // measurement was off by even a few pixels (e.g. padding-bottom).
    //
    // But clearing maxHeight naively re-triggers the CSS max-height transition
    // from Npx → none, producing a visible jump (the hitch). The fix:
    // set transition:none FIRST (suppressing any new transition), flush with a
    // reflow, then clear maxHeight, then restore transition in a rAF.
    const panel = dom.window.document.getElementById('settings-panel');
    const collapsedHdr = panel.querySelector('[data-sect-toggle][aria-expanded="false"]');
    expect(collapsedHdr).toBeTruthy();
    const body = collapsedHdr.nextElementSibling;

    collapsedHdr.click();
    expect(body.style.overflow).toBe('hidden');

    const event = Object.assign(
      new dom.window.Event('transitionend', { bubbles: true }),
      { propertyName: 'max-height', elapsedTime: 0.28 },
    );
    body.dispatchEvent(event);

    // maxHeight must be fully cleared — a leftover Npx value clips content.
    expect(body.style.maxHeight).toBe('');
    // overflow restored so content isn't clipped by the element itself.
    expect(body.style.overflow).toBe('');
    // transition must be 'none' at this point: the rAF that restores it hasn't
    // fired in JSDOM. This confirms the suppression happened before the clear.
    expect(body.style.transition).toBe('none');
  });

  it('num-step ± buttons mutate the input AND dispatch change so legacy handlers fire', () => {
    // The 30+ #set-* handlers in _ui-legacy.js bindGlobal() listen for
    // `change` events on the input. The new ± buttons must dispatch one,
    // otherwise clicking ± looks visually correct but silently no-ops.
    const panel = dom.window.document.getElementById('settings-panel');
    const undo = panel.querySelector('#set-undo');
    undo.value = '10';
    const wrap = undo.closest('[data-num-step]');
    const inc = wrap.querySelector('[data-num-step-inc]');
    const dec = wrap.querySelector('[data-num-step-dec]');

    const changes = [];
    undo.addEventListener('change', () => changes.push(undo.value));

    inc.click();
    expect(undo.value).toBe('11');
    dec.click();
    dec.click();
    expect(undo.value).toBe('9');
    expect(changes).toEqual(['11', '10', '9']);
  });

  it('num-step ± clamps to min/max when bounded', () => {
    // #set-undo is min=1 max=200; #set-outside-opacity is min=0 max=1 step=0.05.
    // Clamping prevents out-of-range values from reaching the engine.
    const panel = dom.window.document.getElementById('settings-panel');
    const undo = panel.querySelector('#set-undo');
    undo.value = '1';
    const undoWrap = undo.closest('[data-num-step]');
    undoWrap.querySelector('[data-num-step-dec]').click();
    expect(parseFloat(undo.value)).toBe(1); // clamped at min

    const opacity = panel.querySelector('#set-outside-opacity');
    opacity.value = '1';
    const opWrap = opacity.closest('[data-num-step]');
    opWrap.querySelector('[data-num-step-inc]').click();
    expect(parseFloat(opacity.value)).toBe(1); // clamped at max
  });

  it('bindBgColorListeners (Unit 1.9b) returns silently when #inp-bg-color is absent', () => {
    // Runs near the end so the bind() call here doesn't pollute the "throws
    // before bind()" assertions earlier in this file.
    DocumentSetup.bind({
      getEl: () => null,
      SETTINGS: {},
      MACHINES: {},
      normalizeDocumentUnits: (v) => v,
      getContrastTextColor: () => '#000',
      openColorPickerAnchoredTo: () => {},
    });
    expect(() => DocumentSetup.bindBgColorListeners.call({})).not.toThrow();
  });
});

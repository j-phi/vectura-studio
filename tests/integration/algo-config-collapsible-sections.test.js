const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * RGR coverage for the controls-panel RENDERER of collapsible sections (UX1 / WU10)
 * and section hints (R3/UX10 / WU9) in src/ui/panels/algo-config-panel.js.
 *
 * These exercise the REAL buildControls() render loop via the panel-building
 * harness (same harness used by algorithm-switching.test.js). To keep the
 * assertions independent of the parallel schema agent's exact registry contents,
 * the section-routing behaviors are driven through SYNTHETIC control defs injected
 * into app.ui.controls[type] before buildControls() — this still runs the
 * production renderDef / algoDefs loop, only the def list is controlled.
 */
describe('Collapsible control sections + section hints (renderer)', () => {
  let runtime;
  let window;
  let document;
  let app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });
    window = runtime.window;
    document = runtime.document;
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const dynamicControls = () => document.getElementById('dynamic-controls');

  // Build controls for a layer whose controls[type] has been replaced with a
  // synthetic def list, then restore the original defs.
  const buildWithDefs = (type, defs) => {
    app.engine.addLayer(type);
    app.ui.renderLayers();
    const original = app.ui.controls[type];
    app.ui.controls[type] = defs;
    try {
      app.ui.buildControls();
    } finally {
      app.ui.controls[type] = original;
    }
  };

  test('a collapsed section renders a closed disclosure with the following controls inside its body', () => {
    buildWithDefs('spiralizer', [
      { type: 'section', label: 'Shading & Lines', collapsed: true },
      { id: 'depthCue', label: 'Depth Cue', type: 'select', options: [{ value: 'off', label: 'Off' }] },
      { id: 'outlineWeight', label: 'Outline Weight', type: 'range', min: 1, max: 4, step: 0.1 },
    ]);

    const root = dynamicControls();
    const section = root.querySelector('.control-section--collapsible');
    expect(section).toBeTruthy();

    // Closed by default.
    expect(section.classList.contains('is-collapsed')).toBe(true);

    const header = section.querySelector('.control-section-toggle');
    expect(header).toBeTruthy();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    // Header label must be in the DOM (R-CONSIST rule a).
    expect(header.textContent).toContain('Shading & Lines');

    // The controls that follow are INSIDE the collapsible body, not loose siblings.
    const body = section.querySelector('.control-section-body');
    expect(body).toBeTruthy();
    const labelsInBody = Array.from(body.querySelectorAll('.control-label')).map((el) => el.textContent.trim());
    expect(labelsInBody).toEqual(expect.arrayContaining(['Depth Cue', 'Outline Weight']));

    // And they are NOT direct siblings of the section in the base container.
    const looseLabels = Array.from(root.children)
      .filter((el) => !section.contains(el))
      .flatMap((el) => Array.from(el.querySelectorAll?.('.control-label') || []))
      .map((el) => el.textContent.trim());
    expect(looseLabels).not.toContain('Depth Cue');
  });

  test('activating the header toggles the section open (class + aria flip, body becomes visible)', () => {
    buildWithDefs('spiralizer', [
      { type: 'section', label: 'Shading & Lines', collapsed: true },
      { id: 'depthCue', label: 'Depth Cue', type: 'select', options: [{ value: 'off', label: 'Off' }] },
    ]);

    const section = dynamicControls().querySelector('.control-section--collapsible');
    const header = section.querySelector('.control-section-toggle');

    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('false');

    header.dispatchEvent(new window.Event('click', { bubbles: true }));

    expect(section.classList.contains('is-collapsed')).toBe(false);
    expect(header.getAttribute('aria-expanded')).toBe('true');

    // Toggling again re-collapses.
    header.dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  test('a NON-collapsed section renders flat exactly as before (sibling controls, no disclosure)', () => {
    buildWithDefs('spiralizer', [
      { type: 'section', label: 'Plain Section' },
      { id: 'depthCue', label: 'Depth Cue', type: 'select', options: [{ value: 'off', label: 'Off' }] },
    ]);

    const root = dynamicControls();
    // No collapsible markup for a plain section.
    expect(root.querySelector('.control-section--collapsible')).toBeNull();

    // Flat header present with the original structure.
    const flat = root.querySelector('.control-section');
    expect(flat).toBeTruthy();
    expect(flat.querySelector('.control-section-title')).toBeTruthy();
    expect(flat.querySelector('.control-section-title').textContent).toContain('Plain Section');

    // The control is a SIBLING in the base container, not nested in the section.
    expect(flat.querySelector('.control-label')).toBeNull();
    const siblingLabels = Array.from(root.querySelectorAll('.control-label')).map((el) => el.textContent.trim());
    expect(siblingLabels).toContain('Depth Cue');
  });

  test('a sectionHint renders its text when showIf is true and is absent when showIf is false', () => {
    // showIf true → hint present.
    buildWithDefs('spiralizer', [
      { type: 'sectionHint', text: 'Add a noise layer to enable', showIf: () => true },
    ]);
    let hint = dynamicControls().querySelector('.control-section-hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toBe('Add a noise layer to enable');

    // showIf false → hint absent.
    buildWithDefs('spiralizer', [
      { type: 'sectionHint', text: 'Add a noise layer to enable', showIf: () => false },
    ]);
    hint = dynamicControls().querySelector('.control-section-hint');
    expect(hint).toBeNull();
  });

  test('a plain section after a collapsed section resets routing (its controls are siblings again)', () => {
    buildWithDefs('spiralizer', [
      { type: 'section', label: 'Collapsed One', collapsed: true },
      { id: 'depthCue', label: 'Depth Cue', type: 'select', options: [{ value: 'off', label: 'Off' }] },
      { type: 'section', label: 'Plain Two' },
      { id: 'outlineWeight', label: 'Outline Weight', type: 'range', min: 1, max: 4, step: 0.1 },
    ]);

    const root = dynamicControls();
    const collapsible = root.querySelector('.control-section--collapsible');
    const body = collapsible.querySelector('.control-section-body');

    // First control is inside the collapsed body.
    expect(Array.from(body.querySelectorAll('.control-label')).map((e) => e.textContent.trim()))
      .toContain('Depth Cue');
    // Second control (after the plain section) is NOT inside the collapsed body.
    expect(Array.from(body.querySelectorAll('.control-label')).map((e) => e.textContent.trim()))
      .not.toContain('Outline Weight');
    // It is a sibling at the base level.
    const looseLabels = Array.from(root.children)
      .filter((el) => !collapsible.contains(el))
      .flatMap((el) => Array.from(el.querySelectorAll?.('.control-label') || []).concat(el.classList?.contains('control-label') ? [el] : []))
      .map((el) => el.textContent.trim());
    expect(looseLabels).toContain('Outline Weight');
  });
});

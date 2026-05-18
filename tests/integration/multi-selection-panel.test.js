const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Multi-selection algorithm panel', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    // main.js is excluded in FULL_STACK; init the multi-selection panel manually
    // so DOM event handlers (including collapsible sub-section toggles) are wired up.
    window.Vectura.UI.MultiSelectionPanel.init(app);
    window.Vectura.UI.PathfinderPanel?.init?.(app);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function addTwoLayers() {
    app.engine.layers = [];
    const aId = app.engine.addLayer('wavetable');
    const bId = app.engine.addLayer('wavetable');
    const a = app.engine.layers.find((l) => l.id === aId);
    const b = app.engine.layers.find((l) => l.id === bId);
    a.params.posX = 0; a.params.posY = 0; a.params.scaleX = 1; a.params.scaleY = 1; a.params.rotation = 0;
    b.params.posX = 0; b.params.posY = 0; b.params.scaleX = 1; b.params.scaleY = 1; b.params.rotation = 0;
    return { a, b };
  }

  test('multi-selection shows four sibling subpanels and hides the Algorithm section', () => {
    const { a, b } = addTwoLayers();
    app.renderer.setSelection([a.id, b.id], a.id);

    // Algorithm section is fully hidden in multi-selection — its place is taken
    // by four top-level subpanels (Info / Transform / Align / Pathfinder).
    expect(document.getElementById('left-section-algorithm')?.style.display).toBe('none');
    expect(document.getElementById('left-section-algorithm-configuration')?.style.display).toBe('none');

    const info = document.getElementById('left-section-multi-info');
    const xform = document.getElementById('left-section-multi-transform');
    const align = document.getElementById('left-section-multi-selection');
    const pf = document.getElementById('left-section-multi-pathfinder');
    expect(info?.style.display).not.toBe('none');
    expect(xform?.style.display).not.toBe('none');
    expect(align?.style.display).not.toBe('none');
    expect(pf?.style.display).not.toBe('none');

    // Each subpanel is a .left-panel-section, so the skin paints its accent bar.
    [info, xform, align, pf].forEach((el) => {
      expect(el.classList.contains('left-panel-section')).toBe(true);
    });

    // The Transform inputs have been relocated into the Transform subpanel body.
    const transformSection = document.getElementById('algorithm-transform-section');
    expect(transformSection?.style.display).not.toBe('none');
    expect(transformSection?.parentElement?.id).toBe('left-section-multi-transform-body');

    const notice = document.querySelector('[data-multi-selection-notice]');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toMatch(/Select a single layer/i);
    // Description lives in the Multiple-Selection subpanel body.
    expect(notice.parentElement?.id).toBe('left-section-multi-info-body');
  });

  test('single-selection restores algorithm dropdown, configuration, and the Algorithm title', () => {
    const { a } = addTwoLayers();
    // First go multi to apply the hide path…
    app.renderer.setSelection([a.id, app.engine.layers[1].id], a.id);
    // …then narrow to one layer.
    app.renderer.setSelection([a.id], a.id);

    expect(document.getElementById('left-section-algorithm')?.style.display).toBe('');
    expect(document.getElementById('left-section-primary-title')?.textContent).toBe('Algorithm');
    expect(document.getElementById('generator-module-trigger')?.style.display).toBe('');
    expect(document.getElementById('algo-about')?.style.display).toBe('');
    expect(document.getElementById('left-section-algorithm-configuration')?.style.display).toBe('');
    expect(document.querySelector('[data-multi-selection-notice]')).toBeNull();

    // Transform section is moved back into the Algorithm section body.
    const transformSection = document.getElementById('algorithm-transform-section');
    expect(transformSection?.parentElement?.id).toBe('left-section-algorithm-body');

    // Multi-selection subpanels are hidden again.
    expect(document.getElementById('left-section-multi-info')?.style.display).toBe('none');
    expect(document.getElementById('left-section-multi-transform')?.style.display).toBe('none');
    expect(document.getElementById('left-section-multi-selection')?.style.display).toBe('none');
    expect(document.getElementById('left-section-multi-pathfinder')?.style.display).toBe('none');
  });

  test('changing posX while multi-selected updates every selected layer and regenerates paths', () => {
    const { a, b } = addTwoLayers();
    app.renderer.setSelection([a.id, b.id], a.id);

    // Spy on engine.generate to confirm every selected layer's geometry is rebuilt.
    const origGenerate = app.engine.generate.bind(app.engine);
    const generatedIds = [];
    app.engine.generate = (id) => {
      generatedIds.push(id);
      return origGenerate(id);
    };

    try {
      const posXInput = document.getElementById('inp-pos-x');
      expect(posXInput).toBeTruthy();
      posXInput.value = '42';
      posXInput.dispatchEvent(new window.Event('change', { bubbles: true }));

      expect(a.params.posX).toBe(42);
      expect(b.params.posX).toBe(42);
      expect(generatedIds).toEqual(expect.arrayContaining([a.id, b.id]));
    } finally {
      app.engine.generate = origGenerate;
    }
  });

  test('changing rotation while multi-selected updates every selected layer', () => {
    const { a, b } = addTwoLayers();
    app.renderer.setSelection([a.id, b.id], a.id);

    const rotInput = document.getElementById('inp-rotation');
    expect(rotInput).toBeTruthy();
    rotInput.value = '30';
    rotInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(a.params.rotation).toBe(30);
    expect(b.params.rotation).toBe(30);
  });

  describe('collapsible sub-sections', () => {
    const ALIGN_SUB_SECTIONS = [
      { id: 'align-section-align',      key: 'multiSelectionAlign',      title: 'Align Objects' },
      { id: 'align-section-distribute', key: 'multiSelectionDistribute', title: 'Distribute Objects' },
      { id: 'align-section-spacing',    key: 'multiSelectionSpacing',    title: 'Distribute Spacing' },
      { id: 'align-section-target',     key: 'multiSelectionTarget',     title: 'Align To' },
    ];

    test('each align sub-section renders a collapsible global-section header', () => {
      ALIGN_SUB_SECTIONS.forEach(({ id, title }) => {
        const sectionEl = document.getElementById(id);
        expect(sectionEl).toBeTruthy();
        expect(sectionEl.classList.contains('global-section')).toBe(true);
        const header = sectionEl.querySelector('.global-section-header');
        const body = sectionEl.querySelector('.global-section-body');
        const titleEl = sectionEl.querySelector('.global-section-title');
        expect(header).toBeTruthy();
        expect(body).toBeTruthy();
        expect(titleEl?.textContent).toBe(title);
      });
    });

    test('clicking a sub-section header toggles its collapsed state, aria-expanded, body display, and SETTINGS.uiSections', () => {
      const { a, b } = addTwoLayers();
      app.renderer.setSelection([a.id, b.id], a.id);

      ALIGN_SUB_SECTIONS.forEach(({ id, key }) => {
        const sectionEl = document.getElementById(id);
        const header = sectionEl.querySelector('.global-section-header');
        const body = sectionEl.querySelector('.global-section-body');

        // Starts expanded
        expect(sectionEl.classList.contains('collapsed')).toBe(false);
        expect(header.getAttribute('aria-expanded')).toBe('true');
        expect(body.style.display).not.toBe('none');

        // Collapse
        header.click();
        expect(sectionEl.classList.contains('collapsed')).toBe(true);
        expect(header.getAttribute('aria-expanded')).toBe('false');
        expect(body.style.display).toBe('none');
        expect(window.Vectura.SETTINGS.uiSections[key]).toBe(true);

        // Expand again
        header.click();
        expect(sectionEl.classList.contains('collapsed')).toBe(false);
        expect(header.getAttribute('aria-expanded')).toBe('true');
        expect(body.style.display).toBe('');
        expect(window.Vectura.SETTINGS.uiSections[key]).toBe(false);
      });
    });

    test('collapsed state survives a refresh() (multi-selection enter/leave)', () => {
      const { a, b } = addTwoLayers();
      app.renderer.setSelection([a.id, b.id], a.id);

      // Collapse the Distribute Spacing section
      const spacingHeader = document.querySelector('#align-section-spacing .global-section-header');
      spacingHeader.click();
      expect(document.getElementById('align-section-spacing').classList.contains('collapsed')).toBe(true);

      // Leave multi-selection, then re-enter — collapsed state must persist
      app.renderer.setSelection([a.id], a.id);
      app.renderer.setSelection([a.id, b.id], a.id);

      expect(document.getElementById('align-section-spacing').classList.contains('collapsed')).toBe(true);
      expect(spacingHeader.getAttribute('aria-expanded')).toBe('false');

      // Restore for downstream tests
      spacingHeader.click();
      expect(document.getElementById('align-section-spacing').classList.contains('collapsed')).toBe(false);
    });
  });

  describe('Pathfinder panel for selected compound', () => {
    function addCompound() {
      const { a, b } = addTwoLayers();
      const PO = window.Vectura.PathfinderOps;
      const a_ = app.engine.layers.find((l) => l.id === a.id);
      const b_ = app.engine.layers.find((l) => l.id === b.id);
      const id = PO.createCompound(app.engine, [a_, b_], 'unite', 'silhouette');
      return app.engine.layers.find((l) => l.id === id);
    }

    test('selecting a single compound shows the Pathfinder subpanel and hides the Align subpanel', () => {
      const compound = addCompound();
      app.renderer.setSelection([compound.id], compound.id);

      const align = document.getElementById('left-section-multi-selection');
      const pf = document.getElementById('left-section-multi-pathfinder');
      const info = document.getElementById('left-section-multi-info');
      const xform = document.getElementById('left-section-multi-transform');

      // Align panel container is still rendered (its inner .align-panel hides),
      // but the Pathfinder subpanel is the relevant one for compound editing.
      const alignInner = align.querySelector('.align-panel');
      expect(alignInner.style.display).toBe('none');
      expect(pf?.style.display).not.toBe('none');
      expect(pf.querySelector('.pathfinder-panel')).toBeTruthy();
      // Info / Transform subpanels are hidden — only Pathfinder matters here.
      expect(info?.style.display).toBe('none');
      expect(xform?.style.display).toBe('none');
    });

    test('the shape-mode button for the compound\'s current opType is aria-pressed', () => {
      const compound = addCompound();
      app.renderer.setSelection([compound.id], compound.id);

      const buttons = Array.from(document.querySelectorAll('.pf-btn[data-pf-op]'));
      const opToPressed = Object.fromEntries(
        buttons.map((btn) => [btn.dataset.pfOp, btn.getAttribute('aria-pressed')])
      );
      expect(opToPressed.unite).toBe('true');
      expect(opToPressed.minusFront).toBe('false');
      expect(opToPressed.intersect).toBe('false');
      expect(opToPressed.exclude).toBe('false');
    });

    test('clicking a different shape-mode button on a selected compound mutates its opType in place', () => {
      const compound = addCompound();
      const originalId = compound.id;
      app.renderer.setSelection([compound.id], compound.id);

      const intersectBtn = document.querySelector('.pf-btn[data-pf-op="intersect"]');
      expect(intersectBtn.disabled).toBe(false);
      intersectBtn.click();

      const after = app.engine.layers.find((l) => l.id === originalId);
      expect(after).toBeTruthy();
      expect(after.compound.opType).toBe('intersect');
      // aria-pressed updates to reflect the new opType
      expect(intersectBtn.getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelector('.pf-btn[data-pf-op="unite"]').getAttribute('aria-pressed')).toBe('false');
    });

    test('selecting a non-compound single layer hides the Pathfinder subpanel again', () => {
      const compound = addCompound();
      app.renderer.setSelection([compound.id], compound.id);
      const someChild = app.engine.layers.find((l) => l.parentId === compound.id);
      expect(someChild).toBeTruthy();
      app.renderer.setSelection([someChild.id], someChild.id);

      expect(document.getElementById('left-section-multi-selection')?.style.display).toBe('none');
      expect(document.getElementById('left-section-multi-pathfinder')?.style.display).toBe('none');
    });
  });

  test('transform inputs show a shared value and a blank "Multiple" placeholder when values differ', () => {
    const { a, b } = addTwoLayers();
    a.params.scaleX = 1;
    b.params.scaleX = 2;
    a.params.scaleY = 1.5;
    b.params.scaleY = 1.5;
    app.renderer.setSelection([a.id, b.id], a.id);

    const scaleXInput = document.getElementById('inp-scale-x');
    const scaleYInput = document.getElementById('inp-scale-y');
    // scaleX differs → blank value, "Multiple" placeholder
    expect(scaleXInput.value).toBe('');
    expect(scaleXInput.placeholder).toMatch(/Multiple/i);
    // scaleY shared → shows value, no placeholder
    expect(parseFloat(scaleYInput.value)).toBe(1.5);
    expect(scaleYInput.placeholder).toBe('');
  });
});

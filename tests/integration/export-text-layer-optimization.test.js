/*
 * Regression: the Export SVG modal's optimization panel (Line Sort, Simplify,
 * Filter, Multipass cards) must render even when the active layer is a Text
 * layer — and even when a Text layer is the ONLY non-group layer in the doc.
 *
 * buildControls() early-returns for Text layers (the bespoke tabbed Text panel
 * replaces the generic control list), and that early return used to skip the
 * optimization-panel render at the end of buildControls(). The export modal's
 * recovery path (temporarily promote a non-text layer to active and rebuild)
 * cannot help a document whose only layer is Text — there is nothing to promote
 * to — so the modal opened with an EMPTY settings pane. The fix hoists the
 * optimization render above the early returns and fires it on every early-return
 * path while the modal is open. See src/ui/panels/algo-config-panel.js.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Export modal optimization panel with a Text layer active', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function closeAnyOpenModal() {
    if (app.ui?.modal?.overlay?.classList?.contains?.('open')) app.ui.closeModal?.();
  }

  // Collapse the document down to a single Text layer so the export modal's
  // "promote a non-text fallback layer" recovery has nothing to fall back to —
  // this is the exact shape (one Text layer) that reproduced the empty pane.
  function makeTextOnlyDoc() {
    const engine = app.engine;
    const textId = engine.addLayer('text');
    const textLayer = engine.layers.find((l) => l.id === textId);
    Object.assign(textLayer.params, { text: 'Vectura', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 });
    engine.generate(textId);
    // Remove every other non-group layer, leaving the Text layer as the only one.
    engine.layers
      .filter((l) => l && !l.isGroup && l.id !== textId)
      .forEach((l) => engine.removeLayer(l.id));
    engine.activeLayerId = textId;
    return textId;
  }

  test('opening the modal with a Text-only doc renders the optimization panel (not empty)', () => {
    closeAnyOpenModal();
    const textId = makeTextOnlyDoc();
    expect(app.engine.getActiveLayer().type).toBe('text');

    app.ui.openExportModal();

    const controls = document.getElementById('optimization-controls');
    expect(controls).toBeTruthy();
    const panel = controls.querySelector('.optimization-panel');
    expect(panel).toBeTruthy();
    // The Line Sort card (and its siblings) must be present, not an empty shell.
    expect(controls.querySelectorAll('.optimization-card').length).toBeGreaterThan(0);

    void textId;
    closeAnyOpenModal();
  });
});

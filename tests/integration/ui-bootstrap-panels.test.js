const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('UI bootstrap integrity', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('app boot populates layers, mathematical model, and about content', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });

    const { window, document } = runtime;
    const pageErrors = [];
    window.addEventListener('error', (event) => {
      if (event?.error?.message) pageErrors.push(event.error.message);
      else if (event?.message) pageErrors.push(event.message);
    });

    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(pageErrors).toEqual([]);

    const layerItems = document.querySelectorAll('#layer-list .layer-item');
    expect(layerItems.length).toBeGreaterThan(0);

    const formulaText = document.getElementById('formula-display')?.textContent?.trim() || '';
    expect(formulaText.length).toBeGreaterThan(0);

    const aboutText = document.getElementById('algo-desc')?.textContent?.trim() || '';
    expect(aboutText.length).toBeGreaterThan(0);
  });

  test('document setup exposes a single export-settings remove hidden geometry control, checked by default', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });

    const { window, document } = runtime;
    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(document.getElementById('set-remove-hidden-geometry')).toBeNull();

    const labels = Array.from(document.querySelectorAll('label, .control-label')).filter((node) =>
      /Remove Hidden Geometry/i.test(node.textContent || '')
    );
    expect(labels).toHaveLength(1);

    const exportCard = Array.from(document.querySelectorAll('.optimization-card')).find((card) =>
      /Export Settings/i.test(card.textContent || '')
    );
    expect(exportCard).toBeTruthy();
    expect(exportCard.textContent).toMatch(/Remove Hidden Geometry/);

    const checkbox = Array.from(exportCard.querySelectorAll('input[type="checkbox"]')).find((input) =>
      input.closest('.optimization-control')?.textContent?.includes('Remove Hidden Geometry')
    );
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    expect(window.Vectura.SETTINGS.removeHiddenGeometry).toBe(true);
  });
});

const { test, expect } = require('@playwright/test');

const captureActiveLayerGeometry = async (page) =>
  page.evaluate(() => {
    const round = (value, precision = 3) => {
      const factor = Math.pow(10, precision);
      return Math.round(Number(value) * factor) / factor;
    };
    const signatureForPaths = (paths = []) => {
      let hash = 2166136261;
      const push = (value) => {
        const text = String(value);
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
      };
      (paths || []).forEach((path, pathIndex) => {
        push(`p${pathIndex}:`);
        if (!Array.isArray(path)) {
          push('null;');
          return;
        }
        path.forEach((pt, pointIndex) => {
          push(`${pointIndex}:${round(pt?.x)}:${round(pt?.y)};`);
        });
        if (path.meta?.kind) push(`kind:${path.meta.kind};`);
      });
      return `${paths.length}:${hash >>> 0}`;
    };
    const layer = window.app?.engine?.getActiveLayer?.();
    return {
      type: layer?.type || null,
      signature: signatureForPaths(layer?.paths || []),
      sourcePathsMaterialized: layer?.sourcePaths != null,
      formula: document.getElementById('formula-display')?.innerText?.trim() || '',
      about: document.getElementById('algo-desc')?.innerText?.trim() || '',
    };
  });

const captureAutumnGridSeamDiagnostics = async (page) =>
  page.evaluate(() => {
    const app = window.app;
    app.engine.addLayer('pattern');
    const layer = app.engine.getActiveLayer();
    layer.params.patternId = 'hero_autumn';
    layer.params.tileMethod = 'grid';
    layer.params.removeSeams = true;
    layer.params.scale = 1;
    app.engine.generate(layer.id);

    const round = (value, precision = 3) => {
      const factor = Math.pow(10, precision);
      return Math.round(Number(value) * factor) / factor;
    };
    const seamY = 44;
    const seamTolerance = 0.001;
    const seamEndpoints = new Map();
    const crossingSegments = [];

    (layer.paths || []).forEach((path) => {
      for (let i = 0; i + 1 < path.length; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        const aOnSeam = Math.abs(a.y - seamY) <= seamTolerance;
        const bOnSeam = Math.abs(b.y - seamY) <= seamTolerance;

        if (aOnSeam) {
          const key = `${round(a.x)},${round(a.y)}`;
          seamEndpoints.set(key, (seamEndpoints.get(key) || 0) + 1);
        }
        if (bOnSeam) {
          const key = `${round(b.x)},${round(b.y)}`;
          seamEndpoints.set(key, (seamEndpoints.get(key) || 0) + 1);
        }

        const crossesSeam = (a.y < seamY && b.y > seamY) || (a.y > seamY && b.y < seamY);
        if (crossesSeam) {
          crossingSegments.push({
            a: { x: round(a.x), y: round(a.y) },
            b: { x: round(b.x), y: round(b.y) },
            dx: round(Math.abs(a.x - b.x)),
            dy: round(Math.abs(a.y - b.y)),
          });
        }
      }
    });

    const oddEndpoints = [...seamEndpoints.entries()].filter(([, count]) => count % 2 === 1);
    const longCrossings = crossingSegments.filter((segment) => segment.dx > 2 || segment.dy > 2);

    return {
      pathCount: layer.paths.length,
      seamPointCount: seamEndpoints.size,
      oddEndpointCount: oddEndpoints.length,
      oddEndpoints,
      crossingSegmentCount: crossingSegments.length,
      crossingSegments,
      longCrossings,
    };
  });

const captureRepresentativePatternIds = async (page) =>
  page.evaluate(() => {
    const patterns = window.Vectura.PATTERNS || [];
    const categories = new Map();
    const addCategory = (key, id) => {
      if (!key || !id || categories.has(key)) return;
      categories.set(key, id);
    };
    const shapeCountForSvg = (svg = '') => {
      const matches = svg.match(/<(path|polygon|rect|circle|ellipse)\b/gi);
      return matches ? matches.length : 0;
    };
    const pathCountForSvg = (svg = '') => {
      const matches = svg.match(/<path\b/gi);
      return matches ? matches.length : 0;
    };
    const moveCountForSvg = (svg = '') => {
      const matches = svg.match(/[Mm][0-9\s,.-]/g);
      return matches ? matches.length : 0;
    };

    patterns
      .filter((pattern) => pattern.fills)
      .forEach((pattern) => {
        const svg = pattern.svg || '';
        const shapeCount = shapeCountForSvg(svg);
        const pathCount = pathCountForSvg(svg);
        const moveCount = moveCountForSvg(svg);
        const evenOdd = /fill-rule="evenodd"/.test(svg);

        if (evenOdd && moveCount > 8) addCategory('evenodd-dense-subpaths', pattern.id);
        if (evenOdd && shapeCount > 1) addCategory('evenodd-multi-element', pattern.id);
        if (!evenOdd && pathCount === 1 && moveCount > 4) addCategory('single-path-compound', pattern.id);
        if (shapeCount > 8) addCategory('many-fill-elements', pattern.id);
        if (pattern.lines && pattern.fills) addCategory('mixed-line-fill', pattern.id);
      });

    return Array.from(
      new Set([
        'hero_autumn',
        'hero_bamboo',
        'hero_bank-note',
        'hero_bathroom-floor',
        'hero_dominos',
        ...categories.values(),
      ])
    );
  });

const capturePatternSourceFidelityDiagnostics = async (page, patternIds = null) =>
  page.evaluate((requestedIds) => {
    const parser = new DOMParser();
    const mergeTouchingChains = window.Vectura.AlgorithmRegistry._mergeTouchingChains;
    const ids = Array.isArray(requestedIds) && requestedIds.length
      ? requestedIds
      : Array.from(
        new Set([
          ...(window.Vectura.PATTERNS || [])
            .filter((pattern) => pattern.fills && /fill-rule="evenodd"/.test(pattern.svg || ''))
            .map((pattern) => pattern.id),
          'hero_bank-note',
        ])
      );

    const sourceContainsFactory = (meta) => {
      const doc = parser.parseFromString(meta.svg, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      const viewBox = svg?.getAttribute('viewBox');
      let dims = [
        0,
        0,
        parseFloat(svg?.getAttribute('width') || 100),
        parseFloat(svg?.getAttribute('height') || 100),
      ];
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length >= 4) dims = parts;
      }
      const [, , width, height] = dims;

      const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tmpSvg.setAttribute('width', width);
      tmpSvg.setAttribute('height', height);
      tmpSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      tmpSvg.style.position = 'absolute';
      tmpSvg.style.left = '-9999px';
      tmpSvg.style.top = '-9999px';
      tmpSvg.style.visibility = 'hidden';
      tmpSvg.innerHTML = svg?.innerHTML || '';
      document.body.appendChild(tmpSvg);

      const fillElements = [...tmpSvg.querySelectorAll('path, polygon, rect, circle, ellipse')].filter((el) => {
        let node = el;
        while (node && typeof node.getAttribute === 'function') {
          const fill = node.getAttribute('fill');
          if (fill !== null && fill !== '') return fill !== 'none';
          node = node.parentElement;
        }
        return false;
      });

      return {
        width,
        height,
        fillElements,
        cleanup: () => tmpSvg.remove(),
      };
    };

    const sourceContains = (source, x, y) => {
      const pt = typeof DOMPoint === 'function' ? new DOMPoint(x, y) : { x, y };
      return source.fillElements.some((el) => typeof el.isPointInFill === 'function' && el.isPointInFill(pt));
    };

    const normalizeGeneratedLoops = (paths = []) => {
      const merged = typeof mergeTouchingChains === 'function' ? mergeTouchingChains(paths) : paths;
      return (merged || [])
        .filter((path) => Array.isArray(path) && path.length >= 3)
        .map((path) => {
          const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
          const first = next[0];
          const last = next[next.length - 1];
          if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < 0.05) {
            next[next.length - 1] = { ...first };
          }
          return next;
        });
    };

    const generatedContains = (paths, x, y) => {
      let inside = false;
      for (const path of paths || []) {
        if (!Array.isArray(path) || path.length < 2) continue;
        for (let i = 0; i + 1 < path.length; i += 1) {
          const a = path[i];
          const b = path[i + 1];
          if ((a.y > y) === (b.y > y)) continue;
          const xCross = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
          if (xCross > x) inside = !inside;
        }
      }
      return inside;
    };

    const diagnostics = [];
    ids.forEach((id) => {
      const meta = (window.Vectura.PATTERNS || []).find((pattern) => pattern.id === id);
      const data = window.Vectura.AlgorithmRegistry.patternGetGroups(id);
      const paths = normalizeGeneratedLoops((data?.groups || []).flatMap((group) => group.paths || []));
      const source = sourceContainsFactory(meta);

      let mismatch = 0;
      let total = 0;
      const cols = 10;
      const rows = 10;
      for (let iy = 0; iy < rows; iy += 1) {
        for (let ix = 0; ix < cols; ix += 1) {
          const x = ((ix + 0.37) / cols) * source.width;
          const y = ((iy + 0.61) / rows) * source.height;
          const sourceValue = sourceContains(source, x, y);
          const generatedValue = generatedContains(paths, x, y);
          total += 1;
          if (sourceValue !== generatedValue) mismatch += 1;
        }
      }

      diagnostics.push({
        id,
        mismatch,
        total,
        pathCount: paths.length,
      });
      source.cleanup();
    });

    return diagnostics
      .filter((item) => item.mismatch > 0)
      .sort((a, b) => b.mismatch - a.mismatch);
  }, patternIds);

const captureAutumnGridSourceFidelityDiagnostics = async (page) =>
  page.evaluate(() => {
    const parser = new DOMParser();
    const mergeTouchingChains = window.Vectura.AlgorithmRegistry._mergeTouchingChains;
    const meta = (window.Vectura.PATTERNS || []).find((pattern) => pattern.id === 'hero_autumn');
    const doc = parser.parseFromString(meta.svg, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    const viewBox = svg?.getAttribute('viewBox');
    let dims = [
      0,
      0,
      parseFloat(svg?.getAttribute('width') || 100),
      parseFloat(svg?.getAttribute('height') || 100),
    ];
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length >= 4) dims = parts;
    }
    const [, , width, height] = dims;
    const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tmpSvg.setAttribute('width', width);
    tmpSvg.setAttribute('height', height);
    tmpSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    tmpSvg.style.position = 'absolute';
    tmpSvg.style.left = '-9999px';
    tmpSvg.style.top = '-9999px';
    tmpSvg.style.visibility = 'hidden';
    tmpSvg.innerHTML = svg?.innerHTML || '';
    document.body.appendChild(tmpSvg);
    const fillElements = [...tmpSvg.querySelectorAll('path, polygon, rect, circle, ellipse')].filter((el) => {
      let node = el;
      while (node && typeof node.getAttribute === 'function') {
        const fill = node.getAttribute('fill');
        if (fill !== null && fill !== '') return fill !== 'none';
        node = node.parentElement;
      }
      return false;
    });
    const sourceContains = (x, y) => {
      const localX = ((x % width) + width) % width;
      const localY = ((y % height) + height) % height;
      const pt = typeof DOMPoint === 'function' ? new DOMPoint(localX, localY) : { x: localX, y: localY };
      return fillElements.some((el) => typeof el.isPointInFill === 'function' && el.isPointInFill(pt));
    };

    const normalizeGeneratedLoops = (paths = []) => {
      const merged = typeof mergeTouchingChains === 'function' ? mergeTouchingChains(paths) : paths;
      return (merged || [])
        .filter((path) => Array.isArray(path) && path.length >= 3)
        .map((path) => {
          const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
          const first = next[0];
          const last = next[next.length - 1];
          if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < 0.05) {
            next[next.length - 1] = { ...first };
          }
          return next;
        });
    };
    const generatedContains = (paths, x, y) => {
      let inside = false;
      for (const path of paths || []) {
        if (!Array.isArray(path) || path.length < 2) continue;
        for (let i = 0; i + 1 < path.length; i += 1) {
          const a = path[i];
          const b = path[i + 1];
          if ((a.y > y) === (b.y > y)) continue;
          const xCross = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
          if (xCross > x) inside = !inside;
        }
      }
      return inside;
    };

    const app = window.app;
    app.engine.addLayer('pattern');
    const layer = app.engine.getActiveLayer();
    layer.params.patternId = 'hero_autumn';
    layer.params.tileMethod = 'grid';
    layer.params.removeSeams = true;
    layer.params.scale = 1;
    app.engine.generate(layer.id);
    const generatedPaths = normalizeGeneratedLoops(layer.paths || []);

    let mismatch = 0;
    let total = 0;
    const seamOffsets = [-0.75, -0.25, 0.25, 0.75];
    const cols = 24;
    for (let tx = 0; tx < 2; tx += 1) {
      for (let ix = 0; ix < cols; ix += 1) {
        const x = tx * width + ((ix + 0.37) / cols) * width;
        seamOffsets.forEach((offset) => {
          const y = height + offset;
          total += 1;
          if (sourceContains(x, y) !== generatedContains(generatedPaths, x, y)) mismatch += 1;
        });
      }
    }

    tmpSvg.remove();
    return { mismatch, total };
  });

test.describe('Vectura smoke interactions', () => {
  test('fill-built hero patterns do not retain swallowed subpaths in extracted boundaries', async ({ page }) => {
    await page.goto('/');

    const diagnostics = await page.evaluate(() => {
      const pointInPoly = window.Vectura.AlgorithmRegistry._polyContainsPoint;
      const centerPoint = (path = []) => {
        const sum = path.reduce(
          (acc, pt) => ({
            x: acc.x + pt.x,
            y: acc.y + pt.y,
          }),
          { x: 0, y: 0 }
        );
        const count = Math.max(1, path.length);
        return {
          x: sum.x / count,
          y: sum.y / count,
        };
      };

      const ids = ['hero_anchors-away', 'hero_dominos', 'hero_autumn', 'hero_bathroom-floor'];
      const output = {};
      ids.forEach((id) => {
        const data = window.Vectura.AlgorithmRegistry.patternGetGroups(id);
        const paths = (data?.groups || []).flatMap((group) => group.paths || []);
        const enclosedCount = paths.filter((path, index) => {
          const sample = centerPoint(path);
          return paths.some((other, otherIndex) =>
            otherIndex !== index
            && Array.isArray(other)
            && other.length >= 4
            && pointInPoly(sample, other)
          );
        }).length;
        output[id] = {
          pathCount: paths.length,
          enclosedCount,
          shortPaths: paths.filter((path) => (path?.length || 0) < 20).length,
        };
      });
      return output;
    });

    expect(diagnostics['hero_anchors-away'].enclosedCount).toBe(0);
    expect(diagnostics['hero_autumn'].enclosedCount).toBe(0);
    expect(diagnostics['hero_bathroom-floor'].enclosedCount).toBe(0);

    expect(diagnostics['hero_dominos'].shortPaths).toBeLessThan(40);
  });

  test('Autumn grid tiling stays source-faithful across the horizontal tile seam', async ({ page }) => {
    await page.goto('/');

    const diagnostics = await captureAutumnGridSourceFidelityDiagnostics(page);

    expect(diagnostics, JSON.stringify(diagnostics)).toEqual({ mismatch: 0, total: diagnostics.total });
  });

  test('representative source-fidelity coverage spans the expected compound-fill tile archetypes', async ({ page }) => {
    await page.goto('/');

    const representativeIds = await captureRepresentativePatternIds(page);

    expect(representativeIds).toEqual(expect.arrayContaining([
      'hero_autumn',
      'hero_bamboo',
      'hero_bank-note',
      'hero_bathroom-floor',
      'hero_dominos',
    ]));
    expect(representativeIds.length).toBeGreaterThanOrEqual(6);
  });

  test('representative compound fill hero patterns stay source-faithful to the original SVG tile silhouette', async ({ page }) => {
    await page.goto('/');

    const representativeIds = await captureRepresentativePatternIds(page);
    const diagnostics = await capturePatternSourceFidelityDiagnostics(page, representativeIds);

    expect(diagnostics, JSON.stringify(diagnostics.slice(0, 12), null, 2)).toEqual([]);
  });

  test('custom SVG tile import blocks save for unmatched seam crossings', async ({ page }) => {
    await page.goto('/');

    const diagnostics = await page.evaluate(() => {
      window.app.engine.addLayer('pattern');
      const layer = window.app.engine.getActiveLayer();
      window.app.ui.openPatternTileImportReview({
        fileName: 'invalid.svg',
        svgText: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="none" stroke="#000" d="M10 0L10 12"/></svg>',
        layer,
      });
      return {
        disabled: Boolean(window.app.ui.modal.bodyEl.querySelector('[data-pattern-import-save]')?.disabled),
        issueCount: window.app.ui.modal.bodyEl.querySelectorAll('[data-pattern-import-issues] > div').length,
      };
    });

    expect(diagnostics.disabled).toBe(true);
    expect(diagnostics.issueCount).toBeGreaterThan(0);
  });

  test('custom patterns round-trip through vectura payload serialization', async ({ page }) => {
    await page.goto('/');

    const diagnostics = await page.evaluate(() => {
      const app = window.app;
      app.engine.addLayer('pattern');
      const layer = app.engine.getActiveLayer();
      const saved = window.Vectura.PatternRegistry.saveCustomPattern({
        id: 'roundtrip-demo',
        name: 'Roundtrip Demo',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="#000" d="M0 0h10v10H0zM10 10h10v10H10z"/></svg>',
      });
      layer.params.patternId = saved.id;
      app.engine.generate(layer.id);
      const payload = app.ui._serializeVecturaPayload();
      app.ui._applyVecturaPayload(payload);
      const restoredPatternLayer = (app.engine.layers || []).find((entry) => entry.type === 'pattern' && entry.params?.patternId === saved.id);
      const pattern = window.Vectura.PatternRegistry.getPatternById(saved.id);
      return {
        hasPattern: Boolean(pattern),
        activePatternId: restoredPatternLayer?.params?.patternId || null,
        exportedCount: Array.isArray(payload.customPatterns) ? payload.customPatterns.length : 0,
      };
    });

    expect(diagnostics.hasPattern).toBe(true);
    expect(diagnostics.activePatternId).toBe('custom-roundtrip-demo');
    expect(diagnostics.exportedCount).toBeGreaterThan(0);
  });

  test('core interactions remain functional on desktop and touch tablet', async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('#generator-module')).toBeVisible();
    await expect(page.locator('#layer-list .layer-item').first()).toBeVisible();
    await expect
      .poll(async () => (await page.locator('#formula-display').innerText()).trim().length)
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await page.locator('#algo-desc').innerText()).trim().length)
      .toBeGreaterThan(0);

    const initialLayers = await page.locator('#layer-list .layer-item').count();
    await page.click('#btn-add-layer');
    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 1);

    const initialGeometry = await captureActiveLayerGeometry(page);
    const nextType = initialGeometry.type === 'topo' ? 'lissajous' : 'topo';
    await page.selectOption('#generator-module', nextType);
    await expect.poll(async () => (await captureActiveLayerGeometry(page)).type).toBe(nextType);
    await expect.poll(async () => (await captureActiveLayerGeometry(page)).signature).not.toBe(initialGeometry.signature);

    const switchedGeometry = await captureActiveLayerGeometry(page);
    expect(switchedGeometry.sourcePathsMaterialized).toBe(false);
    expect(switchedGeometry.formula.length).toBeGreaterThan(0);
    expect(switchedGeometry.formula).not.toBe(initialGeometry.formula);
    expect(switchedGeometry.about.length).toBeGreaterThan(0);
    expect(switchedGeometry.about).not.toBe(initialGeometry.about);

    await page.getByRole('button', { name: 'Randomize Params' }).click();

    const linesText = (await page.locator('#stat-lines').innerText()).trim();
    const lineCount = Number(linesText.replace(/[^0-9.-]/g, ''));
    expect(Number.isFinite(lineCount)).toBe(true);
    expect(lineCount).toBeGreaterThan(0);

    const canvas = page.locator('#main-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    if (testInfo.project.name.includes('tablet-touch')) {
      const startX = Math.floor(box.x + box.width * 0.4);
      const startY = Math.floor(box.y + box.height * 0.45);
      const endX = Math.floor(box.x + box.width * 0.62);
      const endY = Math.floor(box.y + box.height * 0.55);

      await page.dispatchEvent('#main-canvas', 'pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        clientX: startX,
        clientY: startY,
        buttons: 1,
      });
      await page.dispatchEvent('#main-canvas', 'pointermove', {
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        clientX: endX,
        clientY: endY,
        buttons: 1,
      });
      await page.dispatchEvent('#main-canvas', 'pointerup', {
        pointerType: 'touch',
        pointerId: 1,
        isPrimary: true,
        clientX: endX,
        clientY: endY,
        buttons: 0,
      });
    } else {
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
      await page.mouse.up();
    }

    await page.keyboard.press('Control+z');
    expect(pageErrors).toEqual([]);
  });

  test('auto-colorization reapplies across modes and continuous mode updates live', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await page.click('#auto-colorization-header');

    const layerCount = await page.locator('#layer-list .layer-item').count();
    for (let i = layerCount; i < 4; i += 1) {
      await page.click('#btn-add-layer');
    }

    const readPenAssignments = () =>
      page.evaluate(() =>
        (window.app?.engine?.layers || [])
          .filter((layer) => layer && !layer.isGroup)
          .map((layer) => layer.penId || null)
      );

    const enabledToggle = page.locator('#auto-colorization-enabled');
    const modeSelect = page.locator('#auto-colorization-mode');
    const applyBtn = page.locator('#auto-colorization-apply');

    if (await enabledToggle.isChecked()) {
      await enabledToggle.uncheck();
    }

    await modeSelect.selectOption('order');
    await applyBtn.click();
    const orderManual = await readPenAssignments();

    await modeSelect.selectOption('reverse');
    await applyBtn.click();
    const reverseManual = await readPenAssignments();
    expect(reverseManual).not.toEqual(orderManual);

    await enabledToggle.check();
    await modeSelect.selectOption('order');
    const orderContinuous = await readPenAssignments();

    await modeSelect.selectOption('reverse');
    await expect
      .poll(async () => JSON.stringify(await readPenAssignments()))
      .not.toBe(JSON.stringify(orderContinuous));

    expect(pageErrors).toEqual([]);
  });

  test('top menus open settings and help actions', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.getByRole('button', { name: 'File' }).click();
    await page.click('#btn-settings');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);

    await page.click('#btn-close-settings');
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);

    await page.getByRole('button', { name: 'Help' }).click();
    await page.click('#btn-help');
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('#modal-overlay .modal-title')).toHaveText(/Help Guide/);

    expect(pageErrors).toEqual([]);
  });

  test('document setup shortcut toggles and clear saved preferences removes persisted UI state', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
    await expect(page.locator('#set-document-units')).toBeVisible();
    await expect(page.locator('#set-show-document-dimensions')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);

    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);

    const cookieToggle = page.locator('#set-cookie-preferences');
    const showGuides = page.locator('#set-show-guides');

    await cookieToggle.check();
    await showGuides.uncheck();

    await expect
      .poll(async () => page.evaluate(() => document.cookie.includes('vectura_prefs=')))
      .toBe(true);

    await page.click('#btn-clear-preferences');
    await expect(cookieToggle).not.toBeChecked();
    await expect(showGuides).not.toBeChecked();

    await page.reload();
    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
    await expect(page.locator('#set-cookie-preferences')).not.toBeChecked();
    await expect(page.locator('#set-show-guides')).toBeChecked();

    expect(pageErrors).toEqual([]);
  });

  test('theme toggle flips UI theme, Pen 1, and document background in the live app shell', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const themeToggle = page.locator('#theme-toggle');
    await expect(themeToggle).toBeVisible();

    const initial = await page.evaluate(() => {
      const pen1 = (window.Vectura?.SETTINGS?.pens || []).find((pen) => pen.id === 'pen-1');
      const activeLayer = window.app?.engine?.getActiveLayer?.();
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      return {
        theme: window.Vectura?.SETTINGS?.uiTheme,
        pen1: pen1?.color || null,
        layerColor: activeLayer?.color || null,
        bgColor: window.Vectura?.SETTINGS?.bgColor,
        headerBg: styles.getPropertyValue('--color-panel').trim(),
      };
    });
    expect(initial.theme).toBe('dark');

    await themeToggle.click();

    await expect
      .poll(async () =>
        page.evaluate(() => ({
          theme: window.Vectura?.SETTINGS?.uiTheme,
          pen1: (window.Vectura?.SETTINGS?.pens || []).find((pen) => pen.id === 'pen-1')?.color || null,
          layerColor: window.app?.engine?.getActiveLayer?.()?.color || null,
          bgColor: window.Vectura?.SETTINGS?.bgColor,
          themeColor: document.querySelector('meta[name=\"theme-color\"]')?.getAttribute('content') || null,
        }))
      )
      .toEqual({
        theme: 'light',
        pen1: '#000000',
        layerColor: '#000000',
        bgColor: '#ffffff',
        themeColor: '#f5f5f5',
      });

    await expect(themeToggle).toHaveAttribute('aria-label', /dark theme/i);
    expect(pageErrors).toEqual([]);
  });

  test('export modal owns the default-on remove hidden geometry toggle', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.getByRole('button', { name: 'File' }).click();
    await page.click('#btn-export');
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('#export-modal-root')).toBeVisible();

    await expect(page.locator('#set-remove-hidden-geometry')).toHaveCount(0);
    await expect(page.locator('#settings-panel .optimization-card')).toHaveCount(0);

    const exportCard = page.locator('#export-modal-root .optimization-card').filter({ hasText: 'Export Settings' });
    await expect(exportCard).toHaveCount(1);

    const hiddenGeometryControl = exportCard.locator('.optimization-control').filter({ hasText: 'Remove Hidden Geometry' });
    await expect(hiddenGeometryControl).toHaveCount(1);

    const toggle = hiddenGeometryControl.locator('input[type="checkbox"]');
    const state = hiddenGeometryControl.locator('span').filter({ hasText: /ON|OFF/ });

    await expect(toggle).toBeChecked();
    await expect(state).toHaveText('ON');
    await expect
      .poll(async () => page.evaluate(() => window.Vectura.SETTINGS.removeHiddenGeometry))
      .toBe(true);

    await toggle.uncheck();
    await expect(state).toHaveText('OFF');
    await expect
      .poll(async () => page.evaluate(() => window.Vectura.SETTINGS.removeHiddenGeometry))
      .toBe(false);

    await toggle.check();
    await expect(state).toHaveText('ON');
    await expect
      .poll(async () => page.evaluate(() => window.Vectura.SETTINGS.removeHiddenGeometry))
      .toBe(true);

    expect(pageErrors).toEqual([]);
  });

  test('line sort works across multiple selected layers', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const result = await page.evaluate(() => {
      const { Layer, SETTINGS } = window.Vectura;
      const app = window.app;
      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const buildLayer = (id, name, x1, x2) => {
        const layer = new Layer(id, 'expanded', name);
        layer.params.curves = false;
        layer.sourcePaths = [[
          { x: x1, y: 42 },
          { x: x2, y: 42 },
        ]];
        layer.optimization = {
          bypassAll: false,
          steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'greedy', direction: 'horizontal', grouping: 'combined' }],
        };
        return layer;
      };

      const left = buildLayer('linesort-left', 'Left', 20, 40);
      const right = buildLayer('linesort-right', 'Right', 180, 200);

      engine.layers.push(left, right);
      engine.activeLayerId = left.id;
      engine.generate(left.id);
      engine.generate(right.id);
      engine.computeAllDisplayGeometry();

      app.renderer.setSelection([left.id, right.id], right.id);
      SETTINGS.optimizationScope = 'selected';
      SETTINGS.optimizationPreview = 'overlay';
      app.ui.buildControls();
      app.ui.optimizeTargetsForCurrentScope({ includePlotterOptimize: true });
      app.render();

      return {
        orders: engine.layers.map((layer) => layer.optimizedPaths?.[0]?.meta?.lineSortOrder ?? null),
        targetIds: Array.from(app.ui.getOptimizationTargetIds()),
        rendererTargetIds: Array.from(app.renderer.getOptimizationTargetIds()),
        legendVisible: !document.getElementById('optimization-overlay-legend')?.classList.contains('hidden'),
        legendGradient: document.getElementById('optimization-overlay-legend-gradient')?.style.background || '',
      };
    });

    expect(result.orders).toEqual([0, 1]);
    expect(result.targetIds).toEqual(['linesort-left', 'linesort-right']);
    expect(result.rendererTargetIds).toEqual(['linesort-left', 'linesort-right']);
    expect(result.legendVisible).toBe(true);
    expect(result.legendGradient).toContain('linear-gradient');
    expect(pageErrors).toEqual([]);
  });

  test('export modal opens as a large preview-first workspace and supports line-sort preview controls', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await page.getByRole('button', { name: 'File' }).click();
    await page.click('#btn-export');
    await expect(page.locator('#export-modal-root')).toBeVisible();

    const modalBox = await page.locator('#modal-overlay .modal-card').boundingBox();
    const viewport = page.viewportSize();
    expect(modalBox.width).toBeGreaterThanOrEqual(viewport.width * 0.8 - 2);
    expect(modalBox.height).toBeGreaterThanOrEqual(viewport.height * 0.8 - 2);

    const previewSelect = page.locator('#export-preview-mode');
    await previewSelect.selectOption('off');

    const lineSortCard = page.locator('#export-modal-root .optimization-card').filter({ hasText: 'Line Sort' });
    const applyToggle = lineSortCard.locator('.optimization-card-actions input[type="checkbox"]').first();
    await expect(applyToggle).toBeChecked();
    await applyToggle.uncheck();
    await expect(applyToggle).not.toBeChecked();
    await applyToggle.check();

    await expect(previewSelect).toHaveValue('overlay');
    await expect(page.locator('#export-preview-legend')).not.toHaveClass(/hidden/);

    const before = await page.evaluate(() => window.app.ui.exportModalState.view.scale);
    await page.locator('#export-preview-canvas-wrap').hover();
    await page.mouse.wheel(0, -400);
    await expect
      .poll(async () => page.evaluate(() => window.app.ui.exportModalState.view.scale))
      .toBeGreaterThan(before);
    expect(pageErrors).toEqual([]);
  });

  test('optimized export preserves hidden geometry when remove hidden geometry is off', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('tablet-touch'), 'Desktop export assertion only.');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const svg = await page.evaluate(async () => {
      const { app, Vectura } = window;
      const { Layer, SETTINGS } = Vectura;

      const createCirclePath = (cx, cy, r, segments = 48) => {
        const points = [];
        for (let i = 0; i <= segments; i += 1) {
          const t = (i / segments) * Math.PI * 2;
          points.push({
            x: cx + Math.cos(t) * r,
            y: cy + Math.sin(t) * r,
          });
        }
        points.meta = { kind: 'circle', cx, cy, r };
        return points;
      };

      const maskParent = new Layer('smoke-export-mask-parent', 'expanded', 'Mask Parent');
      maskParent.paths = [[
        { x: 70, y: 50 },
        { x: 130, y: 50 },
        { x: 130, y: 130 },
        { x: 70, y: 130 },
        { x: 70, y: 50 },
      ]];
      maskParent.mask.enabled = true;
      maskParent.penId = 'p1';
      maskParent.strokeWidth = 0.4;
      maskParent.lineCap = 'round';

      const child = new Layer('smoke-export-mask-child', 'expanded', 'Child Circle');
      child.parentId = maskParent.id;
      child.paths = [createCirclePath(100, 90, 48)];
      child.penId = 'p1';
      child.strokeWidth = 0.4;
      child.lineCap = 'round';
      child.optimization = {
        bypassAll: false,
        steps: [{ id: 'linesimplify', enabled: true, bypass: false, tolerance: 0.5, mode: 'polyline' }],
      };

      app.engine.layers = [maskParent, child];
      app.engine.computeAllDisplayGeometry();

      SETTINGS.margin = 10;
      SETTINGS.cropExports = false;
      SETTINGS.truncate = false;
      SETTINGS.removeHiddenGeometry = false;
      SETTINGS.optimizationExport = true;
      SETTINGS.plotterOptimize = 0;
      SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.4 }];

      let capturedBlob = null;
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalCreateElement = document.createElement.bind(document);

      window.URL.createObjectURL = (blob) => {
        capturedBlob = blob;
        return 'blob:playwright-export-test';
      };
      document.createElement = (tagName, options) => {
        const el = originalCreateElement(tagName, options);
        if (`${tagName}`.toLowerCase() === 'a') el.click = () => {};
        return el;
      };

      try {
        app.ui.exportSVG();
        return capturedBlob ? await capturedBlob.text() : '';
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
        document.createElement = originalCreateElement;
      }
    });

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#');
    expect(svg).toContain('<circle ');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).not.toContain('stroke-linecap="butt"');
    expect(pageErrors).toEqual([]);
  });

  test('insert menu creates a mirror modifier, reparents the current selection, and opens modifier controls', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const initialLayers = await page.locator('#layer-list .layer-item').count();
    await page.getByRole('button', { name: 'Insert' }).click();
    await page.click('#btn-insert-mirror-modifier');

    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 1);
    await expect(page.locator('#left-section-primary-title')).toHaveText('Modifier');
    await expect(page.locator('#left-section-secondary-title')).toHaveText('Modifier Configuration');
    await expect(page.locator('#generator-module')).toHaveValue('mirror');
    await expect(page.getByText('Mirror Stack')).toBeVisible();

    const modifierState = await page.evaluate(() => {
      const app = window.app;
      const modifier = app.engine.getActiveLayer();
      const child = app.engine.layers.find((layer) => !layer.isGroup && layer.parentId === modifier.id);
      return {
        modifierIsContainer: modifier?.containerRole === 'modifier',
        childParentMatches: child?.parentId === modifier?.id,
        childPathCount: child?.paths?.length || 0,
        childEffectivePathCount: child?.effectivePaths?.length || 0,
      };
    });

    expect(modifierState.modifierIsContainer).toBe(true);
    expect(modifierState.childParentMatches).toBe(true);
    expect(modifierState.childEffectivePathCount).toBeGreaterThan(modifierState.childPathCount);

    expect(pageErrors).toEqual([]);
  });

  test('selected modifiers add remembered drawable children and preserve children when deleted', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.selectOption('#generator-module', 'rings');
    await page.getByRole('button', { name: 'Insert' }).click();
    await page.click('#btn-insert-mirror-modifier');

    await page.click('#btn-add-layer');
    await expect(page.locator('#left-section-primary-title')).toHaveText('Algorithm');
    await expect(page.locator('#generator-module')).toHaveValue('rings');

    const addState = await page.evaluate(() => {
      const app = window.app;
      const child = app.engine.getActiveLayer();
      const parent = app.engine.layers.find((layer) => layer.id === child.parentId);
      return {
        childType: child?.type || null,
        parentIsModifier: parent?.containerRole === 'modifier',
      };
    });

    expect(addState.childType).toBe('rings');
    expect(addState.parentIsModifier).toBe(true);

    await page.evaluate(() => {
      const app = window.app;
      const modifier = app.engine.layers.find((layer) => layer.containerRole === 'modifier');
      app.renderer.setSelection([modifier.id], modifier.id);
      app.engine.activeLayerId = modifier.id;
      app.ui.renderLayers();
      app.ui.buildControls();
    });

    await page.keyboard.press('Delete');

    const deleteState = await page.evaluate(() => {
      const app = window.app;
      const modifier = app.engine.layers.find((layer) => layer.containerRole === 'modifier');
      const orphanedChild = app.engine.layers.find((layer) => !layer.isGroup && layer.parentId == null && layer.type === 'rings');
      return {
        modifierExists: Boolean(modifier),
        orphanedChildExists: Boolean(orphanedChild),
      };
    });

    expect(deleteState.modifierExists).toBe(false);
    expect(deleteState.orphanedChildExists).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('shape tool shortcuts create ovals and configurable polygons', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('tablet-touch'), 'Tablet emulation does not reliably synthesize shape-drag mouse input.');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const canvas = page.locator('#main-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const initialLayers = await page.locator('#layer-list .layer-item').count();

    await page.evaluate(() => window.app.ui.setActiveTool('shape-oval'));
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.52);
    await page.mouse.up();

    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 1);

    const circleMeta = await page.evaluate(() => {
      const layer = window.app.engine.getActiveLayer();
      return layer?.sourcePaths?.[0]?.meta?.shape || null;
    });
    expect(circleMeta?.type).toBe('oval');
    expect(Math.abs((circleMeta?.rx || 0) - (circleMeta?.ry || 0))).toBeGreaterThan(0.01);

    await page.evaluate(() => window.app.ui.setActiveTool('shape-polygon'));
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.58);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.mouse.up();

    await expect(page.locator('#layer-list .layer-item')).toHaveCount(initialLayers + 2);

    const polygonMeta = await page.evaluate(() => {
      const layer = window.app.engine.getActiveLayer();
      return layer?.sourcePaths?.[0]?.meta?.shape || null;
    });
    expect(polygonMeta?.type).toBe('polygon');
    expect(polygonMeta?.sides).toBe(8);

    expect(pageErrors).toEqual([]);
  });

  test('mask-parent drags preview dimmed descendants until mouse release', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('tablet-touch'), 'Tablet emulation does not reliably synthesize transform drags.');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;
      SETTINGS.globalLayerCount = 0;

      const engine = app.engine;
      engine.layers = [];

      const circlePath = [];
      const cx = 120;
      const cy = 110;
      const r = 50;
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        circlePath.push({
          x: cx + Math.cos(theta) * r,
          y: cy + Math.sin(theta) * r,
        });
      }
      circlePath.meta = {
        kind: 'circle',
        cx,
        cy,
        r,
        shape: {
          type: 'oval',
          cx,
          cy,
          rx: r,
          ry: r,
          cornerRadii: [],
        },
      };

      const maskParent = new Layer('drag-preview-mask-parent', 'expanded', 'Preview Mask');
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;

      const child = new Layer('drag-preview-mask-child', 'expanded', 'Preview Child');
      child.parentId = maskParent.id;
      child.sourcePaths = [[
        { x: 20, y: 110 },
        { x: 220, y: 110 },
      ]];
      child.strokeWidth = 2.2;

      engine.layers.push(maskParent, child);
      engine.activeLayerId = maskParent.id;
      engine.generate(maskParent.id);
      engine.generate(child.id);
      app.renderer.setSelection([maskParent.id], maskParent.id);
      app.ui.renderLayers();
      app.ui.buildControls();
      app.render();
    });

    const dragPoints = await page.evaluate(() => {
      const canvas = document.getElementById('main-canvas');
      const rect = canvas.getBoundingClientRect();
      const renderer = window.app.renderer;
      const start = renderer.worldToScreen(120, 110);
      const end = renderer.worldToScreen(160, 110);
      return {
        start: { x: rect.left + start.x, y: rect.top + start.y },
        end: { x: rect.left + end.x, y: rect.top + end.y },
      };
    });

    const readBrightness = (world) =>
      page.evaluate(({ x, y }) => {
        const canvas = document.getElementById('main-canvas');
        const ctx = canvas.getContext('2d');
        const renderer = window.app.renderer;
        const pt = renderer.worldToScreen(x, y);
        const dpr = window.devicePixelRatio || 1;
        const pixel = ctx.getImageData(Math.round(pt.x * dpr), Math.round(pt.y * dpr), 1, 1).data;
        return (pixel[0] + pixel[1] + pixel[2]) / 3;
      }, world);

    const outsideBefore = await readBrightness({ x: 40, y: 110 });

    await page.mouse.move(dragPoints.start.x, dragPoints.start.y);
    await page.mouse.down();
    await page.mouse.move(dragPoints.end.x, dragPoints.end.y);

    await expect
      .poll(async () => page.evaluate(() => window.app.renderer.maskPreview?.maskLayerId || null))
      .toBe('drag-preview-mask-parent');

    const previewState = await page.evaluate(() => ({
      active: Boolean(window.app.renderer.maskPreview),
      descendants: Array.from(window.app.renderer.maskPreview?.descendantIds || []),
    }));
    const outsideDuring = await readBrightness({ x: 40, y: 110 });
    const insideDuring = await readBrightness({ x: 160, y: 110 });

    expect(previewState.active).toBe(true);
    expect(previewState.descendants).toContain('drag-preview-mask-child');
    expect(outsideDuring).toBeGreaterThan(outsideBefore + 8);
    expect(insideDuring).toBeGreaterThan(outsideDuring);

    await page.mouse.up();

    await expect
      .poll(async () => page.evaluate(() => window.app.renderer.maskPreview === null))
      .toBe(true);

    const outsideAfter = await readBrightness({ x: 40, y: 110 });
    expect(outsideAfter).toBeLessThan(outsideDuring - 8);
    expect(pageErrors).toEqual([]);
  });

  test('shape reticle cursor appears for shape tools but selection restores normal cursor behavior', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('tablet-touch'), 'Tablet emulation does not reliably synthesize cursor hover states.');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    for (const tool of ['shape-rect', 'shape-oval', 'shape-polygon']) {
      await page.evaluate((nextTool) => window.app.ui.setActiveTool(nextTool), tool);
      await expect
        .poll(async () => page.locator('#main-canvas').evaluate((canvas) => canvas.dataset.cursorMode || ''))
        .toBe('shape-reticle');
    }

    const canvas = page.locator('#main-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const start = { x: box.x + box.width * 0.28, y: box.y + box.height * 0.34 };
    const end = { x: box.x + box.width * 0.38, y: box.y + box.height * 0.47 };
    const worldStart = await page.evaluate(({ x, y }) => {
      const rect = document.getElementById('main-canvas').getBoundingClientRect();
      return window.app.renderer.screenToWorld(x - rect.left, y - rect.top);
    }, start);

    await page.evaluate(() => window.app.ui.setActiveTool('shape-rect'));
    await page.keyboard.down('Alt');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
    await page.keyboard.up('Alt');

    const rectMeta = await page.evaluate(() => window.app.engine.getActiveLayer()?.sourcePaths?.[0]?.meta?.shape || null);
    expect(rectMeta?.type).toBe('rect');
    expect(((rectMeta?.x1 || 0) + (rectMeta?.x2 || 0)) / 2).toBeCloseTo(worldStart.x, 1);
    expect(((rectMeta?.y1 || 0) + (rectMeta?.y2 || 0)) / 2).toBeCloseTo(worldStart.y, 1);

    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    await expect
      .poll(async () => page.locator('#main-canvas').evaluate((canvasEl) => canvasEl.dataset.cursorMode || ''))
      .toBe('crosshair');

    const rotatePoint = await page.evaluate(() => {
      const renderer = window.app.renderer;
      const layer = window.app.engine.getActiveLayer();
      const bounds = renderer.getSelectionBounds([layer]);
      const rotate = renderer.getRotateHandlePoint(bounds);
      const screen = renderer.worldToScreen(rotate.x, rotate.y);
      const rect = document.getElementById('main-canvas').getBoundingClientRect();
      return {
        x: rect.left + screen.x,
        y: rect.top + screen.y,
      };
    });

    await page.mouse.move(rotatePoint.x, rotatePoint.y);
    await expect
      .poll(async () => page.locator('#main-canvas').evaluate((canvasEl) => canvasEl.dataset.cursorMode || ''))
      .toBe('grab');

    expect(pageErrors).toEqual([]);
  });

  test('selection cursor resets after creating a circle mask parent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('tablet-touch'), 'Tablet emulation does not reliably synthesize cursor hover states.');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const canvas = page.locator('#main-canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const start = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.34 };
    const end = { x: box.x + box.width * 0.56, y: box.y + box.height * 0.50 };

    await page.evaluate(() => window.app.ui.setActiveTool('shape-oval'));
    await expect
      .poll(async () => page.locator('#main-canvas').evaluate((canvasEl) => canvasEl.dataset.cursorMode || ''))
      .toBe('shape-reticle');

    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await page.evaluate(() => {
      const layer = window.app.engine.getActiveLayer();
      layer.mask.enabled = true;
      window.app.ui.renderLayers();
      window.app.render();
    });

    await page.evaluate(() => window.app.ui.setActiveTool('select'));
    await expect
      .poll(async () => page.locator('#main-canvas').evaluate((canvasEl) => canvasEl.dataset.cursorMode || ''))
      .toBe('crosshair');

    await page.mouse.move(start.x, start.y);
    await expect(page.locator('#main-canvas').evaluate((canvasEl) => canvasEl.dataset.cursorMode || '')).resolves.not.toBe('shape-reticle');

    const rotatePoint = await page.evaluate(() => {
      const renderer = window.app.renderer;
      const layer = window.app.engine.getActiveLayer();
      const bounds = renderer.getSelectionBounds([layer]);
      const rotate = renderer.getRotateHandlePoint(bounds);
      const screen = renderer.worldToScreen(rotate.x, rotate.y);
      const rect = document.getElementById('main-canvas').getBoundingClientRect();
      return {
        x: rect.left + screen.x,
        y: rect.top + screen.y,
      };
    });

    await page.mouse.move(rotatePoint.x, rotatePoint.y);
    await expect
      .poll(async () => page.locator('#main-canvas').evaluate((canvasEl) => canvasEl.dataset.cursorMode || ''))
      .toBe('grab');

    expect(pageErrors).toEqual([]);
  });

  test('circular mask parents clip descendant geometry to the visible silhouette', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const maskState = await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;

      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const circlePath = [];
      const cx = 120;
      const cy = 110;
      const r = 74;
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        circlePath.push({
          x: cx + Math.cos(theta) * r,
          y: cy + Math.sin(theta) * r,
        });
      }
      circlePath.meta = {
        kind: 'circle',
        cx,
        cy,
        r,
        shape: {
          type: 'oval',
          cx,
          cy,
          rx: r,
          ry: r,
          cornerRadii: [],
        },
      };

      const maskParent = new Layer('mask-parent-oval', 'expanded', 'Oval Mask');
      maskParent.params.seed = 0;
      maskParent.params.posX = 0;
      maskParent.params.posY = 0;
      maskParent.params.scaleX = 1;
      maskParent.params.scaleY = 1;
      maskParent.params.rotation = 0;
      maskParent.params.curves = false;
      maskParent.params.smoothing = 0;
      maskParent.params.simplify = 0;
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;

      const child = new Layer('masked-child-wavetable', 'wavetable', 'Wavetable 01');
      child.parentId = maskParent.id;
      child.params.lineStructure = 'horizontal';
      child.params.lines = 44;
      child.params.gap = 3.2;
      child.params.noises = [
        {
          ...(child.params.noises?.[0] || {}),
          enabled: true,
          type: 'simplex',
          amplitude: 12,
          zoom: 0.014,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 17,
        },
      ];

      engine.layers.push(maskParent, child);
      engine.activeLayerId = child.id;
      engine.generate(maskParent.id);
      engine.generate(child.id);
      engine.computeAllDisplayGeometry();
      app.renderer.setSelection([], null);
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();

      const flatten = (paths) =>
        (paths || []).flatMap((path) =>
          Array.isArray(path)
            ? path
                .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
                .map((pt) => ({ x: pt.x, y: pt.y }))
            : []
        );
      const isOutsideCircle = (pt, epsilon = 0.6) => Math.hypot(pt.x - cx, pt.y - cy) > r + epsilon;

      const rawPoints = flatten(child.paths);
      const displayPoints = flatten(child.displayPaths);
      const rawOutsideCount = rawPoints.filter((pt) => isOutsideCircle(pt, 1.2)).length;
      const displayOutsideCount = displayPoints.filter((pt) => isOutsideCircle(pt)).length;
      const parentRow = document.querySelector('[data-layer-id="mask-parent-oval"]');
      const childRow = document.querySelector('[data-layer-id="masked-child-wavetable"]');

      return {
        rawPointCount: rawPoints.length,
        displayPointCount: displayPoints.length,
        rawOutsideCount,
        displayOutsideCount,
        childSegmentCount: child.displayPaths?.length || 0,
        maskEnabled: Boolean(maskParent.mask?.enabled),
        parentStillVisible: Boolean(maskParent.paths?.length),
        childIndented: parentRow && childRow
          ? parseFloat(window.getComputedStyle(childRow).marginLeft || '0') > parseFloat(window.getComputedStyle(parentRow).marginLeft || '0')
          : false,
      };
    });

    expect(maskState.maskEnabled).toBe(true);
    expect(maskState.parentStillVisible).toBe(true);
    expect(maskState.rawPointCount).toBeGreaterThan(0);
    expect(maskState.displayPointCount).toBeGreaterThan(0);
    expect(maskState.rawOutsideCount).toBeGreaterThan(0);
    expect(maskState.displayOutsideCount).toBe(0);
    expect(maskState.childSegmentCount).toBeGreaterThan(0);
    expect(maskState.childIndented).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('editing a circle mask parent updates descendant clipping to the edited outline', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    const state = await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;

      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const cx = 120;
      const cy = 110;
      const r = 74;
      const circlePath = [];
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        circlePath.push({
          x: cx + Math.cos(theta) * r,
          y: cy + Math.sin(theta) * r,
        });
      }
      circlePath.meta = {
        kind: 'circle',
        cx,
        cy,
        r,
        shape: {
          type: 'oval',
          cx,
          cy,
          rx: r,
          ry: r,
          cornerRadii: [],
        },
      };

      const maskParent = new Layer('mask-parent-circle-edit', 'expanded', 'Circle Mask');
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;
      maskParent.params.smoothing = 0;
      maskParent.params.simplify = 0;

      const child = new Layer('masked-child-line-edit', 'expanded', 'Masked Line');
      child.parentId = maskParent.id;
      child.paths = [[
        { x: 20, y: 110 },
        { x: 220, y: 110 },
      ]];

      engine.layers.push(maskParent, child);
      engine.activeLayerId = maskParent.id;
      engine.generate(maskParent.id);
      engine.computeAllDisplayGeometry();
      app.renderer.setSelection([maskParent.id], maskParent.id);
      app.ui.renderLayers();
      app.ui.buildControls();
      app.render();

      const beforeStartX = child.displayPaths?.[0]?.[0]?.x ?? null;
      const selection = app.renderer.setDirectSelection(maskParent, 0);
      const leftmostIndex = selection.anchors.reduce(
        (best, anchor, index, anchors) => (anchor.x < anchors[best].x ? index : best),
        0
      );
      selection.anchors[leftmostIndex].x += 25;
      app.renderer.applyDirectPath();
      app.ui.renderLayers();
      app.render();

      return {
        beforeStartX,
        afterStartX: child.displayPaths?.[0]?.[0]?.x ?? null,
      };
    });

    expect(state.beforeStartX).not.toBeNull();
    expect(state.afterStartX).not.toBeNull();
    expect(state.afterStartX).toBeGreaterThan(state.beforeStartX + 10);
    expect(pageErrors).toEqual([]);
  });

  test('mask editor can hide the mask parent artwork while keeping descendant clipping active', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');

    await page.evaluate(() => {
      const app = window.app;
      const { Layer, SETTINGS } = window.Vectura;
      SETTINGS.aboutVisible = false;

      const engine = app.engine;
      engine.layers = [];
      SETTINGS.globalLayerCount = 0;

      const circlePath = [];
      const cx = 120;
      const cy = 110;
      const r = 74;
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        circlePath.push({
          x: cx + Math.cos(theta) * r,
          y: cy + Math.sin(theta) * r,
        });
      }
      circlePath.meta = {
        kind: 'circle',
        cx,
        cy,
        r,
        shape: {
          type: 'oval',
          cx,
          cy,
          rx: r,
          ry: r,
          cornerRadii: [],
        },
      };

      const maskParent = new Layer('mask-parent-hidden-ui', 'expanded', 'Hidden Mask');
      maskParent.sourcePaths = [circlePath];
      maskParent.mask.enabled = true;

      const child = new Layer('masked-child-hidden-ui', 'wavetable', 'Masked Child');
      child.parentId = maskParent.id;
      child.params.lineStructure = 'horizontal';
      child.params.lines = 44;
      child.params.gap = 3.2;
      child.params.noises = [
        {
          ...(child.params.noises?.[0] || {}),
          enabled: true,
          type: 'simplex',
          amplitude: 12,
          zoom: 0.014,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 17,
        },
      ];

      engine.layers.push(maskParent, child);
      engine.activeLayerId = child.id;
      engine.generate(maskParent.id);
      engine.generate(child.id);
      engine.computeAllDisplayGeometry();
      app.ui.renderLayers();
      app.ui.buildControls();
      app.ui.updateFormula();
      app.render();
      app.updateStats();
    });

    await page.locator('[data-layer-id="mask-parent-hidden-ui"] .layer-mask-trigger').click();
    await page.getByLabel('Hide Mask Layer').check();

    const state = await page.evaluate(() => {
      const app = window.app;
      const parent = app.engine.layers.find((layer) => layer.id === 'mask-parent-hidden-ui');
      const child = app.engine.layers.find((layer) => layer.id === 'masked-child-hidden-ui');
      const cx = 120;
      const cy = 110;
      const r = 74;
      const displayPoints = (child.displayPaths || [])
        .flatMap((path) => (Array.isArray(path) ? path : []))
        .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
      const outsideCount = displayPoints.filter((pt) => Math.hypot(pt.x - cx, pt.y - cy) > r + 0.6).length;
      return {
        hideLayer: Boolean(parent.mask?.hideLayer),
        parentRenderableCount: app.engine.getRenderablePaths(parent).length,
        childOutsideCount: outsideCount,
        badgeText: document.querySelector('[data-layer-id="mask-parent-hidden-ui"] .layer-mini-badge')?.textContent?.trim() || '',
      };
    });

    expect(state.hideLayer).toBe(true);
    expect(state.parentRenderableCount).toBe(0);
    expect(state.childOutsideCount).toBe(0);
    expect(state.badgeText).toContain('MASK HIDDEN');
    expect(pageErrors).toEqual([]);
  });
});

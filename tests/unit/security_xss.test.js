const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const loadSanitizerInJsdom = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const ctx = dom.getInternalVMContext();
  const code = fs.readFileSync(path.join(ROOT, 'src/core/svg-sanitize.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'svg-sanitize.js' });
  return { dom, sanitize: dom.window.Vectura.SvgSanitize.sanitize };
};

describe('Security DOM sinks', () => {
  test('textContent treats untrusted filename text as plain content', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;
    const payload = '<img src=x onerror=alert(1)>.jpg';

    const nameEl = document.createElement('div');
    nameEl.className = 'noise-image-name';
    nameEl.textContent = payload;

    expect(nameEl.textContent).toBe(payload);
    expect(nameEl.innerHTML).not.toContain('<img');
    expect(nameEl.querySelector('img')).toBeNull();
  });

  test('img.src keeps malicious preview text inside src attribute', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;
    const payload = '\"><img src=x onerror=alert(1)>';

    const img = document.createElement('img');
    img.src = payload;

    const wrap = document.createElement('div');
    wrap.appendChild(img);

    expect(wrap.querySelectorAll('img').length).toBe(1);
    expect(img.getAttribute('onerror')).toBeNull();
    expect(wrap.querySelector('[onerror]')).toBeNull();
  });
});

describe('SvgSanitize.sanitize', () => {
  let env;

  beforeAll(() => {
    env = loadSanitizerInJsdom();
  });

  afterAll(() => {
    env.dom.window.close();
  });

  test('exposes Vectura.SvgSanitize.sanitize', () => {
    expect(typeof env.sanitize).toBe('function');
  });

  test('strips on* attributes from <image onerror>', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<image href="x" onerror="alert(1)" width="10" height="10"/></svg>';
    const out = env.sanitize(input);
    expect(out).not.toMatch(/onerror/i);
    // Element should still exist (only the attribute is stripped).
    expect(out).toMatch(/<image/i);
    // Mount it and verify no onerror attribute under jsdom either.
    const doc = new env.dom.window.DOMParser().parseFromString(out, 'image/svg+xml');
    const imageEl = doc.querySelector('image');
    expect(imageEl).not.toBeNull();
    expect(imageEl.getAttribute('onerror')).toBeNull();
  });

  test('removes <script> elements entirely', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned = true;</script><rect width="1" height="1"/></svg>';
    const out = env.sanitize(input);
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/<rect/i);
    // Mount under jsdom and verify no script side effect.
    const sandbox = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    sandbox.window.document.body.innerHTML = out;
    expect(sandbox.window.__pwned).toBeUndefined();
    sandbox.window.close();
  });

  test('removes <foreignObject> elements entirely', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject width="100" height="100">' +
      '<body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(2)"/></body>' +
      '</foreignObject>' +
      '<rect width="1" height="1"/></svg>';
    const out = env.sanitize(input);
    expect(out).not.toMatch(/<foreignObject/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).toMatch(/<rect/i);
  });

  test('strips onbegin from <animate> while keeping the element', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1s" onbegin="alert(3)"/></rect>' +
      '</svg>';
    const out = env.sanitize(input);
    expect(out).not.toMatch(/onbegin/i);
    expect(out).toMatch(/<animate/i);
  });

  test('rewrites <a href="javascript:..."> to "#"', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<a href="javascript:alert(4)" xlink:href="JavaScript:alert(5)"><rect width="1" height="1"/></a>' +
      '</svg>';
    const out = env.sanitize(input);
    expect(out).not.toMatch(/javascript:/i);
    const doc = new env.dom.window.DOMParser().parseFromString(out, 'image/svg+xml');
    const a = doc.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('#');
    // xlink:href may be retained namespaced; check both lookup paths.
    const xlink = a.getAttribute('xlink:href') || a.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    expect(xlink).toBe('#');
  });

  test('returns empty <svg/> shell on parse error / empty input', () => {
    expect(env.sanitize('')).toMatch(/<svg/);
    expect(env.sanitize(null)).toMatch(/<svg/);
    // Bare garbage that is not an svg root should not pass through verbatim.
    const out = env.sanitize('<<not-svg>>');
    expect(out).toMatch(/<svg/);
    expect(out).not.toContain('not-svg');
  });

  test('tolerates leading whitespace in javascript: hrefs', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<a href="   javascript:alert(6)"><rect width="1" height="1"/></a></svg>';
    const out = env.sanitize(input);
    expect(out).not.toMatch(/javascript:/i);
  });
});

describe('Pattern import path uses SvgSanitize', () => {
  test('ui-pattern-designer routes svgText through Vectura.SvgSanitize.sanitize', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/ui/ui-pattern-designer.js'), 'utf8');
    expect(src).toMatch(/Vectura\?\.SvgSanitize\?\.sanitize/);
    // The draftMeta.svg field must read from the sanitized variable, not raw svgText.
    expect(src).toMatch(/svg:\s*safeSvg/);
  });

  test('ui-file-io routes parseSvgToLayerGroups input through Vectura.SvgSanitize.sanitize', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/ui/ui-file-io.js'), 'utf8');
    expect(src).toMatch(/Vectura\?\.SvgSanitize\?\.sanitize/);
    // Inline regex strip should be gone now that sanitization happens centrally.
    expect(src).not.toMatch(/stripEventHandlers/);
  });

  test('index.html loads svg-sanitize.js before pattern.js / ui consumers', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const sanitizeIdx = html.indexOf('src/core/svg-sanitize.js');
    const patternIdx = html.indexOf('src/core/algorithms/pattern.js');
    const designerIdx = html.indexOf('src/ui/ui-pattern-designer.js');
    const fileIoIdx = html.indexOf('src/ui/ui-file-io.js');
    expect(sanitizeIdx).toBeGreaterThan(0);
    expect(sanitizeIdx).toBeLessThan(patternIdx);
    expect(sanitizeIdx).toBeLessThan(designerIdx);
    expect(sanitizeIdx).toBeLessThan(fileIoIdx);
  });
});

describe('Pattern.js silent catches now warn', () => {
  test('pattern.js catch blocks emit console.warn with [Pattern] prefix', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/core/algorithms/pattern.js'), 'utf8');
    // No more silent swallows of the form `} catch (err) {}` or `} catch (_) {}`.
    expect(src).not.toMatch(/catch\s*\(\s*_\s*\)\s*\{\s*\}/);
    expect(src).not.toMatch(/catch\s*\(\s*err\s*\)\s*\{\s*\}/);
    // Must contain at least two console.warn calls labelled with [Pattern].
    const warnMatches = src.match(/console\.warn\(['"]\[Pattern\][^'"]*['"]/g) || [];
    expect(warnMatches.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Bugs-1 (HIGH) — XSS via .vectura pen records
// ---------------------------------------------------------------------------
// The layer panel's pen-assignment menu interpolated pen.id / pen.color /
// pen.width into innerHTML without escaping. A malicious `.vectura` file
// containing pen.color = '"><img src=x onerror=alert(1)>' would inject an
// element that fires onerror the moment the pen menu renders.
//
// RGR: load the panel inside JSDOM, render against a SETTINGS.pens entry with
// a XSS payload as color, and assert that no <img> tag and no onerror
// attribute survives in the rendered DOM.
describe('Bugs-1 (HIGH): pen menu does not honor injected markup in pen fields', () => {
  const loadLayersPanelInJsdom = () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
    const code = fs.readFileSync(path.join(ROOT, 'src/ui/panels/layers-panel.js'), 'utf8');
    vm.runInContext(code, ctx, { filename: 'layers-panel.js' });
    return dom;
  };

  const renderPenMenuFromSettings = (pens) => {
    const dom = loadLayersPanelInJsdom();
    const w = dom.window;
    const document = w.document;
    const escapeHtml = (str) => {
      if (typeof str !== 'string') return str;
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
    const SETTINGS = { pens, autoColorization: { enabled: false } };
    w.Vectura.UI.LayersPanel.bind({ SETTINGS, escapeHtml });
    const installOn = w.Vectura.UI.LayersPanel.installOn;
    const list = document.createElement('ul');
    list.id = 'layer-list';
    document.body.appendChild(list);

    // We need #layer-status-bar so internal setHint doesn't blow up. Also we
    // need at least one layer to drive renderLayers down the path that calls
    // wirePenAssignment.
    const statusBar = document.createElement('div');
    statusBar.id = 'layer-status-bar';
    document.body.appendChild(statusBar);

    const engine = {
      layers: [{
        id: 'layer-1', name: 'L1', visible: true, locked: false, color: '#ffffff',
        strokeWidth: 0.3, params: {}, parentId: null,
        penId: pens[0]?.id || null, penColor: pens[0]?.color || '#fff',
      }],
      activeLayerId: 'layer-1',
      getLayerById(id) { return this.layers.find((l) => l.id === id); },
      getPenById(id) { return pens.find((p) => p.id === id); },
      isLayerSilhouetteCapable() { return false; },
    };
    const renderer = {
      selectedIds: ['layer-1'],
      getSelectedLayer() { return engine.layers[0]; },
      setSelection() {},
    };
    const proto = {};
    if (installOn) installOn(proto);
    const ctx = Object.create(proto);
    ctx.app = {
      engine,
      renderer,
      render() {},
      pushHistory() {},
    };
    // Some renderLayers code paths walk renderer; ensure they exist.
    try { w.Vectura.UI.LayersPanel.renderLayers.call(ctx); } catch (_err) { /* tolerated */ }
    return { dom, document, list };
  };

  test('XSS payload in pen.color is not interpreted as HTML', () => {
    const pens = [
      { id: 'pen-1', name: 'A', color: '"><img src=x onerror="window.__pwned1=1">', width: 0.3 },
    ];
    const { document } = renderPenMenuFromSettings(pens);
    // No <img> tag should leak from injected color.
    expect(document.querySelector('img')).toBeNull();
    // No onerror attribute anywhere in the rendered panel.
    expect(document.querySelector('[onerror]')).toBeNull();
  });

  test('XSS payload in pen.id is not interpreted as HTML', () => {
    const pens = [
      { id: 'pen-1" onfocus="window.__pwned2=1', name: 'A', color: '#ff0000', width: 0.3 },
    ];
    const { document } = renderPenMenuFromSettings(pens);
    expect(document.querySelector('[onfocus]')).toBeNull();
  });

  test('XSS payload in pen.width is not interpreted as HTML', () => {
    const pens = [
      { id: 'pen-1', name: 'A', color: '#ff0000', width: '0.3; background:url(javascript:alert(1))' },
    ];
    const { document } = renderPenMenuFromSettings(pens);
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    // The pen.width should never end up serialized into an attribute that
    // could break out of the style="" context unsanitized.
    const html = document.body.innerHTML;
    expect(html).not.toContain('background:url(javascript:');
  });
});

// ---------------------------------------------------------------------------
// Bugs-1 — pen record validator on import path
// ---------------------------------------------------------------------------
// Imported pens should be validated: id must be a sane identifier, color must
// match a hex regex, width must be a finite number. The validator's contract
// lives on window.Vectura.PenValidate.validatePens (new).
describe('Bugs-1 (HIGH): pen-record validator rejects/coerces hostile values', () => {
  const loadPenValidatorInJsdom = () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
    const code = fs.readFileSync(path.join(ROOT, 'src/core/pen-validate.js'), 'utf8');
    vm.runInContext(code, ctx, { filename: 'pen-validate.js' });
    return dom;
  };

  test('exposes Vectura.PenValidate.validatePens', () => {
    const dom = loadPenValidatorInJsdom();
    expect(typeof dom.window.Vectura.PenValidate.validatePens).toBe('function');
    dom.window.close();
  });

  test('drops pens whose color is not a hex color', () => {
    const dom = loadPenValidatorInJsdom();
    const { validatePens } = dom.window.Vectura.PenValidate;
    const out = validatePens([
      { id: 'pen-1', name: 'OK', color: '#ff00aa', width: 0.5 },
      { id: 'pen-2', name: 'BAD', color: '"><img src=x onerror=alert(1)>', width: 0.5 },
    ]);
    // The hostile entry is either dropped OR its color is replaced with a
    // safe fallback that does not contain markup characters.
    out.forEach((pen) => {
      expect(pen.color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    });
    dom.window.close();
  });

  test('drops pens whose width is not a finite number', () => {
    const dom = loadPenValidatorInJsdom();
    const { validatePens } = dom.window.Vectura.PenValidate;
    const out = validatePens([
      { id: 'pen-1', name: 'OK', color: '#ff00aa', width: 0.5 },
      { id: 'pen-2', name: 'BAD', color: '#ffffff', width: 'javascript:alert(1)' },
      { id: 'pen-3', name: 'BAD2', color: '#ffffff', width: Infinity },
      { id: 'pen-4', name: 'BAD3', color: '#ffffff', width: NaN },
    ]);
    out.forEach((pen) => {
      expect(typeof pen.width).toBe('number');
      expect(Number.isFinite(pen.width)).toBe(true);
    });
    dom.window.close();
  });

  test('drops pens whose id is not a safe identifier', () => {
    const dom = loadPenValidatorInJsdom();
    const { validatePens } = dom.window.Vectura.PenValidate;
    const out = validatePens([
      { id: 'pen-1', name: 'OK', color: '#ff00aa', width: 0.5 },
      { id: '"><img src=x>', name: 'BAD', color: '#ffffff', width: 0.5 },
    ]);
    out.forEach((pen) => {
      expect(pen.id).toMatch(/^[A-Za-z0-9_-]+$/);
    });
    dom.window.close();
  });

  test('app.js applyState routes incoming s.pens through PenValidate.validatePens', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/app.js'), 'utf8');
    // Look for either direct call or PenValidate reference near the pens
    // assignment. Don't be too loose — must mention validatePens.
    expect(src).toMatch(/validatePens/);
  });
});

// ---------------------------------------------------------------------------
// Bugs-2 (HIGH) — XSS via project-pattern SVG
// ---------------------------------------------------------------------------
// PatternRegistry.replaceProjectPatterns must route pattern.svg through
// Vectura.SvgSanitize.sanitize so that <image onerror> et al. cannot persist
// inside the in-memory pattern store.
describe('Bugs-2 (HIGH): pattern registry sanitizes project-pattern SVG', () => {
  const loadRegistryInJsdom = () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const ctx = dom.getInternalVMContext();
    // svg-sanitize must load FIRST so the registry can see it when invoked.
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/svg-sanitize.js'), 'utf8'), ctx, { filename: 'svg-sanitize.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/pattern-registry.js'), 'utf8'), ctx, { filename: 'pattern-registry.js' });
    return dom;
  };

  test('replaceProjectPatterns strips <script> from pattern.svg', () => {
    const dom = loadRegistryInJsdom();
    const registry = dom.window.Vectura.PatternRegistry;
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<script>window.__pwned3=1;</script>' +
      '<rect width="1" height="1"/></svg>';
    registry.replaceProjectPatterns([{ id: 'custom-evil', name: 'Evil', svg: malicious }]);
    const stored = dom.window.Vectura.PROJECT_CUSTOM_PATTERNS;
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.length).toBe(1);
    expect(stored[0].svg).not.toMatch(/<script/i);
    dom.window.close();
  });

  test('replaceProjectPatterns strips on* handlers from pattern.svg', () => {
    const dom = loadRegistryInJsdom();
    const registry = dom.window.Vectura.PatternRegistry;
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<image href="x" onerror="alert(1)" width="10" height="10"/></svg>';
    registry.replaceProjectPatterns([{ id: 'custom-evil2', name: 'Evil2', svg: malicious }]);
    const stored = dom.window.Vectura.PROJECT_CUSTOM_PATTERNS;
    expect(stored[0].svg).not.toMatch(/onerror/i);
    dom.window.close();
  });

  test('replaceProjectPatterns neutralizes javascript: hrefs on pattern.svg', () => {
    const dom = loadRegistryInJsdom();
    const registry = dom.window.Vectura.PatternRegistry;
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>';
    registry.replaceProjectPatterns([{ id: 'custom-evil3', name: 'Evil3', svg: malicious }]);
    const stored = dom.window.Vectura.PROJECT_CUSTOM_PATTERNS;
    expect(stored[0].svg).not.toMatch(/javascript:/i);
    dom.window.close();
  });

  test('replaceProjectPatterns strips <foreignObject> from pattern.svg', () => {
    const dom = loadRegistryInJsdom();
    const registry = dom.window.Vectura.PatternRegistry;
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject width="10" height="10">' +
      '<body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(2)"/></body>' +
      '</foreignObject><rect width="1" height="1"/></svg>';
    registry.replaceProjectPatterns([{ id: 'custom-evil4', name: 'Evil4', svg: malicious }]);
    const stored = dom.window.Vectura.PROJECT_CUSTOM_PATTERNS;
    expect(stored[0].svg).not.toMatch(/<foreignObject/i);
    expect(stored[0].svg).not.toMatch(/onerror/i);
    dom.window.close();
  });
});

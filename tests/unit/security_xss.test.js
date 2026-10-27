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

  // Pen models: hostile values in the new pen fields (.vectura files and the
  // preference snapshot both go through validatePen).
  const loadPenModelValidator = () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    ['src/config/pen-models.js', 'src/core/pen-validate.js'].forEach((rel) => {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    });
    return dom;
  };

  test('pen-model fields: markup, prototype keys, wrong types and huge values never survive', () => {
    const dom = loadPenModelValidator();
    const { validatePens } = dom.window.Vectura.PenValidate;
    const hostileInk = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"wetness":"<img src=x onerror=alert(1)>","roughness":1e308,"opacity":-5,"blobs":"2","skips":null,"jitter":[0.1],"toString":1}');
    const out = validatePens([
      { id: 'pen-1', name: 'A', color: '#111111', width: 0.4, model: '"><img src=x onerror=alert(1)>', size: '<b>x</b>\u0000\u001b', effect: 'javascript:alert(1)', color2: 'url(javascript:alert(1))', ink: hostileInk },
      { id: 'pen-2', name: 'B', color: '#222222', width: 0.4, model: 'pentel-sign-pen', size: `${'z'.repeat(500)}\n`, effect: 'glow', ink: [1, 2, 3] },
      { id: 'pen-3', name: 'C', color: '#333333', width: 0.4, model: 'Constructor', ink: 'wetness=1' },
    ]);
    expect(out).toHaveLength(3);
    const [a, b, c] = out;
    expect(a.model).toBeUndefined();          // fails the id pattern
    expect(a.size).toBeUndefined();           // no size without a model
    expect(a.effect).toBeUndefined();
    expect(a.color2).toBeUndefined();
    // Only whitelisted keys; values clamped to PARAM_LIMITS; no prototype keys.
    const L = dom.window.Vectura.PEN_MODELS.PARAM_LIMITS;
    expect(Object.keys(a.ink).sort()).toEqual(['blobs', 'opacity', 'roughness']);
    expect(a.ink.roughness).toBe(L.roughness[1]);
    expect(a.ink.opacity).toBe(L.opacity[0]);
    expect(a.ink.blobs).toBe(2);
    expect(Object.getPrototypeOf(a.ink)).toBeNull();
    expect(({}).polluted).toBeUndefined();
    expect(dom.window.Object.prototype.polluted).toBeUndefined();
    expect(b.model).toBe('pentel-sign-pen');
    expect(b.size.length).toBeLessThanOrEqual(48);
    expect(b.size).not.toMatch(/[\u0000-\u001f]/);
    expect(b.effect).toBe('glow');
    expect(b.ink).toBeUndefined();            // arrays are not ink blocks
    expect(c.model).toBeUndefined();          // upper-case ids are rejected
    expect(c.ink).toBeUndefined();
    dom.window.close();
  });

  test('app.js preference snapshot routes pens through the shared validatePen', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/app.js'), 'utf8');
    const block = src.slice(src.indexOf('Array.isArray(snapshot.pens)'), src.indexOf('Array.isArray(snapshot.pens)') + 1600);
    expect(block).toMatch(/PenValidate\?\.validatePen\b/);
    expect(block).toMatch(/i < 32/);
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
    // utils.js and svg-sanitize must load BEFORE pattern-registry — registry's
    // IIFE captures Vectura.Utils.clone (Redundancy-1 PR4) and SvgSanitize.
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/utils.js'), 'utf8'), ctx, { filename: 'utils.js' });
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

describe('SvgSanitize attack corpus (Tests-Gap-6 / Bugs-5)', () => {
  let env;
  const fixturesDir = path.join(ROOT, 'tests/fixtures/svg-attacks');

  beforeAll(() => {
    env = loadSanitizerInJsdom();
  });

  afterAll(() => {
    env.dom.window.close();
  });

  const loadFixture = (name) => fs.readFileSync(path.join(fixturesDir, name), 'utf8');
  const parse = (out) => new env.dom.window.DOMParser().parseFromString(out, 'image/svg+xml');

  test('fixtures directory contains every documented attack vector', () => {
    const expected = [
      'script-tag.svg',
      'onerror-image.svg',
      'external-image-href.svg',
      'external-use-href.svg',
      'animate-href-to-js.svg',
      'set-href-to-js.svg',
      'foreign-object-html.svg',
      'css-url-javascript.svg',
      'animate-values-js.svg',
      'javascript-href-obfuscated.svg',
      'external-gradient-href.svg',
    ];
    const actual = fs.readdirSync(fixturesDir).sort();
    expected.forEach((name) => {
      expect(actual).toContain(name);
    });
  });

  test('script-tag.svg: <script> element is fully removed', () => {
    const out = env.sanitize(loadFixture('script-tag.svg'));
    expect(out).not.toMatch(/<script/i);
    expect(parse(out).querySelector('script')).toBeNull();
  });

  test('onerror-image.svg: on* handlers are stripped, element survives', () => {
    const out = env.sanitize(loadFixture('onerror-image.svg'));
    expect(out).not.toMatch(/onerror/i);
    const img = parse(out).querySelector('image');
    expect(img).not.toBeNull();
    expect(img.getAttribute('onerror')).toBeNull();
  });

  test('external-image-href.svg: non-fragment href / xlink:href is stripped from <image>', () => {
    const out = env.sanitize(loadFixture('external-image-href.svg'));
    expect(out).not.toMatch(/attacker\.example/);
    const doc = parse(out);
    doc.querySelectorAll('image').forEach((el) => {
      expect(el.getAttribute('href')).toBeNull();
      expect(el.getAttribute('xlink:href')).toBeNull();
      expect(el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBeFalsy();
    });
  });

  test('external-use-href.svg: <use> with non-fragment href is dropped entirely', () => {
    const out = env.sanitize(loadFixture('external-use-href.svg'));
    expect(out).not.toMatch(/attacker\.example/);
    expect(parse(out).querySelector('use')).toBeNull();
    // Sibling <rect> must survive (we only drop the offender).
    expect(parse(out).querySelector('rect')).not.toBeNull();
  });

  test('animate-href-to-js.svg: <animate> targeting href is dropped', () => {
    const out = env.sanitize(loadFixture('animate-href-to-js.svg'));
    expect(out).not.toMatch(/javascript:/i);
    expect(parse(out).querySelector('animate')).toBeNull();
    // Parent <a> survives.
    expect(parse(out).querySelector('a')).not.toBeNull();
  });

  test('set-href-to-js.svg: <set> targeting href is dropped', () => {
    const out = env.sanitize(loadFixture('set-href-to-js.svg'));
    expect(out).not.toMatch(/javascript:/i);
    expect(parse(out).querySelector('set')).toBeNull();
  });

  test('animate-values-js.svg: <animate> with javascript: in values list is dropped', () => {
    const out = env.sanitize(loadFixture('animate-values-js.svg'));
    expect(out).not.toMatch(/javascript:/i);
    expect(parse(out).querySelector('animate')).toBeNull();
  });

  test('foreign-object-html.svg: <foreignObject> is fully removed', () => {
    const out = env.sanitize(loadFixture('foreign-object-html.svg'));
    expect(out).not.toMatch(/<foreignObject/i);
    expect(out).not.toMatch(/onclick/i);
    expect(parse(out).querySelector('rect')).not.toBeNull();
  });

  test('css-url-javascript.svg: javascript: inside <style> never survives sanitization', () => {
    // Policy: drop the entire <style> block. Inline CSS is not used by pattern import
    // and is an established XSS surface (url(javascript:...), expression(...), @import).
    const out = env.sanitize(loadFixture('css-url-javascript.svg'));
    expect(out).not.toMatch(/javascript:/i);
    expect(parse(out).querySelector('style')).toBeNull();
  });

  test('javascript-href-obfuscated.svg: leading whitespace / tabs / mixed case javascript: is neutralized', () => {
    const out = env.sanitize(loadFixture('javascript-href-obfuscated.svg'));
    expect(out).not.toMatch(/javascript:/i);
    // Existing policy: <a href="javascript:..."> rewrites to "#". Either neutralization
    // (rewrite to '#') or removal is acceptable; both prevent navigation.
    const anchors = parse(out).querySelectorAll('a');
    anchors.forEach((a) => {
      const h = a.getAttribute('href') || '';
      expect(/javascript:/i.test(h)).toBe(false);
    });
  });

  test('external-gradient-href.svg: external xlink:href on <linearGradient> is stripped', () => {
    const out = env.sanitize(loadFixture('external-gradient-href.svg'));
    expect(out).not.toMatch(/attacker\.example/);
    const grad = parse(out).querySelector('linearGradient');
    // Element survives (it's still a valid gradient reference), but the external
    // href attribute is gone.
    expect(grad).not.toBeNull();
    expect(grad.getAttribute('href')).toBeNull();
    expect(grad.getAttribute('xlink:href')).toBeNull();
    expect(grad.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBeFalsy();
  });

  test('sanitize is idempotent across every fixture (sanitize(sanitize(x)) === sanitize(x))', () => {
    fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.svg')).forEach((name) => {
      const raw = loadFixture(name);
      const once = env.sanitize(raw);
      const twice = env.sanitize(once);
      expect(twice).toBe(once);
    });
  });

  test('legitimate fragment href ("#id") is preserved (no over-stripping)', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<defs><symbol id="s"><rect width="1" height="1"/></symbol></defs>' +
      '<use href="#s"/><use xlink:href="#s"/></svg>';
    const out = env.sanitize(input);
    const uses = parse(out).querySelectorAll('use');
    expect(uses.length).toBe(2);
    expect(uses[0].getAttribute('href')).toBe('#s');
  });
});

// Namespace-prefix bypasses on the DOM path (the one the browser app uses).
// tagName / attr.name are qualified names, so `x:script` bound to the SVG
// namespace or `h:script` in XHTML slipped past name-keyed checks.
describe('SvgSanitize DOM path keys checks on localName + namespace', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  let env;

  beforeAll(() => {
    env = loadSanitizerInJsdom();
  });

  afterAll(() => {
    env.dom.window.close();
  });

  const parse = (out) => new env.dom.window.DOMParser().parseFromString(out, 'image/svg+xml');
  const allElements = (doc) => Array.from(doc.getElementsByTagName('*'));
  const assertNoHostileContent = (out) => {
    const doc = parse(out);
    expect(doc.querySelector('parsererror')).toBeNull();
    allElements(doc).forEach((el) => {
      const local = `${el.localName}`.toLowerCase();
      expect(['script', 'foreignobject', 'style']).not.toContain(local);
      expect(el.namespaceURI === SVG_NS || el.namespaceURI === null).toBe(true);
      Array.from(el.attributes).forEach((attr) => {
        const attrLocal = `${attr.localName}`.toLowerCase();
        expect(attrLocal.startsWith('on')).toBe(false);
        if (attrLocal === 'href') {
          expect(attr.value.replace(/\s/g, '')).not.toMatch(/javascript:/i);
        }
      });
    });
    expect(out).not.toMatch(/alert\(1\)/);
  };

  test('SVG-namespace prefixed <x:script> is dropped', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}" xmlns:x="${SVG_NS}"><rect width="1" height="1"/><x:script>alert(1)</x:script></svg>`
    );
    assertNoHostileContent(out);
    expect(parse(out).getElementsByTagNameNS(SVG_NS, 'rect').length).toBe(1);
  });

  test('XHTML-namespace <h:script> is dropped', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}"><h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script><circle r="2"/></svg>`
    );
    assertNoHostileContent(out);
    expect(parse(out).getElementsByTagNameNS(SVG_NS, 'circle').length).toBe(1);
  });

  test('XHTML-namespace subtree (h:div / h:img onerror) is dropped', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}" xmlns:h="http://www.w3.org/1999/xhtml"><h:div><h:img src="x" onerror="alert(1)"/></h:div></svg>`
    );
    assertNoHostileContent(out);
    expect(out).not.toMatch(/img|div/i);
  });

  test('prefixed <x:foreignObject> and <x:style> are dropped', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}" xmlns:x="${SVG_NS}"><x:foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></body></x:foreignObject><x:style>*{background:url(javascript:alert(1))}</x:style></svg>`
    );
    assertNoHostileContent(out);
    expect(out).not.toMatch(/foreignObject|style/i);
  });

  test('prefixed on* handler attribute is stripped (any namespace)', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}" xmlns:x="${SVG_NS}" xmlns:y="urn:evil"><rect x:onload="alert(1)" y:onclick="alert(1)" width="2" height="2"/></svg>`
    );
    assertNoHostileContent(out);
    const rect = parse(out).getElementsByTagNameNS(SVG_NS, 'rect')[0];
    expect(rect).toBeTruthy();
    expect(rect.getAttribute('width')).toBe('2');
  });

  test('href bound to XLink under a custom prefix is a URL attribute (javascript: and entity-encoded)', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}" xmlns:foo="${XLINK_NS}"><a foo:href="javascript:alert(1)"><text>a</text></a><a foo:href="java&#x73;cript&#58;alert(1)"><text>b</text></a><image foo:href="https://attacker.example/x.png"/></svg>`
    );
    assertNoHostileContent(out);
    expect(out).not.toMatch(/attacker\.example/);
    expect(parse(out).getElementsByTagNameNS(SVG_NS, 'a').length).toBe(2);
  });

  test('<animate> retargeting a prefixed href is dropped', () => {
    const out = env.sanitize(
      `<svg xmlns="${SVG_NS}" xmlns:x="${SVG_NS}"><a href="#ok"><x:set attributeName="foo:href" to="javascript:alert(1)"/><text>c</text></a></svg>`
    );
    assertNoHostileContent(out);
    expect(out).not.toMatch(/<[\w:]*set\b/i);
  });

  test('legit SVG with xlink:href="#id" fragment refs survives intact', () => {
    const input = `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient><path id="p" d="M0 0 L10 10"/></defs><use xlink:href="#p" stroke="url(#g)"/><a href="#p"><circle r="1"/></a></svg>`;
    const out = env.sanitize(input);
    const doc = parse(out);
    const use = doc.getElementsByTagNameNS(SVG_NS, 'use')[0];
    expect(use).toBeTruthy();
    expect(use.getAttributeNS(XLINK_NS, 'href')).toBe('#p');
    expect(doc.getElementsByTagNameNS(SVG_NS, 'a')[0].getAttribute('href')).toBe('#p');
    expect(doc.getElementsByTagNameNS(SVG_NS, 'stop').length).toBe(1);
    expect(env.sanitize(out)).toBe(out);
  });
});

describe('Pattern registry sanitizes stored SVG (Bugs-2 + Bugs-5)', () => {
  // The audit's Bugs-2 entry expects pattern-registry.normalizePattern to route
  // pattern.svg through Vectura.SvgSanitize.sanitize so hostile .vectura projects
  // can't smuggle attack payloads through the persisted pattern.svg field.
  let env;
  const fixturesDir = path.join(ROOT, 'tests/fixtures/svg-attacks');

  beforeAll(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    const ctx = dom.getInternalVMContext();
    // utils.js (Vectura.Utils.clone, Redundancy-1 PR4) and svg-sanitize must
    // load before pattern-registry — registry's IIFE captures both.
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src/core/utils.js'), 'utf8'),
      ctx,
      { filename: 'utils.js' }
    );
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src/core/svg-sanitize.js'), 'utf8'),
      ctx,
      { filename: 'svg-sanitize.js' }
    );
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src/core/pattern-registry.js'), 'utf8'),
      ctx,
      { filename: 'pattern-registry.js' }
    );
    env = { dom, registry: dom.window.Vectura.PatternRegistry };
  });

  afterAll(() => {
    env.dom.window.close();
  });

  test('normalizePattern strips every attack-corpus payload from pattern.svg', () => {
    const fixtures = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.svg'));
    fixtures.forEach((name) => {
      const svg = fs.readFileSync(path.join(fixturesDir, name), 'utf8');
      const normalized = env.registry.normalizePattern({
        id: `custom-attack-${name.replace(/\.svg$/, '')}`,
        name: `Attack ${name}`,
        svg,
      }, { scope: 'project' });
      expect(normalized).not.toBeNull();
      const stored = `${normalized.svg}`;
      // None of these substrings should ever appear in a sanitized pattern.
      expect(stored).not.toMatch(/<script/i);
      expect(stored).not.toMatch(/<foreignObject/i);
      expect(stored).not.toMatch(/javascript:/i);
      expect(stored).not.toMatch(/onerror|onclick|onload|onbegin/i);
      expect(stored).not.toMatch(/attacker\.example/);
    });
  });
});

// CodeQL js/incomplete-multi-character-sanitization: the no-DOMParser regex
// fallback must not let one pass splice a fresh `<script` / `on*=` together.
describe('SvgSanitize regex fallback (no DOMParser, no xmldom)', () => {
  const loadFallbackSanitizer = () => {
    const ctx = vm.createContext({
      window: {},
      require: () => { throw new Error('no xmldom'); },
    });
    const code = fs.readFileSync(path.join(ROOT, 'src/core/svg-sanitize.js'), 'utf8');
    vm.runInContext(code, ctx, { filename: 'svg-sanitize.js' });
    return ctx.window.Vectura.SvgSanitize.sanitize;
  };

  test('nested script fragments do not reassemble after one strip pass', () => {
    const sanitize = loadFallbackSanitizer();
    const out = sanitize('<svg><scr<script></script>ipt>alert(1)</scr<script></script>ipt></svg>');
    expect(out).not.toMatch(/<\s*script/i);
  });

  test('script end tags with whitespace or junk are still stripped', () => {
    const sanitize = loadFallbackSanitizer();
    const out = sanitize('<svg><script>alert(1)</script\t\n bar><path d="M0 0"/></svg>');
    expect(out).not.toMatch(/<\s*script|alert/i);
    expect(out).toContain('<path d="M0 0"/>');
  });

  test('prefixed on* handlers and prefixed href are keyed on the local name', () => {
    const sanitize = loadFallbackSanitizer();
    const out = sanitize('<svg xmlns:x="http://www.w3.org/2000/svg" xmlns:foo="http://www.w3.org/1999/xlink"><rect x:onload="alert(1)" width="1"/><a foo:href="java&#x73;cript&#58;alert(1)"><text>a</text></a><x:script>alert(1)</x:script><x:set attributeName="foo:href" to="#x"/></svg>');
    expect(out).not.toMatch(/onload|alert|script|<x:set/i);
    expect(out).toContain('width="1"');
    expect(out).toContain('foo:href="#"');
  });

  test('nested on* handlers do not reassemble', () => {
    const sanitize = loadFallbackSanitizer();
    const out = sanitize('<svg><path o onclick="x"nclick="alert(1)"/></svg>');
    expect(out).not.toMatch(/\son[a-z]+\s*=/i);
  });

  // The post-fixed-point hostility check must look at markup only. Text that
  // merely mentions `javascript:` or reads like ` one=1` is not an attack.
  test('legitimate text content survives the hostility check', () => {
    const sanitize = loadFallbackSanitizer();
    const svg = '<svg><text x="1">count one=1</text><desc>no javascript: here</desc><path d="M0 0"/></svg>';
    expect(sanitize(svg)).toBe(svg);
  });

  test('hostile markup left inside a tag still empties the output', () => {
    const sanitize = loadFallbackSanitizer();
    const empty = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    // Unquoted handler / javascript: href: the tokenizer parses unquoted
    // values, so the handler is stripped and the href neutralised to `#`
    // with the element kept (same policy as the DOM path).
    expect(sanitize('<svg><path onclick=alert(1) d="M0 0"/></svg>')).toBe('<svg><path d="M0 0"/></svg>');
    expect(sanitize('<svg><a href=javascript:alert(1)><text>x</text></a></svg>'))
      .toBe('<svg><a href="#"><text>x</text></a></svg>');
    // A `<` inside a tag cannot be read with certainty.
    expect(sanitize('<svg><path d="M0 0" <script>alert(1)</script>/></svg>')).toBe(empty);
    // Unclosed script tag (no end tag for the strip rule to pair with).
    expect(sanitize('<svg><script>alert(1)</svg>')).toBe(empty);
    // Unterminated attribute quote hiding a payload.
    expect(sanitize('<svg><a title="x onload=alert(1)></svg>')).toBe(empty);
  });

  // Adversarial review follow-up: the fallback used to match `javascript:`
  // only in its literal form, so entity- or whitespace-obfuscated schemes
  // survived. Scan the output the way a browser would read the URL: decode
  // character references, then drop ASCII whitespace/control characters.
  const readAsBrowserUrl = (text) => `${text}`
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(parseInt(d, 10), 0x10ffff)))
    .replace(/&colon;/gi, ':').replace(/&Tab;/gi, '\t').replace(/&NewLine;/gi, '\n')
    .replace(/[\s\u0000-\u001f]/g, '')
    .toLowerCase();

  const OBFUSCATED_SCHEME_PAYLOADS = {
    'named &colon;': '<svg><a href="javascript&colon;alert(1)"><text>x</text></a></svg>',
    'hex entity letter': '<svg><a href="jav&#x61;script:alert(1)"><text>x</text></a></svg>',
    'decimal entity first letter': '<svg><a href="&#106;avascript:alert(1)"><text>x</text></a></svg>',
    'xlink:href hex entity': '<svg><a xlink:href="&#x6A;avascript:alert(1)"><text>x</text></a></svg>',
    'tab entity': '<svg><a href="java&#9;script:alert(1)"><text>x</text></a></svg>',
    '&NewLine; entity': '<svg><a href="ja&NewLine;vascript:alert(1)"><text>x</text></a></svg>',
    'literal tab': '<svg><a href="java\tscript:alert(1)"><text>x</text></a></svg>',
    'single-quoted tab entity': "<svg><a href='java&#9;script:1'><text>x</text></a></svg>",
    'vbscript entity': '<svg><a href="vb&#115;cript:msgbox(1)"><text>x</text></a></svg>',
    'animate to=': '<svg><animate attributeName="x" to="java&#115;cript:alert(1)"/></svg>',
    'animate values=': '<svg><animate attributeName="x" values="0;java&#115;cript:alert(1)"/></svg>',
    'animate from=': '<svg><animate attributeName="x" from="&#106;avascript:alert(1)"/></svg>',
    'animate by=': '<svg><animate attributeName="x" by="java&#9;script:alert(1)"/></svg>',
    'set to=': '<svg><set attributeName="x" to="jav&#x61;script:alert(1)"/></svg>',
    'set attributeName=href unquoted': '<svg><set attributeName=href to=javascript:alert(1) /></svg>',
    'animate attributeName entity href': '<svg><animate attributeName="&#104;ref" values="#a;#b"/></svg>',
  };

  test.each(Object.entries(OBFUSCATED_SCHEME_PAYLOADS))(
    'obfuscated script scheme is neutralised (%s)',
    (_label, payload) => {
      const sanitize = loadFallbackSanitizer();
      const out = sanitize(payload);
      const read = readAsBrowserUrl(out);
      expect(read).not.toContain('javascript:');
      expect(read).not.toContain('vbscript:');
      expect(out).not.toMatch(/<\s*(?:animate|set)\b[^>]*attributeName\s*=\s*["']?(?:xlink:)?(?:href|&#)/i);
    },
  );

  test('legitimate markup is preserved alongside the scheme checks', () => {
    const sanitize = loadFallbackSanitizer();
    const svg = '<svg><a href="#id"><text x="1">a &gt; b</text></a>'
      + '<a href="https://example.com/x"><text>link</text></a>'
      + '<desc>javascript: is mentioned here</desc>'
      + '<rect style="fill:red;stroke:blue" width="2"/>'
      + '<animate attributeName="opacity" values="0;1" dur="1s"/></svg>';
    const out = sanitize(svg);
    expect(out).toContain('<a href="#id">');
    expect(out).toContain('<desc>javascript: is mentioned here</desc>');
    expect(out).toContain('style="fill:red;stroke:blue"');
    expect(out).toContain('<animate attributeName="opacity" values="0;1" dur="1s"/>');
    expect(out).toContain('a &gt; b');
  });

  // Lazy `[\s\S]*?` strips used to go quadratic on unmatched open tags
  // (`'<animate to="'` x 10k took ~3.8 s). The tokenizer is linear, so a
  // ~300 KB pathological input must finish far inside a second even on a
  // slow CI runner.
  test.each([
    ['<script', 45000],
    ['<animate to="', 25000],
    ['<animate ', 35000],
    ['<style', 50000],
    ['<a href="', 35000],
  ])('pathological %j input stays linear', (chunk, count) => {
    const sanitize = loadFallbackSanitizer();
    const input = `<svg>${chunk.repeat(count)}`;
    expect(input.length).toBeGreaterThan(250000);
    const start = Date.now();
    const out = sanitize(input);
    const elapsed = Date.now() - start;
    expect(typeof out).toBe('string');
    expect(elapsed).toBeLessThan(1000);
  });

  test('oversized input is refused by the fallback only', () => {
    const sanitize = loadFallbackSanitizer();
    const big = `<svg>${'<path d="M0 0"/>'.repeat(600000)}</svg>`;
    expect(big.length).toBeGreaterThan(8 * 1024 * 1024);
    expect(sanitize(big)).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
});

// ---------------------------------------------------------------------------
// mXSS (HIGH): sanitized SVG re-parsed with HTML rules
// ---------------------------------------------------------------------------
// The sanitizer used to keep CDATA sections and any SVG-namespace element
// name (`<xmp>`, `<iframe>`, `<embed>` ...). XMLSerializer output re-parsed as
// HTML (div.innerHTML, or pattern.js copying `svg.innerHTML` into a live
// <svg>) turned `<desc>`'s HTML integration point into a breakout:
//   A: <desc><![CDATA[</svg><img onerror>]]></desc>
//   B: <desc><xmp><![CDATA[</xmp><img onerror>]]></xmp></desc>
describe('SvgSanitize mXSS: output stays inert when re-parsed as HTML', () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAYLOAD_A = `<svg ${NS}><desc><![CDATA[</svg><img src=x onerror=window.__x=1>]]></desc></svg>`;
  const PAYLOAD_B = `<svg ${NS}><desc><xmp><![CDATA[</xmp><img src=x onerror=window.__x=1>]]></xmp></desc></svg>`;
  const BREAKOUTS = {
    'payload A (CDATA in desc)': PAYLOAD_A,
    'payload B (xmp + CDATA in desc)': PAYLOAD_B,
    'title CDATA': `<svg ${NS}><title><![CDATA[</title></svg><img src=x onerror=window.__x=1>]]></title></svg>`,
    'textarea in desc': `<svg ${NS}><desc><textarea>&lt;/textarea&gt;&lt;img src=x onerror=window.__x=1&gt;</textarea></desc></svg>`,
    'noscript in desc': `<svg ${NS}><desc><noscript>&lt;/noscript&gt;&lt;img src=x onerror=window.__x=1&gt;</noscript></desc></svg>`,
    'processing instruction': `<svg ${NS}><desc><?x a="></desc></svg><img src=x onerror=window.__x=1>"?></desc></svg>`,
    'comment': `<svg ${NS}><desc><!-- </desc></svg><img src=x onerror=window.__x=1> --></desc></svg>`,
    'embed/iframe/object/img/div breakouts': `<svg ${NS}><img src="x"/><div><a href="javascript:1">z</a></div><embed src="javascript:1"/><iframe srcdoc="&lt;script&gt;parent.__x=1&lt;/script&gt;"/><object data="javascript:1"/><math><mtext>x</mtext></math></svg>`,
  };
  const ALLOWED = new Set(['svg', 'g', 'path', 'rect', 'desc', 'title', 'a', 'text']);

  const SINK_KEYS = Object.keys(BREAKOUTS);

  const probeHtml = (dom, markup) => {
    const doc = dom.window.document;
    const div = doc.createElement('div');
    div.innerHTML = markup;
    // pattern.js sink: XML parse, then copy innerHTML into a live <svg>.
    const parsed = new dom.window.DOMParser().parseFromString(markup, 'image/svg+xml');
    const live = doc.createElementNS(SVG_NS, 'svg');
    live.innerHTML = parsed.documentElement ? parsed.documentElement.innerHTML : '';
    const bad = [];
    [div, live].forEach((root) => {
      root.querySelectorAll('*').forEach((el) => {
        if (el.namespaceURI !== SVG_NS) bad.push(`ns:${el.localName}`);
        if (!ALLOWED.has(el.localName)) bad.push(`el:${el.localName}`);
        Array.from(el.attributes).forEach((a) => {
          if (/^on/i.test(a.localName)) bad.push(`attr:${a.name}`);
        });
      });
    });
    return bad;
  };

  describe('DOM path (jsdom)', () => {
    let env;
    beforeAll(() => { env = loadSanitizerInJsdom(); });
    afterAll(() => { env.dom.window.close(); });

    test.each(SINK_KEYS)('%s: no HTML element or handler after re-parse', (key) => {
      const out = env.sanitize(BREAKOUTS[key]);
      expect(out).not.toMatch(/<!\[CDATA\[|<\?|<!--/);
      expect(out).not.toMatch(/<(?:[\w-]+:)?(?:xmp|img|iframe|embed|object|div|math|textarea|noscript)\b/i);
      expect(probeHtml(env.dom, out)).toEqual([]);
    });

    test('CDATA text is kept as escaped text, not dropped wholesale', () => {
      const out = env.sanitize(`<svg ${NS}><desc><![CDATA[a < b]]></desc><rect width="1"/></svg>`);
      expect(out).toContain('<desc>a &lt; b</desc>');
      expect(out).toContain('<rect width="1"/>');
    });

    test('xml:base is stripped', () => {
      const out = env.sanitize(`<svg ${NS} xml:base="javascript:window.__x=1"><a href="x"><text>t</text></a></svg>`);
      expect(out).not.toMatch(/xml:base|javascript/i);
    });

    test('animations targeting style / on* / href (any case or prefix) are dropped', () => {
      const out = env.sanitize(`<svg ${NS} xmlns:q="http://www.w3.org/1999/xlink"><set attributeName="onload" to="window.__x=1"/><animate attributeName="OnClick" values="1"/><rect width="1"><set attributeName="style" to="background:url(javascript:1)"/><set attributeName="q:HREF" to="#a"/><animate attributeName="fill" values="red;url(javascript:1)"/><animate attributeName="opacity" values="0;1" dur="1s"/></rect></svg>`);
      expect(out).not.toMatch(/onload|onclick|style|href|javascript/i);
      expect(out).toContain('attributeName="opacity"');
    });

    test('style attribute with a script URL is removed; plain style kept', () => {
      const out = env.sanitize(`<svg ${NS}><rect style="background:url(javascript:window.__x=1)" width="5"/><rect style="background:url(&quot;java\\73 cript:1&quot;)"/><rect style="fill:red;stroke:blue" width="2"/></svg>`);
      expect(out).not.toMatch(/javascript|java\\73/i);
      expect(out).toContain('style="fill:red;stroke:blue"');
    });

    test('presentation attribute with a script URL is removed', () => {
      const out = env.sanitize(`<svg ${NS}><rect fill="url(javascript:1)" width="1"/></svg>`);
      expect(out).not.toMatch(/javascript/i);
      expect(out).toContain('width="1"');
    });

    test('legit SVG vocabulary survives byte-for-byte', () => {
      const legit = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient><linearGradient id="h" xlink:href="#g"/><radialGradient id="r"/><pattern id="p" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="url(#h)"/></pattern><clipPath id="c"><circle r="3"/></clipPath><mask id="m"><ellipse rx="1" ry="2"/></mask><filter id="f"><feGaussianBlur stdDeviation="1"/><feOffset dx="1"/></filter><symbol id="s"><polyline points="0,0 1,1"/></symbol><marker id="mk"><line x2="1"/></marker><path id="pp" d="M0 0L5 5"/></defs><title>T</title><desc>D</desc><use href="#pp"/><use xlink:href="#s" transform="translate(1 1)"/><text x="1" y="2">Hi <tspan>there</tspan><textPath href="#pp">t</textPath></text><g clip-path="url(#c)" mask="url(#m)" filter="url(#f)" transform="rotate(5)"><rect fill="url(#p)" width="4" height="4" style="fill:red"/><polygon points="0,0 1,0 1,1"/></g><a href="#pp"><rect/></a><animateTransform attributeName="transform" type="rotate" from="0" to="90" dur="1s"/></svg>`;
      expect(env.sanitize(legit)).toBe(legit);
    });
  });

  describe('regex fallback (no DOMParser)', () => {
    const loadFallback = () => {
      const ctx = vm.createContext({ window: {}, require: () => { throw new Error('no xmldom'); } });
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/svg-sanitize.js'), 'utf8'), ctx, { filename: 'svg-sanitize.js' });
      return ctx.window.Vectura.SvgSanitize.sanitize;
    };
    let sanitize;
    let dom;
    beforeAll(() => {
      sanitize = loadFallback();
      dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    });
    afterAll(() => dom.window.close());

    test.each(SINK_KEYS)('%s: no HTML element or handler after re-parse', (key) => {
      const out = sanitize(BREAKOUTS[key]);
      expect(out).not.toMatch(/<(?:[\w-]+:)?(?:xmp|img|iframe|embed|object|div|math|textarea|noscript)\b/i);
      expect(probeHtml(dom, out)).toEqual([]);
    });

    test('xml:base, hostile animations and style URLs are stripped', () => {
      const out = sanitize(`<svg ${NS} xml:base="javascript:1"><set attributeName="onload" to="x"/><set attributeName="style" to="a"/><rect style="background:url(javascript:1)" width="1"/><rect style="fill:red"/></svg>`);
      expect(out).not.toMatch(/xml:base|onload|attributeName="style"|javascript/i);
      expect(out).toContain('width="1"');
      expect(out).toContain('style="fill:red"');
    });
  });
});

// The fill sampler must move parsed nodes into the live document, never
// serialize and re-parse them as HTML (mXSS sink, pattern.js).
describe('pattern.js buildSourceFillSampler does not HTML-reparse tile SVG', () => {
  test('source does not assign innerHTML from the parsed tile', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/core/algorithms/pattern.js'), 'utf8');
    expect(src).not.toMatch(/\.innerHTML\s*=\s*svg\.innerHTML/);
  });

  test('payload B through the sampler leaves no live <img> or handler', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
    const ctx = dom.getInternalVMContext();
    // No SvgSanitize loaded: the sink alone must not HTML-reparse.
    // pattern.js destructures OptimizationUtils at load; the sampler does not use it.
    dom.window.Vectura = { OptimizationUtils: { isClosedPath: () => false } };
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/core/algorithms/pattern.js'), 'utf8'), ctx);
    const build = dom.window.Vectura.AlgorithmRegistry._buildSourceFillSampler;
    expect(typeof build).toBe('function');
    // Unsanitized meta.svg: the sink must still not create HTML elements.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><desc><xmp><![CDATA[</xmp><img src=x onerror=window.__x=1>]]></xmp></desc><rect width="5" height="5" fill="black"/></svg>';
    const sampler = build({ svg });
    expect(sampler).toBeTruthy();
    const doc = dom.window.document;
    expect(doc.querySelectorAll('img').length).toBe(0);
    const mounted = doc.body.querySelector('svg');
    expect(mounted.querySelector('rect')).toBeTruthy();
    // Every mounted node stays an SVG-namespace element (no HTML breakout).
    Array.from(mounted.querySelectorAll('*')).forEach((el) => {
      expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    });
    sampler.cleanup();
    dom.window.close();
  });
});

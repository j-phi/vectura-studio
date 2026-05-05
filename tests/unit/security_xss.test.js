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

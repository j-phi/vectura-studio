const fs = require('fs');
const path = require('path');

// TUX-038 static guard: every dblclick registration at the value-entry / reset sites must name its touch
// path in a marker within 5 lines above it:
//   // touch-alt: TUX-038 <text>   a touch alternative exists (label long-press reset, Name field, point buttons)
//   // touch-ok: TUX-038 <reason>  no alternative is needed (a two-state toggle: a tap is the reset)
// This is narrower than the repo-wide R5 rule in touch-static-guard.test.js. R5 sees only
// addEventListener('dblclick') and on* assignments. This test also sees bind(x, 'dblclick', ...) and
// listen(x, 'dblclick', ...), which slider.js, angle-dial.js and ui-text-panel.js use.
const ROOT = path.resolve(__dirname, '../..');
const SITES = [
  'src/ui/components/slider.js',
  'src/ui/components/angle-dial.js',
  'src/ui/components/harmonograph-motion-rack.js',
  'src/ui/panels/algo-config-panel.js',
  'src/ui/panels/noise-rack-panel.js',
  'src/ui/panels/mirror-panel.js',
  'src/ui/panels/scene3d-panel.js',
  'src/ui/panels/pens-panel.js',
  'src/ui/ui-text-panel.js',
];
const MARKER = /touch-(alt|ok):\s*TUX-038\s+\S+/;

// Lines that register a dblclick handler (code only: a comment mentioning dblclick does not count).
const dblclickLines = (text) => {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (/['"]dblclick['"]/.test(code) || /\bondblclick\s*=/.test(code)) out.push(i + 1);
  });
  return out;
};

const unmarked = (text) => {
  const lines = text.split('\n');
  return dblclickLines(text).filter((n) => {
    for (let k = n; k >= Math.max(1, n - 5); k -= 1) if (MARKER.test(lines[k - 1])) return false;
    return true;
  });
};

describe('TUX-038 dblclick sites name their touch path', () => {
  SITES.forEach((rel) => {
    test(rel, () => {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(dblclickLines(text).length, `${rel} has a dblclick site`).toBeGreaterThan(0);
      expect(unmarked(text), `${rel}: dblclick lines without a touch-alt / touch-ok TUX-038 marker`).toEqual([]);
    });
  });

  test('the detector flags a bare dblclick listener and accepts a marked one', () => {
    expect(unmarked("el.addEventListener('dblclick', () => reset());")).toEqual([1]);
    expect(unmarked("bind(slider, 'dblclick', reset);")).toEqual([1]);
    expect(unmarked("el.ondblclick = () => reset();")).toEqual([1]);
    expect(unmarked("// touch-alt: TUX-038 label long-press\nel.addEventListener('dblclick', reset);")).toEqual([]);
    expect(unmarked("// touch-ok: TUX-038 two-state toggle\n\n\nel.addEventListener('dblclick', reset);")).toEqual([]);
    expect(unmarked("// touch-alt: TUX-038 far away\n\n\n\n\n\n\nel.addEventListener('dblclick', reset);")).toEqual([8]);
    expect(unmarked("// double-click resets (dblclick)\nconst x = 1;")).toEqual([]);
  });
});

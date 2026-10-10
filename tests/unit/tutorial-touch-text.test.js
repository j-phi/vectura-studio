const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// TUX-038 req 6: the tour must not promise a double-click on a touch screen. The "Draw Rings" step names
// the gesture by pointer type. The in-app Help guide (help-shortcuts.js) is corrected by the docs unit;
// see docs/touch-audit/changelog-fragments/TUX-038.md.
const SRC = fs.readFileSync(path.resolve(__dirname, '../../src/ui/ui-tutorial.js'), 'utf8');

const stepsFor = (coarse) => {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = (q) => ({ matches: coarse && /pointer:\s*coarse/.test(String(q)), media: String(q), addEventListener() {}, removeEventListener() {} });
  window.eval(SRC);
  return window.Vectura.Tutorial.getSteps();
};
const drawRingsBody = (steps) => {
  const phase = steps.flatMap((s) => s.phases || []).find((p) => p.title === 'Draw Rings on the Canvas');
  return phase ? phase.body : null;
};

describe('TUX-038 tutorial text by pointer type', () => {
  test('touch: double-tap, never double-click', () => {
    const body = drawRingsBody(stepsFor(true));
    expect(body).toMatch(/double-tap/);
    expect(body).not.toMatch(/double-click/);
  });
  test('mouse: double-click, as before', () => {
    const body = drawRingsBody(stepsFor(false));
    expect(body).toMatch(/double-click/);
    expect(body).not.toMatch(/double-tap/);
  });
});

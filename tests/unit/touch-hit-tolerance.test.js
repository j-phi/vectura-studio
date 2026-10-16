/**
 * TUX-024: the hitTolerance table for pen, direct-select and double-tap radii.
 * Mouse and pen keep the literals the renderer used before. Only 'touch' is coarse.
 * This table test does NOT prove wiring. tests/integration/touch-hit-controls.test.js does.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TUX-024 hitTolerance table', () => {
  let runtime;
  let hit;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({});
    hit = runtime.window.Vectura.hitTolerance;
  });

  afterAll(() => runtime.cleanup());

  // kind: [mouse, touch]
  const TABLE = {
    anchor: [6, 22],
    directPick: [0, 22],
    bezierHandle: [5, 22],
    cornerWidget: [7, 22],
    light: [6, 22],
    penClose: [5, 22],
    penCloseDouble: [12, 24],
    doubleTapDist: [8, 24],
    doubleTapMs: [400, 400],
    penCurveSlop: [2, 6],
    'gizmo3d-marker': [9, 22],
    'gizmo3d-centre': [5, 22],
    'gizmo3d-ring-band': [5, 22],
  };

  const rows = [];
  Object.entries(TABLE).forEach(([kind, [mouse, touch]]) => {
    rows.push([kind, 'touch', touch]);
    rows.push([kind, 'mouse', mouse]);
    rows.push([kind, 'pen', mouse]);
    rows.push([kind, undefined, mouse]);
    rows.push([kind, '', mouse]);
  });

  test.each(rows)('%s / %s -> %s px', (kind, pointerType, expected) => {
    expect(hit(kind, pointerType)).toBe(expected);
  });

  test('pen and undefined equal mouse for every TUX-024 kind', () => {
    Object.keys(TABLE).forEach((kind) => {
      expect(hit(kind, 'pen')).toBe(hit(kind, 'mouse'));
      expect(hit(kind, undefined)).toBe(hit(kind, 'mouse'));
    });
  });

  test('touch grab radii are finger sized', () => {
    ['anchor', 'bezierHandle', 'cornerWidget', 'light', 'penClose'].forEach((kind) => {
      expect(hit(kind, 'touch')).toBeGreaterThanOrEqual(22);
    });
    expect(hit('doubleTapDist', 'touch')).toBeGreaterThanOrEqual(24);
  });
});

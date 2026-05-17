/**
 * RGR: resize-handle cursor should follow the actual rotated corner direction.
 *
 * Before the fix, handleCursor returned static CSS keywords ('nwse-resize' /
 * 'nesw-resize') keyed only on the logical handle name. After a 90° rotation
 * the NE handle is physically located at the SE position, so the static
 * cursor showed an arrow at -45° (NW↔SE) — visually wrong because the actual
 * resize axis is +45° (NE↔SW). The fix computes the angle from the
 * selection center to bounds.corners[handle] and returns a rotated SVG
 * cursor whose axis matches that diagonal.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer — resize-handle cursor angle follows corner', () => {
  let runtime;
  let Renderer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    Renderer = runtime.window.Vectura.Renderer;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = () => {
    const engine = {
      layers: [],
      currentProfile: { width: 300, height: 300 },
      getBounds() { return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false }; },
    };
    const r = new Renderer('main-canvas', engine);
    r.scale = 1;
    return r;
  };

  const decodeAngleFromDataUrl = (cursorValue) => {
    const m = /rotate\(([-\d.]+)\s+12\s+12\)/.exec(decodeURIComponent(cursorValue));
    if (!m) return null;
    // The cursor SVG (lucide move-diagonal) is naturally oriented at -45°
    // (NE↔SW), so the rendered rotate() is (corner-angle + 45). Subtract the
    // offset here so assertions express the corner angle directly.
    return Number(m[1]) - 45;
  };

  test('returns fallback CSS cursor when bounds is missing', () => {
    const r = makeRenderer();
    expect(r.handleCursor('ne')).toBe('nesw-resize');
    expect(r.handleCursor('sw')).toBe('nesw-resize');
    expect(r.handleCursor('nw')).toBe('nwse-resize');
    expect(r.handleCursor('se')).toBe('nwse-resize');
  });

  test('axis-aligned bounds: NE corner cursor angle is -45° (arrow runs NE↔SW)', () => {
    const r = makeRenderer();
    const bounds = {
      center: { x: 0, y: 0 },
      corners: {
        nw: { x: -50, y: -50 },
        ne: { x:  50, y: -50 },
        se: { x:  50, y:  50 },
        sw: { x: -50, y:  50 },
      },
    };
    const cursor = r.handleCursor('ne', bounds);
    expect(cursor).toMatch(/^url\(/);
    const angle = decodeAngleFromDataUrl(cursor);
    expect(angle).toBeCloseTo(-45, 0);
  });

  test('axis-aligned bounds: SE corner cursor angle is +45° (arrow runs NW↔SE)', () => {
    const r = makeRenderer();
    const bounds = {
      center: { x: 0, y: 0 },
      corners: {
        nw: { x: -50, y: -50 },
        ne: { x:  50, y: -50 },
        se: { x:  50, y:  50 },
        sw: { x: -50, y:  50 },
      },
    };
    const angle = decodeAngleFromDataUrl(r.handleCursor('se', bounds));
    expect(angle).toBeCloseTo(45, 0);
  });

  test('rotated bounds: NE handle whose physical position has moved to SE shows the SE-style angle (+45°)', () => {
    const r = makeRenderer();
    // Simulates a 90° rotation: logical handle 'ne' now sits at the
    // bottom-right of the rotated bounding box. Pre-fix, this returned the
    // static 'nesw-resize' (-45° equivalent); post-fix the angle should
    // follow the actual diagonal at this physical position (+45°).
    const bounds = {
      center: { x: 0, y: 0 },
      corners: {
        nw: { x:  50, y: -50 }, // was NE
        ne: { x:  50, y:  50 }, // was SE — physical position now
        se: { x: -50, y:  50 },
        sw: { x: -50, y: -50 },
      },
    };
    const angle = decodeAngleFromDataUrl(r.handleCursor('ne', bounds));
    expect(angle).toBeCloseTo(45, 0);
  });

  test('arbitrary rotation: cursor angle equals atan2(corner.y-center.y, corner.x-center.x)', () => {
    const r = makeRenderer();
    // 30° CCW (in screen-coords-with-Y-down terms) — pick an arbitrary
    // off-axis corner and verify the cursor matches it analytically.
    const center = { x: 100, y: 100 };
    const corner = { x: 100 + 70 * Math.cos((-30 * Math.PI) / 180),
                     y: 100 + 70 * Math.sin((-30 * Math.PI) / 180) };
    const bounds = {
      center,
      corners: { nw: corner, ne: corner, se: corner, sw: corner },
    };
    const angle = decodeAngleFromDataUrl(r.handleCursor('ne', bounds));
    expect(angle).toBeCloseTo(-30, 0);
  });
});

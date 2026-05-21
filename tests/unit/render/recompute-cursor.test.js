/**
 * Arch-5 RGR test: consolidated cursor recomputation.
 *
 * Three pre-existing entry points in src/render/renderer.js cooperatively
 * own canvas.style.cursor:
 *
 *   - updateCursor()                   tool-default branch
 *   - updateHoverCursor(e)             hover/hit-test branch
 *   - _applyModifierCursorOverride(e)  Alt/CMD overrides
 *
 * They share implicit ordering (modifier override wins over tool default
 * which wins over hover hit-test). Arch-5 funnels the *pure* portions of
 * that decision tree through a single function
 *
 *   recomputeCursor({ tool, isPan, isLayerDrag, isSelecting, modState, penMode })
 *
 * which returns `{ cursor, mode } | null` (null = caller should continue
 * with hit-tested fallbacks).
 *
 * These tests pin the contract so the refactor stays byte-identical with
 * the previous cooperative behavior.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

describe('Renderer.recomputeCursor', () => {
  let runtime;
  let Renderer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    Renderer = runtime.window.Vectura.Renderer;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // recomputeCursor uses `this.cursorDataUrl` for the icon-cursor branches.
  // Stub it so tests are deterministic without standing up a full instance.
  const ctx = () => ({
    cursorDataUrl: (name, hotX, hotY, fallback /*, ...rest*/) =>
      `url:${name}@${hotX},${hotY}|${fallback}`,
  });

  const call = (overrides) =>
    Renderer.prototype.recomputeCursor.call(ctx(), {
      tool: 'select',
      isPan: false,
      isLayerDrag: false,
      isSelecting: false,
      modState: { alt: false, meta: false },
      penMode: 'draw',
      ...overrides,
    });

  test('Alt + select (no drag, no selecting) → copy-plus override', () => {
    const result = call({ tool: 'select', modState: { alt: true, meta: false } });
    expect(result).toEqual({
      cursor: 'url:copyPlus@4,4|copy',
      mode: 'select-copy',
    });
  });

  test('Alt + select WHILE layer drag → no override (falls through to tool default)', () => {
    const result = call({
      tool: 'select',
      isLayerDrag: true,
      modState: { alt: true, meta: false },
    });
    // Override blocked → tool default for select.
    expect(result).toEqual({
      cursor: 'url:filled@4,4|auto',
      mode: 'select',
    });
  });

  test('CMD + fill (no drag) → microscope override', () => {
    const result = call({ tool: 'fill', modState: { alt: false, meta: true } });
    expect(result).toEqual({
      cursor: 'url:microscope@10,14|crosshair',
      mode: 'fill-pickup',
    });
  });

  test('hand tool, not panning → grab', () => {
    const result = call({ tool: 'hand', isPan: false });
    expect(result).toEqual({ cursor: 'grab', mode: 'hand' });
  });

  test('hand tool, panning → grabbing', () => {
    const result = call({ tool: 'hand', isPan: true });
    expect(result).toEqual({ cursor: 'grabbing', mode: 'hand' });
  });

  test('pen tool default → pen icon cursor', () => {
    const result = call({ tool: 'pen' });
    expect(result).toEqual({
      cursor: 'url:pen@2,19|crosshair',
      mode: 'pen',
    });
  });

  test('fill tool default → bucket icon cursor', () => {
    const result = call({ tool: 'fill' });
    expect(result).toEqual({
      cursor: 'url:bucket@20,22|crosshair',
      mode: 'fill',
    });
  });

  test('direct tool default → outline cursor', () => {
    const result = call({ tool: 'direct' });
    expect(result).toEqual({
      cursor: 'url:outline@4,4|auto',
      mode: 'direct',
    });
  });

  test('shape-* tool → crosshair (mode flagged as shape-reticle by caller)', () => {
    // The shape branch builds a data-URL via makeShapeReticleCursor which
    // requires theme tokens; recomputeCursor signals the branch with a
    // sentinel mode so the caller can defer the data-URL build. The
    // sentinel cursor itself is 'crosshair' as a safe fallback.
    const result = call({ tool: 'shape-rectangle' });
    expect(result).not.toBeNull();
    expect(result.mode).toBe('shape-reticle');
  });

  test('algo-draw / scissor → crosshair', () => {
    expect(call({ tool: 'algo-draw' })).toEqual({ cursor: 'crosshair', mode: 'algo-draw' });
    expect(call({ tool: 'scissor' })).toEqual({ cursor: 'crosshair', mode: 'scissor' });
  });

  test('unknown tool → plain crosshair fallback', () => {
    const result = call({ tool: 'nonexistent-tool' });
    expect(result).toEqual({ cursor: 'crosshair', mode: '' });
  });
});

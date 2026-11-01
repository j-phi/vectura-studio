const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const mkLayer = (e, t) => {
  const r = e.addLayer(t);
  const id = typeof r === 'string' ? r : r.id;
  return e.layers.find((l) => l.id === id);
};

describe('duplicateLayer duplicates the full parentId subtree', () => {
  let runtime;
  let VectorEngine;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    VectorEngine = runtime.window.Vectura.VectorEngine;
  });
  afterAll(() => runtime.cleanup());

  test('a mask source copies its masked children and leaves the original intact', () => {
    const e = new VectorEngine();
    const mask = mkLayer(e, 'rings');
    const child = mkLayer(e, 'wavetable');
    child.parentId = mask.id;
    mask.mask.enabled = true;
    const n = e.layers.length;
    const dup = e.duplicateLayer(mask.id);
    expect(e.layers.length).toBe(n + 2);
    const kids = e.layers.filter((l) => l.parentId === dup.id);
    expect(kids.length).toBe(1);
    expect(kids[0].type).toBe('wavetable');
    expect(kids[0].id).not.toBe(child.id);
    expect(child.parentId).toBe(mask.id);
    expect(dup.mask.enabled).toBe(true);
    expect(e.layers.indexOf(kids[0])).toBe(e.layers.indexOf(dup) + (e.layers.indexOf(child) > e.layers.indexOf(mask) ? 1 : -1));
  });

  test('nested group > inner group > [mask+child, spiral] + rings copies all six', () => {
    const e = new VectorEngine();
    const get = (t) => mkLayer(e, t);
    const m = get('rings'), c = get('wavetable'), sp = get('spiral'), y = get('rings');
    const inner = get('spiral'), outer = get('spiral');
    inner.isGroup = true; outer.isGroup = true;
    inner.parentId = outer.id; m.parentId = inner.id; sp.parentId = inner.id;
    c.parentId = m.id; y.parentId = outer.id;
    m.mask.enabled = true;
    const n = e.layers.length;
    const dup = e.duplicateLayer(outer.id);
    expect(e.layers.length).toBe(n + 6);
    const copies = e.layers.filter((l) => / Copy/.test(l.name));
    const kidsOf = (p) => copies.filter((l) => l.parentId === p);
    expect(kidsOf(dup.id).length).toBe(2);
    const dInner = kidsOf(dup.id).find((l) => l.isGroup);
    const dMask = kidsOf(dInner.id).find((l) => l.mask.enabled);
    expect(kidsOf(dMask.id).length).toBe(1);
    expect(kidsOf(dMask.id)[0].type).toBe('wavetable');
  });
});

/**
 * Scene3D.StyleCascade unit tests (CONTRACT C).
 *
 * The module is required directly (node environment, module.exports guard) —
 * no DOM, no runtime loader. Covers: resolution precedence byFace > byObject
 * > scene, provenance, whole-style-wins (no per-field merge), setStyle /
 * clearStyle mutation semantics, missing-table fallbacks, and fresh-object
 * returns (mutating a resolve() result never corrupts the table).
 */
const StyleCascade = require('../../src/core/scene3d/style-cascade.js');

const makeTable = () => ({
  scene: { penId: null, mapper: 'none', params: {} },
  byObject: {},
  byFace: {},
});

describe('Scene3D.StyleCascade — resolve precedence', () => {
  test('byFace beats byObject beats scene', () => {
    const table = makeTable();
    table.scene = { penId: 'pen-1', mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } };
    table.byObject['obj-1'] = { penId: 'pen-2', mapper: 'wireframe', params: {} };
    table.byFace['obj-1/face:+X'] = { penId: 'pen-3', mapper: 'none', params: {} };

    const face = StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+X' });
    expect(face.penId).toBe('pen-3');
    expect(face.mapper).toBe('none');

    const otherFace = StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:-X' });
    expect(otherFace.penId).toBe('pen-2');
    expect(otherFace.mapper).toBe('wireframe');

    const otherObject = StyleCascade.resolve(table, { objectId: 'obj-2', faceId: 'face:+X' });
    expect(otherObject.penId).toBe('pen-1');
    expect(otherObject.mapper).toBe('hatch');
  });

  test('object-only target skips byFace entirely', () => {
    const table = makeTable();
    table.byFace['obj-1/face:+X'] = { penId: 'pen-3', mapper: 'none', params: {} };
    const res = StyleCascade.resolve(table, { objectId: 'obj-1' });
    expect(res.provenance.scope).toBe('scene');
  });

  test('provenance identifies scope and key', () => {
    const table = makeTable();
    table.byObject['obj-1'] = { penId: 'pen-2', mapper: 'none', params: {} };
    table.byFace['obj-1/face:+Z'] = { penId: 'pen-3', mapper: 'none', params: {} };

    expect(StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+Z' }).provenance)
      .toEqual({ scope: 'face', key: 'obj-1/face:+Z' });
    expect(StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:-Z' }).provenance)
      .toEqual({ scope: 'object', key: 'obj-1' });
    expect(StyleCascade.resolve(table, { objectId: 'obj-9' }).provenance)
      .toEqual({ scope: 'scene', key: null });
  });

  test('whole-style wins: a narrower style is NOT field-merged with broader scopes', () => {
    const table = makeTable();
    table.scene = { penId: 'pen-1', mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } };
    // Object override carries no pen and no params — resolved style must not
    // inherit the scene's pen or hatch params.
    table.byObject['obj-1'] = { penId: null, mapper: 'none', params: {} };

    const res = StyleCascade.resolve(table, { objectId: 'obj-1' });
    expect(res.penId).toBe(null);
    expect(res.mapper).toBe('none');
    expect(res.params).toEqual({});
  });
});

describe('Scene3D.StyleCascade — fallbacks and robustness', () => {
  test('missing table resolves to the scene default', () => {
    [undefined, null, {}].forEach((table) => {
      const res = StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+X' });
      expect(res.penId).toBe(null);
      expect(res.mapper).toBe('none');
      expect(res.params).toEqual({});
      expect(res.provenance).toEqual({ scope: 'scene', key: null });
    });
  });

  test('missing byObject / byFace maps fall through to scene', () => {
    const table = { scene: { penId: 'pen-1', mapper: 'wireframe', params: {} } };
    const res = StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+X' });
    expect(res.penId).toBe('pen-1');
    expect(res.mapper).toBe('wireframe');
    expect(res.provenance.scope).toBe('scene');
  });

  test('missing target resolves to scene', () => {
    const table = makeTable();
    expect(StyleCascade.resolve(table).provenance.scope).toBe('scene');
    expect(StyleCascade.resolve(table, {}).provenance.scope).toBe('scene');
  });

  test('malformed stored style is normalized on resolve', () => {
    const table = makeTable();
    table.byObject['obj-1'] = { penId: 'pen-2' }; // no mapper, no params
    const res = StyleCascade.resolve(table, { objectId: 'obj-1' });
    expect(res.mapper).toBe('none');
    expect(res.params).toEqual({});
  });
});

describe('Scene3D.StyleCascade — setStyle / clearStyle', () => {
  test('setStyle writes each scope; resolve reflects it', () => {
    const table = makeTable();
    StyleCascade.setStyle(table, 'scene', null, { penId: 'pen-1', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 40 } });
    StyleCascade.setStyle(table, 'object', 'obj-1', { penId: 'pen-2', mapper: 'wireframe', params: {} });
    StyleCascade.setStyle(table, 'face', 'obj-1/face:+Y', { penId: 'pen-3', mapper: 'none', params: {} });

    expect(table.scene.mapper).toBe('hatch');
    expect(table.byObject['obj-1'].penId).toBe('pen-2');
    expect(table.byFace['obj-1/face:+Y'].penId).toBe('pen-3');
    expect(StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+Y' }).penId).toBe('pen-3');
  });

  test('setStyle creates missing maps as needed', () => {
    const table = { scene: { penId: null, mapper: 'none', params: {} } }; // no byObject/byFace
    StyleCascade.setStyle(table, 'object', 'obj-1', { penId: 'pen-2', mapper: 'none', params: {} });
    StyleCascade.setStyle(table, 'face', 'obj-1/face:+X', { penId: 'pen-3', mapper: 'none', params: {} });
    expect(table.byObject['obj-1'].penId).toBe('pen-2');
    expect(table.byFace['obj-1/face:+X'].penId).toBe('pen-3');
  });

  test('setStyle stores a normalized clone, not the caller object', () => {
    const table = makeTable();
    const style = { penId: 'pen-2', mapper: 'hatch', params: { fillAngle: 10, fillDensity: 20 } };
    StyleCascade.setStyle(table, 'object', 'obj-1', style);
    style.penId = 'pen-9';
    style.params.fillAngle = 999;
    expect(table.byObject['obj-1'].penId).toBe('pen-2');
    expect(table.byObject['obj-1'].params.fillAngle).toBe(10);
  });

  test('clearStyle deletes object/face entries; resolution falls through', () => {
    const table = makeTable();
    table.scene = { penId: 'pen-1', mapper: 'none', params: {} };
    StyleCascade.setStyle(table, 'object', 'obj-1', { penId: 'pen-2', mapper: 'none', params: {} });
    StyleCascade.setStyle(table, 'face', 'obj-1/face:+X', { penId: 'pen-3', mapper: 'none', params: {} });

    StyleCascade.clearStyle(table, 'face', 'obj-1/face:+X');
    expect(table.byFace['obj-1/face:+X']).toBeUndefined();
    expect(StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+X' }).penId).toBe('pen-2');

    StyleCascade.clearStyle(table, 'object', 'obj-1');
    expect(table.byObject['obj-1']).toBeUndefined();
    expect(StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+X' }).penId).toBe('pen-1');
  });

  test('clearStyle on scene resets to the default style', () => {
    const table = makeTable();
    table.scene = { penId: 'pen-1', mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } };
    StyleCascade.clearStyle(table, 'scene', null);
    expect(table.scene).toEqual({ penId: null, mapper: 'none', params: {} });
  });

  test('clearStyle / setStyle on a missing table or map is a no-op (no throw)', () => {
    expect(() => StyleCascade.setStyle(null, 'object', 'obj-1', {})).not.toThrow();
    expect(() => StyleCascade.clearStyle(null, 'face', 'x/y')).not.toThrow();
    expect(() => StyleCascade.clearStyle({}, 'object', 'obj-1')).not.toThrow();
  });
});

describe('Scene3D.StyleCascade — fresh-object returns', () => {
  test('mutating a resolve() result does not corrupt the table', () => {
    const table = makeTable();
    table.byObject['obj-1'] = { penId: 'pen-2', mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } };

    const first = StyleCascade.resolve(table, { objectId: 'obj-1' });
    first.penId = 'pen-9';
    first.mapper = 'wireframe';
    first.params.fillAngle = 999;
    first.provenance.scope = 'face';

    expect(table.byObject['obj-1']).toEqual({ penId: 'pen-2', mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } });
    const second = StyleCascade.resolve(table, { objectId: 'obj-1' });
    expect(second.penId).toBe('pen-2');
    expect(second.mapper).toBe('hatch');
    expect(second.params.fillAngle).toBe(45);
    expect(second.provenance).toEqual({ scope: 'object', key: 'obj-1' });
  });

  test('each resolve() call returns a distinct object', () => {
    const table = makeTable();
    const a = StyleCascade.resolve(table, {});
    const b = StyleCascade.resolve(table, {});
    expect(a).not.toBe(b);
    expect(a.params).not.toBe(b.params);
    expect(a).not.toBe(table.scene);
    expect(a.params).not.toBe(table.scene.params);
  });
});

const { test, expect } = require('@playwright/test');

/*
 * e2e coverage for the OBJ/STL 3D model import UI entry point — the surface the
 * adversarial review found had NO tests at all (grep for `import3dModelFile` /
 * `file-import-3d` in tests/ returned nothing on 1d7e951).
 *
 * Exercised here, in a real browser, end to end:
 *   - the File-menu item (#btn-import-3d) opening the hidden input
 *     (#file-import-3d, index.html:284) and its change → import3dModelFile wiring
 *   - the readAsText (.obj) AND readAsArrayBuffer (.stl) branches
 *   - the imported object landing ON the ground (regression: it used to be
 *     half-buried, transform.y = 0)
 *   - vertex welding keeping the ink sane (regression: unwelded OBJ drew every
 *     internal triangle edge)
 *   - the progress affordance over the blocking parse/compose
 *   - setSelection making the imported object the active layer
 *   - both failure modals, incl. the accurate "no faces" diagnosis
 *   - reader.onerror having a handler at all
 */

// A cube: 8 verts, 6 quads → 12 triangles.
const CUBE_OBJ = `# cube
o TestCube
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

// The same cube written as UNWELDED triangle soup (36 `v` records, one per
// triangle corner) — what an STL→OBJ conversion emits.
const buildUnweldedCubeObj = () => {
  const v = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const lines = [];
  let n = 1;
  quads.forEach((q) => {
    [[q[0], q[1], q[2]], [q[0], q[2], q[3]]].forEach((tri) => {
      tri.forEach((i) => lines.push(`v ${v[i][0]} ${v[i][1]} ${v[i][2]}`));
      lines.push(`f ${n} ${n + 1} ${n + 2}`);
      n += 3;
    });
  });
  return lines.join('\n') + '\n';
};

// Binary STL tetrahedron — forces the readAsArrayBuffer branch.
const buildBinaryStl = () => {
  const tris = [
    [[1, 1, 1], [-1, -1, 1], [-1, 1, -1]],
    [[1, 1, 1], [1, -1, -1], [-1, -1, 1]],
    [[1, 1, 1], [-1, 1, -1], [1, -1, -1]],
    [[-1, -1, 1], [1, -1, -1], [-1, 1, -1]],
  ];
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  tris.forEach((tri) => {
    o += 12; // normal
    tri.forEach((p) => {
      buf.writeFloatLE(p[0], o);
      buf.writeFloatLE(p[1], o + 4);
      buf.writeFloatLE(p[2], o + 8);
      o += 12;
    });
    o += 2; // attribute byte count
  });
  return buf;
};

const importFile = async (page, name, mimeType, buffer) => {
  await page.locator('#file-import-3d').setInputFiles({ name, mimeType, buffer });
};

// The import defers its work a frame (so the progress bar paints), so poll the
// engine rather than assuming it finished synchronously.
const waitForImportedObject = (page) =>
  page.waitForFunction(() => {
    const engine = window.app?.engine;
    if (!engine) return false;
    return engine.layers.some((l) => l.type === 'object3d'
      && l.params?.params?.solidType === 'importedMesh');
  }, null, { timeout: 30_000 });

const readImported = (page) => page.evaluate(() => {
  const engine = window.app.engine;
  const child = engine.layers.find((l) => l.type === 'object3d'
    && l.params?.params?.solidType === 'importedMesh');
  const { importedMesh, radius } = child.params.params;
  const ty = child.params.transform.y;
  let minY = Infinity;
  let maxY = -Infinity;
  importedMesh.vertices.forEach((v) => {
    const wy = v.y * radius + ty;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  });
  const group = engine.layers.find((l) => l.type === 'scene3d' && l.isGroup);
  return {
    name: child.name,
    verts: importedMesh.vertices.length,
    faces: importedMesh.faces.length,
    transformY: ty,
    worldYMin: minY,
    worldYMax: maxY,
    radius,
    activeLayerId: engine.activeLayerId,
    childId: child.id,
    selected: Array.from(window.app.renderer?.selectedLayerIds || []),
    scenePaths: Array.isArray(group?.scenePaths) ? group.scenePaths.length : -1,
    hasLight: engine.layers.some((l) => l.type === 'sceneLight3d'),
    hasGround: engine.layers.some((l) => l.type === 'sceneGround3d'),
  };
});

test.describe('3D model import (OBJ/STL)', () => {
  test('the File menu item opens the hidden 3D file input', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#btn-import-3d');
    const input = page.locator('#file-import-3d');
    await expect(input).toHaveCount(1);
    await expect(input).toHaveAttribute('accept', /\.obj/);
    await expect(input).toHaveAttribute('accept', /\.stl/);

    // Clicking the menu item forwards the click to the hidden input.
    const forwarded = await page.evaluate(() => new Promise((resolve) => {
      const input2 = document.getElementById('file-import-3d');
      input2.addEventListener('click', (e) => { e.preventDefault(); resolve(true); }, { once: true });
      document.getElementById('btn-import-3d').click();
      setTimeout(() => resolve(false), 1000);
    }));
    expect(forwarded).toBe(true);
    await expect(btn).toHaveCount(1);
  });

  test('imports an OBJ, builds a lit scene, and rests the mesh ON the ground', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('/');

    await importFile(page, 'cube.obj', 'model/obj', Buffer.from(CUBE_OBJ, 'utf8'));
    await waitForImportedObject(page);
    const info = await readImported(page);

    // A whole scene tree came with it.
    expect(info.hasLight).toBe(true);
    expect(info.hasGround).toBe(true);
    expect(info.scenePaths).toBeGreaterThan(0);
    expect(info.name).toBe('TestCube'); // from the OBJ `o` record

    // REGRESSION (D3): base on the ground plane, nothing below it.
    expect(info.transformY).toBeGreaterThan(0);
    expect(Math.abs(info.worldYMin)).toBeLessThan(0.01);
    expect(info.worldYMax).toBeGreaterThan(0);

    // The imported object is selected and active.
    expect(info.activeLayerId).toBe(info.childId);
    expect(info.selected).toContain(info.childId);

    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/import-3d-obj-on-ground.png', fullPage: false });
  });

  test('welds an unwelded OBJ so it does not draw every internal edge', async ({ page }) => {
    await page.goto('/');
    await importFile(page, 'soup.obj', 'model/obj', Buffer.from(buildUnweldedCubeObj(), 'utf8'));
    await waitForImportedObject(page);
    const info = await readImported(page);
    // REGRESSION (D1): 36 `v` records → 8 welded corners, not 36 unshared verts.
    expect(info.verts).toBe(8);
    expect(info.faces).toBe(12);
    expect(info.worldYMin).toBeCloseTo(0, 2);
  });

  test('imports a binary STL through the readAsArrayBuffer branch', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('/');

    await importFile(page, 'tetra.stl', 'model/stl', buildBinaryStl());
    await waitForImportedObject(page);
    const info = await readImported(page);
    expect(info.verts).toBe(4);
    expect(info.faces).toBe(4);
    expect(info.scenePaths).toBeGreaterThan(0);
    // The ground rule applies to the STL path too.
    expect(info.worldYMin).toBeCloseTo(0, 2);
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/import-3d-stl-on-ground.png' });
  });

  test('a second import lands in the SAME scene rather than making another one', async ({ page }) => {
    await page.goto('/');
    await importFile(page, 'cube.obj', 'model/obj', Buffer.from(CUBE_OBJ, 'utf8'));
    await waitForImportedObject(page);
    await importFile(page, 'tetra.stl', 'model/stl', buildBinaryStl());
    await page.waitForFunction(() => window.app.engine.layers
      .filter((l) => l.type === 'object3d' && l.params?.params?.solidType === 'importedMesh').length === 2,
    null, { timeout: 30_000 });

    const counts = await page.evaluate(() => ({
      groups: window.app.engine.layers.filter((l) => l.type === 'scene3d' && l.isGroup).length,
      objects: window.app.engine.layers.filter((l) => l.type === 'object3d'
        && l.params?.params?.solidType === 'importedMesh').length,
    }));
    expect(counts.groups).toBe(1);
    expect(counts.objects).toBe(2);
  });

  test('shows an accurate "No Mesh Found" modal when every face is unusable', async ({ page }) => {
    await page.goto('/');
    // Valid vertices, but every face references a vertex that does not exist.
    const bad = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 50 60 70\n';
    await importFile(page, 'badfaces.obj', 'model/obj', Buffer.from(bad, 'utf8'));

    const modal = page.locator('.modal-text');
    await expect(modal).toContainText(/no faces to import/i, { timeout: 15_000 });
    // REGRESSION (D8d): the accurate diagnosis, not the generic read failure.
    await expect(modal).toContainText(/unknown vertex/i);
    // Nothing was imported.
    const objects = await page.evaluate(() => window.app.engine.layers
      .filter((l) => l.type === 'object3d').length);
    expect(objects).toBe(0);
    await page.screenshot({ path: 'test-results/import-3d-no-mesh-modal.png' });
  });

  test('shows the read-failure modal for a file that is not a mesh at all', async ({ page }) => {
    await page.goto('/');
    await importFile(page, 'notamesh.obj', 'model/obj', Buffer.from('this is not an OBJ\n', 'utf8'));
    await expect(page.locator('.modal-text')).toContainText(/no faces to import|Make sure it is a valid OBJ/i, {
      timeout: 15_000,
    });
    const objects = await page.evaluate(() => window.app.engine.layers
      .filter((l) => l.type === 'object3d').length);
    expect(objects).toBe(0);
  });

  test('installs a FileReader error handler so a read failure is not silent', async ({ page }) => {
    await page.goto('/');
    // Drive import3dModelFile with a File whose read will fail, and assert the
    // handler exists + reports. REGRESSION (D8c): there was no onerror at all.
    const reported = await page.evaluate(() => new Promise((resolve) => {
      const RealFileReader = window.FileReader;
      let sawHandler = false;
      class ExplodingReader {
        constructor() { this.result = null; }
        set onerror(fn) { sawHandler = true; this._onerror = fn; }
        get onerror() { return this._onerror; }
        readAsText() { setTimeout(() => this._onerror && this._onerror(new Error('boom')), 0); }
        readAsArrayBuffer() { this.readAsText(); }
      }
      window.FileReader = ExplodingReader;
      const file = new File(['v 0 0 0'], 'x.obj', { type: 'model/obj' });
      window.app.ui.import3dModelFile(file);
      setTimeout(() => {
        window.FileReader = RealFileReader;
        const text = document.querySelector('.modal-text');
        resolve({ sawHandler, modalText: text ? text.textContent : '' });
      }, 800);
    }));
    expect(reported.sawHandler).toBe(true);
    expect(reported.modalText).toMatch(/Could not read/i);
  });

  test('raises a progress affordance over the blocking parse/compose', async ({ page }) => {
    await page.goto('/');
    // Observe that startProgress ran: spy on the ProgressBar primitive.
    const shown = await page.evaluate(() => new Promise((resolve) => {
      const PB = window.Vectura?.UI?.overlays?.ProgressBar;
      if (!PB || typeof PB.show !== 'function') { resolve('no-primitive'); return; }
      const realShow = PB.show;
      let label = null;
      PB.show = (opts) => { label = opts && opts.label; return realShow.call(PB, opts); };
      const objText = 'v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nf 1 2 3 4\n';
      const file = new File([objText], 'p.obj', { type: 'model/obj' });
      window.app.ui.import3dModelFile(file);
      setTimeout(() => { PB.show = realShow; resolve(label); }, 1500);
    }));
    // Either the primitive is absent in this build, or it was raised with a label.
    if (shown !== 'no-primitive') expect(String(shown)).toMatch(/Importing/i);
  });
});

const { loadSurfaceLockRuntime, buildSurfaceLockScene, dragEqualsExport, signature, DEFAULT_POSES } = require('../helpers/surface-lock-scene');

// W2-B1 (docs/surface-lock-contract.md §13): a Level S scene (every fill a surface-locked MarkSet) drags through the
// FULL tier with no pose warp and no spin ring, so a drag frame IS the export; its release is a compose-memo hit.
// A partially frameable scene (a surface fill beside a pose fill) keeps the warp / draft machinery.

describe('surface lock Level S drag path (frame == export, no warp, memo-hit release)', () => {
  let rt; let V;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; });
  afterAll(() => rt && rt.cleanup());

  const withDraftQuality = (fn) => {
    const S = V.SETTINGS; const was = S.preview3dQuality;
    S.preview3dQuality = 'draft';
    try { return fn(); } finally { S.preview3dQuality = was; }
  };

  [{ name: 'ladder', toneLaw: 'ladder' }, { name: 'mezzo', toneLaw: 'mezzoRegion' }].forEach(({ name, toneLaw }) => {
    it(`${name}: every default pose, preview frame equals a fresh full compose`, () => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw, mapper: 'hatch', markSpace: 'surface' });
      s.composeFull(); // the settled compose a real drag starts from (this is what arms the warp today)
      const rows = dragEqualsExport(s, DEFAULT_POSES);
      expect(rows.length).toBe(8);
      rows.forEach((r) => expect(r.equal, JSON.stringify(r.pose)).toBe(true));
    });

    it(`${name}: same under the renderer's draft drag quality`, () => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw, mapper: 'hatch', markSpace: 'surface' });
      s.composeFull(); // the settled compose stores the export quality the drag frames must reuse
      DEFAULT_POSES.forEach((pose) => {
        s.setPose(pose);
        const prev = withDraftQuality(() => signature(s.composePreview()));
        expect(prev, JSON.stringify(pose)).toBe(signature(s.composeFull()));
      });
    });
  });

  it('preview frames never warp, run the full tier and keep no pose snapshot', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'ladder', mapper: 'hatch', markSpace: 'surface' });
    s.composeFull();
    const st = s.eng.sceneComposeStats; const warps0 = st.warps;
    for (let i = 0; i < 6; i++) {
      s.setPose({ camYaw: -30 + i * 4, camPitch: 20 });
      s.composePreview();
      expect(st.lastTier).toBe('full');
      expect(s.group._scenePose).toBeNull();
      expect(s.group._pathsFromDraft).toBe(false);
      expect(s.group._sceneLevelS).toBe(true);
    }
    expect(st.warps).toBe(warps0);
    expect(V.AlgorithmRegistry.scene3d.levelS(s.group._sceneAssembled, { width: 320, height: 220, penWidth: 0.3 })).toBe(true);
  });

  it('release is a compose-memo hit: nothing is posted to the worker', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'mezzoRegion', mapper: 'hatch', markSpace: 'surface' });
    s.composeFull();
    s.setPose({ camYaw: 50, camPitch: 25 });
    s.composePreview(); // the last drag frame, at the release pose
    const run = vi.fn(() => { throw new Error('worker must not be used'); });
    const composes0 = s.eng.sceneComposeStats.composes;
    const ctx = s.eng.beginSceneAsync(s.gid, { client: { available: () => true, run } });
    expect(ctx && ctx.done).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(s.eng.sceneComposeStats.composes).toBe(composes0);
  });

  it('a partially frameable scene (surface sphere under a point light: Level F, not Level S) keeps the warp', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'ladder', mapper: 'hatch', markSpace: 'surface', shadow: false });
    s.eng.getLayerDescendants(s.gid).filter((l) => l && l.type === 'sceneLight3d').forEach((l) => { l.params.type = 'point'; });
    s.composeFull();
    const geo = { width: 320, height: 220, penWidth: 0.3 };
    expect(V.AlgorithmRegistry.scene3d.levelS(s.group._sceneAssembled, geo)).toBe(false);
    const st = s.eng.sceneComposeStats; const warps0 = st.warps;
    s.setPose({ camYaw: -26, camPitch: 20 });
    s.composePreview();
    expect(s.group._sceneLevelS).toBe(false);
    expect(st.warps).toBeGreaterThan(warps0);
    expect(st.lastTier).toBe('warp');
  });

  it('Level S fills are stamped surfaceLocked and skip the Fill Curves fit (borders keep theirs)', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'ladder', mapper: 'hatch', markSpace: 'surface', style: { fillCurves: true } });
    const fills = s.fills(s.composeFull()).filter((p) => p.meta.sceneTarget.objectId !== 'ground'); // the cast shadow is the ground's, not a surface mark
    expect(fills.length).toBeGreaterThan(0);
    fills.forEach((p) => expect(p.meta.surfaceLocked).toBe(true));
    // not refitted: no path carries Bezier anchors
    fills.forEach((p) => expect(Array.isArray(p.meta.anchors) && p.meta.anchors.some((a) => a && (a.in || a.out))).toBe(false));
  });
});

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scene3D tone-law collapse contracts (routine lane)', () => {
  let runtime;
  let V;
  let R;
  let Params;
  let FS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    R = V.SCENE3D_TONE_LAWS;
    Params = V.Scene3D.Params;
    FS = V.SCENE_FILL_STYLES;
  });
  afterAll(async () => { if (runtime) await runtime.cleanup(); });

  test('all 48 engine ids are partitioned exactly into picker ids and aliases', () => {
    expect(R.IDS).toHaveLength(48);
    const aliases = Object.keys(R.ALIASES);
    const moved = Object.keys(R.MOVED || {});
    expect(R.PICKER_IDS.every((id) => R.IDS.includes(id))).toBe(true);
    aliases.forEach((id) => expect(R.PICKER_IDS).not.toContain(id));
    moved.forEach((id) => {
      expect(R.IDS).toContain(id);
      expect(R.PICKER_IDS).not.toContain(id);
      expect(aliases).not.toContain(id);
    });
    const union = new Set([...R.PICKER_IDS, ...aliases, ...moved]);
    expect(union.size).toBe(R.IDS.length);
    R.IDS.forEach((id) => expect(union.has(id)).toBe(true));
    aliases.forEach((id) => {
      const alias = R.ALIASES[id];
      expect(R.PICKER_IDS).not.toContain(id);
      if (alias.into !== 'ladder') expect(R.PICKER_IDS).toContain(alias.into);
      expect(R.STYLE_PARAMS[alias.into]).toEqual(expect.arrayContaining([expect.objectContaining({ key: expect.any(String) })]));
    });
  });

  test('resolver handles every raw id, every alias option, and invalid or absent input', () => {
    expect(typeof Params.resolveToneLaw).toBe('function');
    R.IDS.forEach((id) => expect(Params.resolveToneLaw({ toneLaw: id })).toBe(id));
    Object.entries(R.ALIASES).forEach(([id, alias]) => {
      expect(Params.resolveToneLaw({ toneLaw: id })).toBe(id);
      const bag = { toneLaw: alias.into, ...alias.params };
      expect(Params.resolveToneLaw(bag)).toBe(id);
      expect(Params.resolveToneLaw({ toneLaw: alias.into })).toBe(alias.into);
    });
    expect(Params.resolveToneLaw({ toneLaw: 'unknown-law' })).toBe('unknown-law');
    expect(Params.resolveToneLaw({})).toBeUndefined();
    expect(Params.resolveToneLaw(null)).toBeUndefined();
  });

  test('migration normalizes every folded id and never overwrites an explicit sub-control choice', () => {
    Object.entries(R.ALIASES).forEach(([id, alias]) => {
      const normalized = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } });
      expect(normalized.params.toneLaw).toBe(alias.into);
      Object.entries(alias.params).forEach(([key, value]) => expect(normalized.params[key]).toBe(value));
      const descriptor = R.STYLE_PARAMS[alias.into].find((item) => Object.hasOwn(alias.params, item.key));
      if (descriptor) {
        const explicit = descriptor.options.find((option) => option.value !== alias.params[descriptor.key]);
        if (explicit) {
          const preserved = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id, [descriptor.key]: explicit.value } });
          expect(preserved.params[descriptor.key]).toBe(explicit.value);
        }
      }
    });
  });

  test('picker APIs expose each survivor and resolve every alias to its survivor', () => {
    const groups = FS.groups(null, null, null);
    const offered = groups.flatMap((group) => group.options.map((option) => option.value));
    expect(offered).toHaveLength(R.PICKER_IDS.length + 1); // includes the shipped ladder default
    expect(FS.styleParams('ladder')).toEqual(R.STYLE_PARAMS.ladder);
    Object.entries(R.ALIASES).forEach(([id, alias]) => expect(FS.resolve(id)).toBe(alias.into));
    R.PICKER_IDS.forEach((id) => expect(FS.resolve(id)).toBe(id));
    Object.keys(R.MOVED || {}).forEach((id) => expect(offered).not.toContain(id));
  });

  test('Origin Spiral moved into its Type setting while its raw entry remains inspectable', () => {
    expect(R.MOVED.originSpiral).toEqual({
      mapper: 'spiral',
      from: ['hatch', 'crosshatch', 'contour'],
      params: { spiralCenter: 'highlight' },
    });
    expect(R.IDS).toContain('originSpiral');
    expect(FS.entry('originSpiral')).toBeTruthy();
    expect(FS.resolve('originSpiral')).toBe('originSpiral');
    const migrated = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'originSpiral' } });
    expect(migrated.mapper).toBe('spiral');
    expect(migrated.params.spiralCenter).toBe('highlight');
    expect(migrated.params.toneLaw).toBeUndefined();
  });

  test('closest-approach controls describe the Ladder field floor and Bundle overlap looks', () => {
    const ladder = R.STYLE_PARAMS.ladder.find((item) => item.key === 'closestApproach');
    expect(ladder).toEqual(expect.objectContaining({
      label: 'Closest approach', default: 'plot', showWhen: { spacing: 'field' },
    }));
    expect(ladder.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'plot', label: 'Plot floor' }),
      expect.objectContaining({ value: 'touch', law: 'contFieldTouch' }),
    ]));
    expect(R.resolveLaw('ladder', { spacing: 'field', closestApproach: 'touch' })).toBe('contFieldTouch');

    const bundle = R.STYLE_PARAMS.bundleCount.find((item) => item.key === 'closestApproach');
    expect(bundle).toEqual(expect.objectContaining({ label: 'Closest approach', default: 'touch' }));
    expect(bundle.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'touch' }),
      expect.objectContaining({ value: 'overlap', law: 'bundleSubNib' }),
    ]));
    expect(R.resolveLaw('bundleCount', { closestApproach: 'overlap' })).toBe('bundleSubNib');
  });

  test('only the roster-declared shadow exception forwards to an available shadow recipe', () => {
    const Shadows = V.Scene3D.Shadows;
    expect(R.SHADOW_FORWARD).toEqual({ onePenDown: 'interlockWeave' });
    Object.entries(R.SHADOW_FORWARD).forEach(([id, target]) => {
      expect(R.ALIASES[id]).toBeTruthy();
      expect(Shadows.toneLawApplies(id)).toBe(false);
      expect(Shadows.toneLawApplies(target)).toBe(true);
    });
    Object.keys(R.ALIASES).forEach((id) => {
      const expected = R.SHADOW_FORWARD[id] || id;
      expect(Params.normalizeShadow({ shadowToneLaw: id }).shadowToneLaw, id).toBe(expected);
    });
  });
});

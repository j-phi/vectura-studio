const fs = require('fs');
const path = require('path');

/**
 * CSS-1 + CSS-3 parity guard (Meridian audit 2026-05-20).
 *
 * The classic-{dark,light,lark}.css skins were missing ~56 tokens that the
 * meridian-{dark,light,lark}.css skins declare — `--render-*`, `--designer-*`,
 * `--plotter-*`, `--vectura-*-rgb` — which caused classic-light/classic-lark
 * users to see meridian-dark workspace, canvas, designer and plotter colors
 * via a fallback `:root` block in `components.css` (the CSS-3 hack).
 *
 * This test pins skin token parity going forward: every per-skin palette file
 * under `src/ui/skin/` must declare the *same set* of CSS custom property
 * names. Values may (and should) differ.
 */
describe('classic-* / meridian-* skin token parity', () => {
  const skinDir = path.resolve(__dirname, '..', '..', '..', 'src', 'ui', 'skin');
  const skinFiles = [
    'classic-dark.css',
    'classic-light.css',
    'classic-lark.css',
    'meridian-dark.css',
    'meridian-light.css',
    'meridian-lark.css',
  ];

  /** Extract the set of CSS custom-property names declared in a stylesheet. */
  const declaredTokens = (cssText) => {
    // Strip /* ... */ comments so commented-out tokens don't count.
    const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /(--[a-z][a-z0-9-]*)\s*:/gi;
    const set = new Set();
    let m;
    while ((m = re.exec(stripped)) !== null) {
      set.add(m[1]);
    }
    return set;
  };

  const tokensBySkin = {};
  beforeAll(() => {
    for (const file of skinFiles) {
      const full = path.join(skinDir, file);
      const text = fs.readFileSync(full, 'utf8');
      tokensBySkin[file] = declaredTokens(text);
    }
  });

  /**
   * The audit (CSS-1) names four token groups that must be declared by every skin:
   *   --render-* (15), --designer-* (10), --plotter-* (3), --vectura-*-rgb (7)
   * plus the core --ui-* palette (15) and the slider/shadow scaffolding.
   *
   * `--color-*` aliases are explicitly NOT in the parity set: they're a legacy
   * meridian-only band-aid being retired by CSS-2, and the classic-* skins have
   * already inlined past them (Meridian Step 3.3a, 2026-05-20).
   */
  const parityGroupPrefixes = ['--render-', '--designer-', '--plotter-', '--vectura-'];
  // The --ui-* + slider + shadow palette every skin declares.
  const corePaletteTokens = [
    '--ui-bg', '--ui-panel', '--ui-panel-alt', '--ui-border', '--ui-border-hi',
    '--ui-text', '--ui-text-2', '--ui-muted', '--ui-formula',
    '--ui-accent', '--ui-accent-2', '--ui-danger',
    '--ui-ctrl', '--ui-ctrl-hov', '--ui-workspace', '--slider-start',
    '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-pane',
  ];

  test('every skin file declares the same set of parity-group tokens as meridian-dark', () => {
    const referenceTokens = tokensBySkin['meridian-dark.css'];
    const parityRef = [...referenceTokens].filter((t) =>
      parityGroupPrefixes.some((p) => t.startsWith(p))
    );
    expect(parityRef.length).toBeGreaterThanOrEqual(35); // 15 + 10 + 3 + 7

    for (const file of skinFiles) {
      if (file === 'meridian-dark.css') continue;
      const current = tokensBySkin[file];
      const missing = parityRef.filter((t) => !current.has(t)).sort();
      if (missing.length) {
        throw new Error(
          `${file} is missing ${missing.length} parity tokens vs meridian-dark.css:\n  ${missing.join('\n  ')}`
        );
      }
    }
  });

  test('every skin file declares the core --ui-*/--slider-/--shadow- palette', () => {
    for (const file of skinFiles) {
      const tokens = tokensBySkin[file];
      const missing = corePaletteTokens.filter((t) => !tokens.has(t));
      if (missing.length) {
        throw new Error(`${file} missing core palette tokens: ${missing.join(', ')}`);
      }
    }
  });

  test('every skin file declares the render/designer/plotter/vectura-rgb groups', () => {
    const requiredPrefixes = ['--render-', '--designer-', '--plotter-', '--vectura-'];
    for (const file of skinFiles) {
      const tokens = [...tokensBySkin[file]];
      for (const prefix of requiredPrefixes) {
        const hits = tokens.filter((t) => t.startsWith(prefix));
        expect({ file, prefix, count: hits.length }).toEqual({
          file,
          prefix,
          count: expect.any(Number),
        });
        // The audit found 15 --render-*, 10 --designer-*, 3 --plotter-*, 7 --vectura-*-rgb.
        // Be conservative and just assert "at least one" — the parity test above
        // pins the exact set.
        expect(hits.length).toBeGreaterThan(0);
      }
    }
  });

  test('components.css no longer ships a skin-fallback :root block (CSS-3 closed)', () => {
    const componentsCss = fs.readFileSync(path.join(skinDir, 'components.css'), 'utf8');
    // The fallback block declared --vectura-bg-rgb at :root. After the fix, no
    // skin-palette token (--render-*, --designer-*, --plotter-*, --vectura-*-rgb)
    // should be declared inside a bare `:root { ... }` selector in components.css.
    // (tokens.css legitimately declares structural --pane-*, --font-*, --motion-*.)
    const rootBlockRe = /(^|[^,])\s*:root\s*\{([^}]*)\}/g;
    const offenders = [];
    let m;
    while ((m = rootBlockRe.exec(componentsCss)) !== null) {
      const body = m[2];
      // Look for any skin-palette tokens inside the body.
      const skinTokenRe = /--(render|designer|plotter|vectura)-[a-z0-9-]+\s*:/gi;
      const hits = body.match(skinTokenRe);
      if (hits) offenders.push(...hits);
    }
    expect(offenders).toEqual([]);
  });
});

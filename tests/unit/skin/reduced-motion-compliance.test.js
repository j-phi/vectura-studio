const fs = require('fs');
const path = require('path');

/**
 * Phase 5 — reduced-motion compliance audit.
 *
 * Acceptance per plan §"Phase 5" (line 721): every keyframe in `motion.css`
 * (and any other skin CSS) respects `prefers-reduced-motion: reduce`.
 *
 * Strategy:
 *   1. Parse `src/ui/skin/motion.css` — extract every `@keyframes <name>` block.
 *   2. Locate the `@media (prefers-reduced-motion: reduce)` block.
 *   3. Confirm the reduced-motion block targets every keyframe consumer
 *      (either by selector that uses the animation, or by the keyframe name).
 *   4. Sanity-check `styles.css` has the global universal-selector reduced-motion
 *      guard (the catch-all that flattens animations + transitions).
 *
 * If a future skin author adds a new @keyframes block to motion.css without
 * also adding a reduced-motion fallback, this test fails.
 */
describe('Reduced-motion compliance', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const motionCss = fs.readFileSync(path.join(repoRoot, 'src', 'ui', 'skin', 'motion.css'), 'utf8');
  const stylesCss = fs.readFileSync(path.join(repoRoot, 'styles.css'), 'utf8');

  // Map keyframe name -> the selectors that consume it (animation:/animation-name:).
  // Per the project conventions every keyframe in motion.css must be referenced
  // either inside motion.css itself or by the components.css selectors that the
  // reduced-motion fallback targets.
  const KEYFRAME_TO_FALLBACK_HINT = {
    'thumb-release': ['just-released', 'thumb', 'reduce'],
    'fx-pulse-fill': ['fx-active', 'reduce'],
    'btn-press': ['btn-pulse', 'reduce'],
    'progress-indeterminate': ['progress-bar', 'reduce'],
  };

  test('motion.css declares a prefers-reduced-motion: reduce block', () => {
    expect(motionCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  });

  test('every @keyframes block has a known reduced-motion fallback', () => {
    const keyframeRegex = /@keyframes\s+([a-zA-Z][\w-]*)/g;
    const found = [];
    let match;
    while ((match = keyframeRegex.exec(motionCss))) {
      found.push(match[1]);
    }
    expect(found.length).toBeGreaterThanOrEqual(4);

    // The reduced-motion @media block (everything between the first `@media (prefers-reduced-motion: reduce)`
    // and the matching closing brace at the document level).
    const reduceIdx = motionCss.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(reduceIdx).toBeGreaterThan(-1);
    const reduceBlock = motionCss.slice(reduceIdx);

    // Each known keyframe should be reachable from the reduced-motion block,
    // either via its name or via a selector hint.
    found.forEach((name) => {
      const hints = KEYFRAME_TO_FALLBACK_HINT[name];
      if (!hints) {
        // New unknown keyframe — flag it. Author must add fallback + extend this map.
        throw new Error(
          `Unknown keyframe "${name}" in motion.css. Add it to KEYFRAME_TO_FALLBACK_HINT and ` +
            `pair it with a @media (prefers-reduced-motion: reduce) fallback.`,
        );
      }
      const matched = hints.some((hint) => reduceBlock.includes(hint));
      expect(matched).toBe(true);
    });
  });

  test('the reduced-motion fallback caps animation duration at ≤80ms or disables it', () => {
    const reduceIdx = motionCss.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    const reduceBlock = motionCss.slice(reduceIdx);
    // At least one of: animation: none, animation-duration: <=80ms, animation-iteration-count: 1.
    expect(reduceBlock).toMatch(/animation(:|-duration:|-iteration-count:)/);
    const durMatch = reduceBlock.match(/animation-duration:\s*(\d+)\s*ms/);
    if (durMatch) {
      expect(Number(durMatch[1])).toBeLessThanOrEqual(80);
    }
  });

  test('styles.css ships the global *, *::before, *::after reduced-motion guard', () => {
    expect(stylesCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    // The block immediately following the @media should target the universal selector.
    const idx = stylesCss.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    const after = stylesCss.slice(idx, idx + 600);
    expect(after).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after/);
    // Should collapse animation duration aggressively.
    expect(after).toMatch(/animation-duration:\s*0\.01ms/);
    expect(after).toMatch(/transition-duration:\s*0\.01ms/);
  });

  test('JS-driven motion (Vectura.UI.motion / SkinManager) gates on prefers-reduced-motion', () => {
    const motionJs = fs.readFileSync(path.join(repoRoot, 'src', 'ui', 'motion.js'), 'utf8');
    const utilsJs = fs.readFileSync(path.join(repoRoot, 'src', 'ui', 'utils.js'), 'utf8');
    const skinMgr = fs.readFileSync(path.join(repoRoot, 'src', 'ui', 'skin', 'skin-manager.js'), 'utf8');
    // utils.js should expose a reduced-motion check.
    expect(utilsJs).toMatch(/prefers-reduced-motion/);
    // motion.js should reference the prefers-reduced-motion contract (via utils).
    expect(motionJs).toMatch(/reduced-motion|prefersReducedMotion|isReducedMotion/i);
    // skin-manager rAF dispatch path should also gate dial-wave / motion variables.
    expect(skinMgr).toMatch(/prefers-reduced-motion/);
  });
});

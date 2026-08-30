/**
 * Fetches the pre-F3-fix revision of `surface-fill.js` from git history so an
 * RGR test can prove RED against it without checking out another commit in a
 * shared worktree (`.claude/worktrees/sf-integration` is a single tracked
 * tree — a `git checkout` there would collide with any other session reading
 * or writing it). Feed the result to `loadVecturaRuntime`'s `scriptOverrides`
 * option.
 *
 * `PRE_WIP_SHA` is the commit immediately BEFORE 439319c0 ("wip(scene3d): F3
 * sub-pen ribbon fix — PAUSED mid-implementation"), i.e. the tree the WIP
 * commit diffs against.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const PRE_WIP_SHA = '1b157bc6';
const REL_PATH = 'src/core/scene3d/surface-fill.js';

let cached = null;

const getPreWipSurfaceFillSource = () => {
  if (cached) return cached;
  const rootDir = path.resolve(__dirname, '../..');
  cached = execFileSync('git', ['show', `${PRE_WIP_SHA}:${REL_PATH}`], {
    cwd: rootDir,
    maxBuffer: 1024 * 1024 * 64,
  }).toString('utf8');
  return cached;
};

/**
 * RGR RED switch. With `VECTURA_PRE_WIP=1` in the environment this returns
 * `loadVecturaRuntime` options that swap `surface-fill.js` for its pre-fix
 * revision, so the SAME assertions run against the old code and must FAIL.
 * Without the variable it returns `{}` and the test runs normally (GREEN).
 *
 *   VECTURA_PRE_WIP=1 npx vitest run tests/unit/scene3d-ribbon-*.test.js
 *
 * A test whose assertions still PASS under that env var is not proving
 * anything — it is not a regression test for this fix.
 */
const preWipRuntimeOptions = () => (
  process.env.VECTURA_PRE_WIP === '1'
    ? { scriptOverrides: { [REL_PATH]: getPreWipSurfaceFillSource() } }
    : {}
);

module.exports = { getPreWipSurfaceFillSource, preWipRuntimeOptions, PRE_WIP_SHA, REL_PATH };

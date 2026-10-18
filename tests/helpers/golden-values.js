/**
 * Committed golden values for drift guards.
 *
 * A drift guard says "this output must not change". It reads the expected
 * value from `tests/baselines/golden-values/<name>.json`, never from git
 * history, so it works in a shallow clone.
 *
 *   const golden = goldenValues('scene3d-mkdashramp-discrete');
 *   golden.expect('ladder/sphere/d=1', md5(paths));
 *
 * PER ARCHITECTURE. V8's Math.sin/cos/exp/atan2/... round the last ULP
 * differently on arm64 and x86_64 (see scene3d-u2-kernel-identity.test.js),
 * so a hash of float output holds on one architecture only. Each file keeps
 * one section per architecture. The values hold on Node 20 (CI's pinned
 * major, .nvmrc) only; other majors round differently again. On another
 * major a check fails in CI (CI is set), prints a one-line warning and
 * passes unchecked locally, and update mode refuses to write.
 *
 * REGENERATION (deliberate only):
 *   npm run test:update                       # this machine's architecture
 *   scripts/test-update-goldens-x64.sh        # the x64 section, in a linux/amd64 container
 * With VECTURA_UPDATE_BASELINES=1 each `expect` records the live value into
 * this architecture's section and rewrites the file. Regenerate only when
 * the output changed on purpose, and say so in the commit. Never regenerate
 * to make a drift pass.
 *
 * A missing file, architecture section or key fails loudly.
 */
const fs = require('fs');
const path = require('path');

// VECTURA_GOLDEN_VALUES_DIR exists only for the helper's own unit test.
const GOLDEN_DIR = process.env.VECTURA_GOLDEN_VALUES_DIR || path.resolve(__dirname, '../baselines/golden-values');
const UPDATE = process.env.VECTURA_UPDATE_BASELINES === '1';
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const GOLDEN_NODE_MAJOR = 20;
// VECTURA_GOLDEN_NODE_MAJOR (the detected major, overridden) exists only for the helper's own unit test.
const NODE_MAJOR = Number(process.env.VECTURA_GOLDEN_NODE_MAJOR || process.versions.node.split('.')[0]);
const IN_CI = !!process.env.CI;
let warnedOffNode = false;
const offNodeMessage = () => `Golden values hold on Node ${GOLDEN_NODE_MAJOR} only; this is Node ${NODE_MAJOR}.`;

const goldenValues = (name) => {
  const file = path.join(GOLDEN_DIR, `${name}.json`);
  const stored = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const recorded = {};

  const write = () => {
    const doc = stored && !Array.isArray(stored) ? { ...stored } : {};
    const sorted = {};
    Object.keys(recorded).sort().forEach((key) => { sorted[key] = recorded[key]; });
    doc[ARCH] = sorted;
    const out = {};
    Object.keys(doc).sort().forEach((arch) => { out[arch] = doc[arch]; });
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  };

  const rel = path.relative(path.resolve(__dirname, '../..'), file);
  const regen = 'Generate it with npm run test:update (and scripts/test-update-goldens-x64.sh for x64).';

  return {
    file,
    expect(key, actual) {
      if (UPDATE) {
        if (NODE_MAJOR !== GOLDEN_NODE_MAJOR) throw new Error(`${offNodeMessage()} Refusing to write ${rel}: regenerate on Node ${GOLDEN_NODE_MAJOR}.`);
        recorded[key] = actual;
        write();
        return;
      }
      if (!stored) throw new Error(`Golden file ${rel} is missing. ${regen}`);
      const section = stored[ARCH];
      if (!section) throw new Error(`Golden file ${rel} has no ${ARCH} section. ${regen}`);
      if (!Object.prototype.hasOwnProperty.call(section, key)) {
        throw new Error(`Golden key "${key}" is missing from the ${ARCH} section of ${rel}. ${regen}`);
      }
      if (NODE_MAJOR !== GOLDEN_NODE_MAJOR) {
        if (IN_CI) throw new Error(`${offNodeMessage()} CI must run golden checks on Node ${GOLDEN_NODE_MAJOR} (${rel} at "${key}").`);
        if (!warnedOffNode) {
          warnedOffNode = true;
          console.warn(`[golden-values] WARNING: ${offNodeMessage()} Golden checks are NOT enforced in this run; use Node ${GOLDEN_NODE_MAJOR}.`);
        }
        return;
      }
      expect(actual, `Golden drift in ${rel} at "${key}" (${ARCH}). If the output changed ON PURPOSE, `
        + 'regenerate with npm run test:update and say so in the commit.').toEqual(section[key]);
    },
  };
};

module.exports = { goldenValues, GOLDEN_DIR, GOLDEN_NODE_MAJOR };

const fs = require('fs');
const path = require('path');

/**
 * R-16: e2e review screenshots never land in docs/. They go to test-results/evidence/ and only
 * when VECTURA_E2E_EVIDENCE=1 (or an evidence dir env var) asks for them.
 */
const ROOT = path.resolve(__dirname, '../..');
const E2E = path.join(ROOT, 'tests/e2e');
const helperPath = path.join(E2E, 'helpers/evidence.js');

const listJs = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!entry.name.endsWith('-snapshots')) listJs(full, out); } else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};

const withEnv = (env, fn) => {
  const keys = ['VECTURA_E2E_EVIDENCE', 'VECTURA_E2E_EVIDENCE_DIR', 'TUX_EVIDENCE_DIR'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

describe('e2e evidence screenshots', () => {
  it('no e2e file writes to docs/ (comments may still name the old place)', () => {
    const offenders = [];
    for (const file of listJs(E2E)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if ((/docs\/touch-audit\/evidence/.test(line) || /'docs',\s*'touch-audit',\s*'evidence'/.test(line)) && !/^\s*\/\//.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('defaults to test-results/evidence and is off unless asked for', async () => {
    const { evidenceDir, evidenceEnabled, shoot } = require(helperPath);
    await withEnv({}, async () => {
      expect(evidenceDir('TUX-037')).toBe(path.join(ROOT, 'test-results', 'evidence', 'TUX-037'));
      expect(evidenceEnabled()).toBe(false);
      let calls = 0;
      await shoot({ screenshot: () => { calls += 1; } }, { path: path.join(ROOT, 'test-results/evidence/x/never.png') });
      expect(calls).toBe(0);
    });
    withEnv({ VECTURA_E2E_EVIDENCE: '1' }, () => expect(evidenceEnabled()).toBe(true));
    withEnv({ VECTURA_E2E_EVIDENCE_DIR: '/tmp/ev' }, () => expect(evidenceDir('a')).toBe(path.join('/tmp/ev', 'a')));
  });
});

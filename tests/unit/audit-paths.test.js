const fs = require('fs');
const path = require('path');
const Module = require('module');

/**
 * R-17: tests/audit runs on a PR only when the diff matches scripts/audit-paths.js. That skip is
 * sound only if every file an audit test loads, reads or evaluates matches the filter. This file
 * fails when an audit test (or a helper it requires) reaches a source file outside it.
 */
const ROOT = path.resolve(__dirname, '../..');
const auditPaths = require('../../scripts/audit-paths.js');
const { SCENE3D_FILES } = require('../helpers/runtime-profiles');
const { loadScene3dAuditRuntime } = require('../helpers/scene3d-audit-runtime');

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const auditTests = auditPaths.auditFiles(ROOT).map((file) => path.join(ROOT, file));

// Every repo file reachable from the audit tests through require()/import.
function requireClosure(entries) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:require\(|from\s+|import\()\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const resolved = Module._resolveFilename(path.resolve(path.dirname(file), spec), null, false);
      if (!resolved.includes(`${path.sep}node_modules${path.sep}`)) visit(resolved);
    }
  };
  entries.forEach(visit);
  return [...seen];
}

const closure = requireClosure(auditTests);
// The guarded loader and the generic loader it wraps may evaluate scripts; nothing else may.
const LOADERS = ['tests/helpers/scene3d-audit-runtime.js', 'tests/helpers/load-vectura-runtime.js'];

describe('audit path filter covers everything the audits touch (R-17)', () => {
  it('finds the audit tests and their helpers', () => {
    expect(auditTests.length).toBeGreaterThanOrEqual(10);
    expect(closure.map(rel)).toContain('tests/helpers/scene3d-audit-runtime.js');
  });

  it('every file the audits require is in the filter', () => {
    const outside = closure.map(rel).filter((file) => !auditPaths.matches(file));
    expect(outside).toEqual([]);
  });

  it('every audit runtime goes through the guarded Scene3D loader', () => {
    for (const file of closure.map(rel).filter((f) => !LOADERS.includes(f))) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/loadVecturaRuntime|load-vectura-runtime|require\(['"](node:)?vm['"]\)|new Function\(/);
    }
  });

  it('every source path an audit names (reads, mutant overrides) is in the filter', () => {
    // The generic loaders name app files only to skip them; what they evaluate is checked below.
    const named = new Set();
    for (const file of closure.filter((f) => !LOADERS.includes(rel(f)))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/['"`](?:\.\.\/)*((?:src|index\.html)[^'"`\s]*)['"`]/g)) named.add(match[1]);
    }
    expect(named.size).toBeGreaterThan(0);
    const outside = [...named].filter((file) => file.endsWith('.js') && !auditPaths.matches(file));
    expect(outside).toEqual([]);
  });

  it('every golden-values file an audit reads is in the filter', () => {
    const goldens = new Set();
    // The helper itself only names example keys in its docs.
    for (const file of closure.filter((f) => rel(f) !== 'tests/helpers/golden-values.js')) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/goldenValues\(\s*['"`]([^'"`]+)['"`]/g)) goldens.add(`tests/baselines/golden-values/${match[1]}.json`);
    }
    expect([...goldens]).toContain('tests/baselines/golden-values/scene3d-golden-corpus.json');
    expect([...goldens].filter((file) => !auditPaths.matches(file))).toEqual([]);
    expect(auditPaths.matches('tests/baselines/golden-values/scene3d-seed.json')).toBe(false);
  });

  it('every script the audit runtime evaluates is in the filter', async () => {
    const runtime = await loadScene3dAuditRuntime();
    try {
      const scripts = runtime.scripts.map((src) => src.replace(/^\.\//, '').replace(/\?.*$/, ''));
      expect(scripts.length).toBe(SCENE3D_FILES.length);
      expect(scripts.filter((file) => !auditPaths.matches(file))).toEqual([]);
    } finally {
      runtime.cleanup();
    }
    for (const file of SCENE3D_FILES) expect(auditPaths.matches(file), file).toBe(true);
  });
});

describe('audit routing decision', () => {
  it('runs the audits for Scene3D, shared geometry, manifest, test and infra paths', () => {
    for (const file of [
      'src/core/scene3d/surface-fill.js', 'src/config/scene3d-tone-laws.js', 'src/core/algorithms/scene3d.js',
      'src/core/algorithms/geometry3d.js', 'src/core/path-boolean.js', 'src/core/pen-fill.js',
      'src/core/engine.js', 'src/config/defaults.js', 'tests/audit/x.test.js', 'tests/helpers/y.js', 'tests/fixtures/z.json',
      'vitest.config.mjs', 'vitest.coverage-shard.config.mjs', 'scripts/run-vitest.js', 'scripts/test-shard-plan.js',
      'package.json', 'package-lock.json', '.github/workflows/test.yml', '.github/actions/setup-playwright/action.yml',
    ]) expect(auditPaths.decide([file]).run, file).toBe(true);
  });

  it('skips the audits for paths that cannot affect them', () => {
    for (const file of ['README.md', 'docs/testing.md', 'src/ui/ui.js', 'src/render/renderer.js', 'src/core/algorithms/spiral.js', 'tests/unit/a.test.js', 'tests/e2e/b.spec.js', 'src/config/presets-x.js']) {
      expect(auditPaths.decide([file]).run, file).toBe(false);
    }
    expect(auditPaths.decide(['README.md', 'src/core/scene3d/mesh.js']).run).toBe(true);
  });

  it('runs the audits when the diff is unknown', () => {
    expect(auditPaths.decide(null).run).toBe(true);
    expect(auditPaths.changedFiles('', 'HEAD')).toBeNull();
    expect(auditPaths.changedFiles('0'.repeat(40), 'HEAD')).toBeNull();
    expect(auditPaths.changedFiles('a'.repeat(40), 'HEAD', { exec: () => { throw new Error('bad object'); } })).toBeNull();
    expect(auditPaths.changedFiles('a'.repeat(40), 'HEAD', { exec: () => 'src/ui/ui.js\n\nREADME.md\n' })).toEqual(['src/ui/ui.js', 'README.md']);
  });

  it('runs the audits when index.html changes the manifest script list, not for a version badge bump', () => {
    // The real index.html: every manifest file is listed, in the order the audit runtime reads.
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const order = auditPaths.manifestScriptOrder(html);
    expect([...order].sort()).toEqual([...SCENE3D_FILES].sort());
    const [first, second] = order;
    const tag = (file) => new RegExp(`\\s*<script[^>]*src="\\./${file.replace(/[.]/g, '\\.')}[^"]*"[^>]*></script>`);
    const variants = {
      'version badge bump': html.replace(/\?v=[0-9.]+/g, '?v=99.0.0'),
      'non-manifest script added': html.replace('</body>', '<script src="./src/ui/new-panel.js?v=1" defer></script>\n</body>'),
      'manifest script removed': html.replace(tag(second), ''),
      'manifest scripts reordered': html.replace(tag(first), '').replace('</body>', `<script src="./${first}?v=1" defer></script>\n</body>`),
    };
    expect(variants['manifest script removed']).not.toBe(html);
    const exec = (texts) => (cmd, args) => { const rev = args[1].split(':')[0]; if (!(rev in texts)) throw new Error('bad object'); return texts[rev]; };
    const changed = (variant) => auditPaths.manifestScriptsChanged('base', 'head', { exec: exec({ base: html, head: variants[variant] }) });
    expect(changed('version badge bump')).toBe(false);
    expect(changed('non-manifest script added')).toBe(false);
    expect(changed('manifest script removed')).toBe(true);
    expect(changed('manifest scripts reordered')).toBe(true);
    // A side that cannot be read counts as a change.
    expect(auditPaths.manifestScriptsChanged('base', 'head', { exec: exec({ base: html }) })).toBe(true);
    // decide() asks only when index.html is in a diff with no other audit path.
    expect(auditPaths.decide(['index.html'], { indexScriptsChanged: () => false }).run).toBe(false);
    expect(auditPaths.decide(['index.html', 'README.md'], { indexScriptsChanged: () => true })).toMatchObject({ run: true, reason: expect.stringContaining('manifest script list') });
    expect(auditPaths.decide(['index.html'])).toMatchObject({ run: true });
    let asked = false;
    expect(auditPaths.decide(['README.md'], { indexScriptsChanged: () => { asked = true; return true; } }).run).toBe(false);
    expect(asked).toBe(false);
  });

  it('the audit job fails a group whose results miss a file, skip a test or report none', () => {
    const files = ['tests/audit/a.test.js', 'tests/audit/b.test.js'];
    const fileResult = (name, statuses) => ({ name: path.join(ROOT, name), status: statuses.every((st) => st === 'passed') && statuses.length ? 'passed' : 'skipped', assertionResults: statuses.map((status) => ({ status })) });
    const results = (rows) => ({ success: true, testResults: rows });
    expect(auditPaths.verifyShardResults(results([fileResult(files[0], ['passed']), fileResult(files[1], ['passed', 'passed'])]), files).passed).toBe(true);
    expect(auditPaths.verifyShardResults(results([fileResult(files[0], ['passed'])]), files).failures.join(' ')).toContain('missing inventoried test files');
    expect(auditPaths.verifyShardResults(results([fileResult(files[0], ['passed']), fileResult(files[1], ['skipped'])]), files).passed).toBe(false);
    expect(auditPaths.verifyShardResults(results([fileResult(files[0], ['passed']), fileResult(files[1], [])]), files).failures.join(' ')).toContain('no assertions reported');
    const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const audit = workflow.slice(workflow.indexOf('\n  audit:\n'), workflow.indexOf('\n  ci-ok:\n'));
    expect(audit).toContain('--outputFile.json="$RUNNER_TEMP/audit-results.json"');
    expect(audit).toContain('node scripts/audit-paths.js --verify-results "$RUNNER_TEMP/audit-results.json" "$AUDIT_SHARD/3"');
  });

  it('splits every audit file into exactly one of the workflow audit groups', () => {
    const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const audit = workflow.slice(workflow.indexOf('\n  audit:\n'), workflow.indexOf('\n  ci-ok:\n'));
    const matrix = JSON.parse(audit.match(/audit_shard: (\[[\d, ]+\])/)[1]);
    expect(audit).toContain(`--shard "$AUDIT_SHARD/${matrix.length}"`);
    const groups = matrix.map((i) => auditPaths.shardFiles(i, matrix.length));
    for (const group of groups) expect(group.length).toBeGreaterThan(0);
    expect(groups.flat().sort()).toEqual(auditPaths.auditFiles(ROOT));
    expect(() => auditPaths.shardFiles(4, 3)).toThrow();
  });
});

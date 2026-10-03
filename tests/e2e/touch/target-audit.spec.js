// Touch target + layout audit as a CI ratchet (TUX-058).
//
// One test per state, fresh page each. Measures through tests/e2e/helpers/target-audit-core.js
// and compares to tests/e2e/touch/target-baseline.json keyed baseline[platform][project][state].
// Lower-better metrics are exact; canvasPct has +/-1.0 pp. A rise fails ("rose"). A drop also
// fails ("ratchet down") until the baseline is lowered with TOUCH_BASELINE=update.
//
// Env:
//   TOUCH_AUDIT_FULL=1        all 26 states (default: the fast subset)
//   TOUCH_BASELINE=update     lower cells (never worsens). update-any also writes worse values and
//                             needs a `TUX-WAIVER:` line in the commit body.
//   TOUCH_TARGET_MODE=final   compare to the final targets instead of the baseline (not in CI)
//   TOUCH_AUDIT_SHOT_DIR=dir  save a CSS-scale screenshot of the default state per project
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const core = require('../helpers/target-audit-core');
const { STATES } = require('./target-audit-states');
const { PROJECTS } = require('./viewports');

test.use({ reducedMotion: 'reduce' });

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASELINE_FILE = path.join(__dirname, 'target-baseline.json');
const ALLOW_FILE = path.join(__dirname, 'target-allowlist.json');
const FULL = process.env.TOUCH_AUDIT_FULL === '1';
const FINAL = process.env.TOUCH_TARGET_MODE === 'final';
const UPDATE = process.env.TOUCH_BASELINE === 'update' || process.env.TOUCH_BASELINE === 'update-any';
const UPDATE_ANY = process.env.TOUCH_BASELINE === 'update-any';
const PLATFORM = process.platform === 'darwin' ? 'darwin' : 'linux';
const CHROME_PROJECT = /-chrome$/;

const readAllow = () => JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8'));
const allowFor = (project) => readAllow().filter((e) => !e.project || e.project === project);
const gitSha = () => { try { return execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { return undefined; } };

const states = STATES.filter((s) => FULL || s.fast);

for (const st of states) {
  // Chrome-variant projects only run `default` (project grepInvert on @audit-extra).
  const title = st.id === 'default' ? st.id : `${st.id} @audit-extra`;
  test(title, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    const project = testInfo.project.name;
    const spec = PROJECTS[project];
    expect(spec, `no viewport spec for project ${project}`).toBeTruthy();
    const chrome = CHROME_PROJECT.test(project);
    const metricIds = chrome ? core.CHROME_METRICS : core.METRIC_IDS;
    const t0 = Date.now();

    const errors = [];
    page.on('pageerror', (e) => { const m = String(e.message || e).slice(0, 200); if (!core.isBenignPageError(m)) errors.push(m); });

    // Boot. Fonts are asserted inside bootApp: never measure with fallback fonts.
    await core.bootApp(page, baseURL);

    // Open the state, then wait for its postcondition (no fixed sleep stands in for it).
    await st.run(page);
    await expect.poll(() => st.post(page), { timeout: 10_000, message: `${project}|${st.id}: postcondition (opener may be stale)` }).toBe(true);
    await core.waitLayoutSettled(page);
    await page.waitForTimeout(150); // layout settle only, after the postcondition

    const raw = await core.measurePage(page, {
      W: spec.width, H: spec.height, safe: core.SAFE_BANDS[spec.device], allow: allowFor(project).map((e) => e.selector),
    });
    raw.pageErrors = errors.slice(0, 5);
    raw.pageErrorCount = errors.length;
    const measured = core.summarizeState(raw);
    const count = core.onscreenCount(raw);
    const cellId = `${project}|${st.id}`;
    const elapsed = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[audit] ${cellId} ${elapsed}ms items=${count} ${JSON.stringify(measured)}`);

    core.updateJsonKey(path.join(ROOT, 'test-results', `touch-target-measured-${project}.json`), st.id, {
      measured, items: count, dockedPanes: raw.dockedPanes, layout: raw.layout, layoutViewport: raw.layoutViewport,
      scrollWidthExcess: raw.scrollWidthExcess, scale: raw.scale, pageErrors: errors.slice(0, 8), caught: raw.caught, safeVars: raw.safeVars, ghostSel: raw.ghostSel, elapsedMs: elapsed,
    });
    await testInfo.attach('measured.json', { body: JSON.stringify({ cellId, measured, items: count, dockedPanes: raw.dockedPanes }, null, 1), contentType: 'application/json' });
    if (process.env.TOUCH_AUDIT_SHOT_DIR && st.id === 'default') {
      fs.mkdirSync(process.env.TOUCH_AUDIT_SHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.TOUCH_AUDIT_SHOT_DIR, `${project}.png`), scale: 'css' });
    }

    // Hard failures (every mode).
    const issues = [];
    if (!chrome && count < st.minItems) issues.push(`${cellId}: only ${count} on-screen items, expected >= ${st.minItems} (the opener may have silently failed)`);
    raw.items.filter((i) => i.allow && i.onscreen && i.reach && !i.min24).forEach((i) => issues.push(`${cellId}: allowlisted target ${i.sel} is under 24 px (${i.pw}x${i.ph})`));

    if (FINAL) {
      issues.push(...core.compareFinal(measured, { device: spec.device, state: st.id, dockedPanes: raw.dockedPanes, chrome }).map((m) => `${cellId}: ${m}`));
    } else {
      const base = (core.readBaseline(BASELINE_FILE)[PLATFORM] || {})[project];
      const cell = base ? base[st.id] : undefined;
      const platformKnown = !!core.readBaseline(BASELINE_FILE)[PLATFORM];
      if (cell) {
        const cmp = core.compareCell(cell, measured, undefined, metricIds);
        if (UPDATE) {
          core.updateBaselineCell(BASELINE_FILE, PLATFORM, project, st.id, measured, { metricIds, any: UPDATE_ANY, measuredAt: gitSha() });
          if (!UPDATE_ANY) issues.push(...core.formatCompare(cellId, { worse: cmp.worse, better: [] }));
        } else {
          issues.push(...core.formatCompare(cellId, cmp));
        }
      } else if (UPDATE) {
        core.updateBaselineCell(BASELINE_FILE, PLATFORM, project, st.id, measured, { metricIds, any: true, measuredAt: gitSha() });
      } else if (!platformKnown && PLATFORM === 'linux') {
        // Soft only so the first Linux CI run can seed the linux section. Never a pass mode on darwin.
        testInfo.annotations.push({ type: 'baseline-missing', description: cellId });
      } else {
        issues.push(`${cellId}: no ${PLATFORM} baseline cell; run TOUCH_BASELINE=update`);
      }
    }
    expect(issues.join('\n') || 'ok', issues.join('\n')).toBe('ok');
  });
}

test('allowlist is small, justified and every entry is at least 24 px', async ({ page, baseURL }, testInfo) => {
  const entries = readAllow();
  expect(entries.length).toBeLessThanOrEqual(10);
  entries.forEach((e) => {
    expect(typeof e.selector === 'string' && e.selector.length > 0, 'allowlist entry needs a selector').toBe(true);
    expect(typeof e.reason === 'string' && e.reason.trim().length > 0, `allowlist entry ${e.selector} needs a reason`).toBe(true);
  });
  const mine = entries.filter((e) => !e.project || e.project === testInfo.project.name);
  if (!mine.length) return;
  await core.bootApp(page, baseURL);
  for (const e of mine) {
    const handle = await page.locator(e.selector).first().elementHandle({ timeout: 1000 }).catch(() => null);
    if (!handle) continue;
    const a = await core.probeHit(page, handle, { probe: 2, radius: 24 });
    expect(a.w, `allowlisted ${e.selector} probed width`).toBeGreaterThanOrEqual(24);
    expect(a.h, `allowlisted ${e.selector} probed height`).toBeGreaterThanOrEqual(24);
  }
});

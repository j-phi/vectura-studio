#!/usr/bin/env node
/**
 * ci-plan: the first job of the Tests workflow. It decides which parts of the graph run.
 *
 * Outputs (GITHUB_OUTPUT):
 *   heavy=true|false  the coverage shards + merge, perf and e2e-smoke
 *   audit=true|false  the Scene3D proof audits (tests/audit, job `audit`)
 *   tree=<sha>        the tree of the tested commit (ci-ok records it for R-20)
 *   reason=<text>
 *
 * pull_request  heavy always; audit only when the diff matches scripts/audit-paths.js (R-17).
 * push (main)   skip heavy when the pushed tree equals the merge-ref tree of a PR run whose
 *               ci-ok passed (R-20). The audits are skipped only when that PR run also ran them.
 * schedule      skip heavy + audit when a push run on this same main SHA passed ci-ok in the
 *               last 24 h (R-19). The touch nightly jobs do not depend on this plan.
 * other events  no heavy graph, no audit (workflow_dispatch runs the touch nightly jobs only).
 *
 * Any doubt (API error, missing artifact, unknown diff) runs everything.
 * GitHub lookups are read-only (GITHUB_TOKEN with actions: read, pull-requests: read).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const auditPaths = require('./audit-paths');

const WORKFLOW_FILE = 'test.yml';
const VERDICT_ARTIFACT = 'ci-ok-verdict';
const VERDICT_FILE = 'ci-ok-verdict.json';
const DAY_MS = 24 * 60 * 60 * 1000;
// Files that define the CI verdict itself (see the push branch in plan()).
const CI_SELF = /^(\.github\/|scripts\/(ci-plan|ci-ok|audit-paths)\.js$)/;

const RUN_ALL = (reason) => ({ heavy: true, audit: true, reason });

// R-20. `candidates`: [{ runId, verdict }] from PR runs that closed with conclusion success.
// A candidate counts only when its verdict says ci-ok passed on a pull_request run of exactly
// this tree, and that the heavy graph ran there.
function decidePush({ headTree, candidates }) {
  if (!/^[0-9a-f]{40}$/.test(headTree || '')) return RUN_ALL('unknown head tree');
  for (const { runId, verdict } of candidates || []) {
    if (!verdict || verdict.schemaVersion !== 1 || verdict.ok !== true || verdict.event !== 'pull_request') continue;
    if (String(verdict.runId) !== String(runId) || verdict.tree !== headTree || verdict.heavy !== true) continue;
    const audit = verdict.audit !== true;
    return { heavy: false, audit, reason: `tree ${headTree} passed ci-ok in PR run ${runId}${audit ? '; that run skipped the audits, so they run here' : ''}` };
  }
  return RUN_ALL('no green PR run tested this tree');
}

// R-19. `pushRuns`: [{ id, createdAt, ciOk }] push runs on this exact SHA.
function decideSchedule({ now, pushRuns }) {
  for (const run of pushRuns || []) {
    const created = Date.parse(run.createdAt);
    if (run.ciOk === true && Number.isFinite(created) && now - created >= 0 && now - created < DAY_MS) {
      return { heavy: false, audit: false, reason: `push run ${run.id} on this SHA passed ci-ok at ${run.createdAt}` };
    }
  }
  return RUN_ALL('no green push run on this SHA in the last 24 h');
}

const ghJson = (gh, endpoint) => JSON.parse(gh(['api', endpoint]).toString('utf8'));

// Read the ci-ok verdict artifact of one run, or null.
function readVerdict(gh, repo, runId, unzip) {
  const list = ghJson(gh, `repos/${repo}/actions/runs/${runId}/artifacts?name=${VERDICT_ARTIFACT}`);
  const artifact = (list.artifacts || []).find((a) => a.name === VERDICT_ARTIFACT && !a.expired);
  if (!artifact) return null;
  const zip = gh(['api', `repos/${repo}/actions/artifacts/${artifact.id}/zip`]);
  return JSON.parse(unzip(zip, VERDICT_FILE));
}

function defaultUnzip(zipBuffer, member) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-plan-'));
  try {
    const file = path.join(dir, 'a.zip');
    fs.writeFileSync(file, zipBuffer);
    return execFileSync('unzip', ['-p', file, member], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function pushCandidates({ gh, repo, sha, unzip }) {
  const pulls = ghJson(gh, `repos/${repo}/commits/${sha}/pulls`).filter((pr) => pr.merged_at && pr.base && pr.base.ref === 'main');
  const candidates = [];
  for (const pr of pulls.slice(0, 3)) {
    const runs = ghJson(gh, `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=10`).workflow_runs || [];
    for (const run of runs.filter((r) => r.status === 'completed' && r.conclusion === 'success').slice(0, 5)) {
      candidates.push({ runId: run.id, verdict: readVerdict(gh, repo, run.id, unzip) });
    }
  }
  return candidates;
}

function schedulePushRuns({ gh, repo, sha }) {
  const runs = ghJson(gh, `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=push&branch=main&head_sha=${sha}&per_page=10`).workflow_runs || [];
  return runs.filter((r) => r.status === 'completed').slice(0, 5).map((run) => {
    const jobs = ghJson(gh, `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs || [];
    const ciOk = jobs.find((job) => job.name === 'ci-ok');
    return { id: run.id, createdAt: run.created_at, ciOk: Boolean(ciOk && ciOk.conclusion === 'success') };
  });
}

function plan({ env = process.env, gh, git, unzip = defaultUnzip, now = Date.now() } = {}) {
  const event = env.EVENT_NAME || env.GITHUB_EVENT_NAME || '';
  let tree = '';
  try { tree = git(['rev-parse', 'HEAD^{tree}']).toString('utf8').trim(); } catch { tree = ''; }
  const out = (decision) => ({ ...decision, tree });
  try {
    if (event === 'pull_request') {
      const audit = auditPaths.decide(auditPaths.changedFiles(env.BASE_SHA, 'HEAD'));
      return out({ heavy: true, audit: audit.run, reason: `audit: ${audit.reason}` });
    }
    if (event === 'push') {
      if (env.GITHUB_REF !== 'refs/heads/main') return out(RUN_ALL(`push to ${env.GITHUB_REF}`));
      // A PR run executes the PR's own workflow, so it could forge its verdict. A push that
      // changes CI itself never reuses a PR verdict.
      const pushed = auditPaths.changedFiles(env.BEFORE_SHA, 'HEAD');
      if (!pushed) return out(RUN_ALL('unknown pushed diff'));
      const ci = pushed.find((file) => CI_SELF.test(file));
      if (ci) return out(RUN_ALL(`push changes CI (${ci})`));
      return out(decidePush({ headTree: tree, candidates: pushCandidates({ gh, repo: env.GITHUB_REPOSITORY, sha: env.GITHUB_SHA, unzip }) }));
    }
    if (event === 'schedule') {
      return out(decideSchedule({ now, pushRuns: schedulePushRuns({ gh, repo: env.GITHUB_REPOSITORY, sha: env.GITHUB_SHA }) }));
    }
    return out({ heavy: false, audit: false, reason: `${event || 'unknown'} event runs no heavy graph` });
  } catch (error) {
    return out(RUN_ALL(`lookup failed, running everything: ${error.message.split('\n')[0]}`));
  }
}

if (require.main === module) {
  const gh = (args) => execFileSync('gh', args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const git = (args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  const result = plan({ gh, git });
  const lines = [`heavy=${result.heavy}`, `audit=${result.audit}`, `tree=${result.tree}`, `reason=${result.reason.replace(/\n/g, ' ')}`];
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

module.exports = { CI_SELF, WORKFLOW_FILE, VERDICT_ARTIFACT, VERDICT_FILE, decidePush, decideSchedule, plan, readVerdict };

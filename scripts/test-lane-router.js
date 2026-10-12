#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-lanes.json'), 'utf8'));
const args = process.argv.slice(2);
const valueAfter = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const runGit = (argv) => spawnSync('git', argv, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const head = valueAfter('--head') || process.env.GITHUB_SHA || 'HEAD';
let base = valueAfter('--base') || process.env.VECTURA_DIFF_BASE || process.env.GITHUB_BASE_SHA;
if (!base && process.env.GITHUB_BASE_REF) {
  const ref = `origin/${process.env.GITHUB_BASE_REF}`;
  const mergeBase = runGit(['merge-base', ref, head]);
  if (!mergeBase.error && mergeBase.status === 0) base = mergeBase.stdout.trim();
}
if (base) {
  const mergeBase = runGit(['merge-base', base, head]);
  if (!mergeBase.error && mergeBase.status === 0) base = mergeBase.stdout.trim();
  else base = null;
}

const classify = (files, fallbackReason) => {
  const matched = new Map();
  let fallback = !files.length;
  for (const file of files) {
    let found = false;
    for (const rule of manifest.rules) {
      if (rule.paths.some((pattern) => new RegExp(pattern).test(file))) {
        matched.set(rule.id, rule);
        found = true;
      }
    }
    if (!found) fallback = true;
  }
  const lanes = new Set(manifest.always.length ? ['feedback'] : []);
  let risk = 'low';
  for (const rule of matched.values()) {
    rule.lanes.forEach((lane) => lanes.add(lane));
    if (rule.risk === 'unknown' || rule.risk === 'shared' || (rule.risk === 'high' && !['unknown', 'shared'].includes(risk))) risk = rule.risk;
    else if (rule.risk === 'medium' && risk === 'low') risk = 'medium';
  }
  if (fallback) {
    manifest.fallback.lanes.forEach((lane) => lanes.add(lane));
    risk = 'unknown';
  }
  return {
    manifestVersion: manifest.version,
    mode: manifest.selection,
    base: base || null,
    head,
    files,
    risk,
    matchedRules: [...matched.keys(), ...(fallback ? ['unknown'] : [])],
    lanes: [...lanes].sort(),
    fallback: fallback ? (fallbackReason || manifest.fallback.reason) : null,
    always: manifest.always,
  };
};

let files = [];
let reason = null;
if (!base) reason = 'no base revision available';
else {
  const diff = runGit(['diff', '--name-status', '-z', base, head]);
  if (diff.error || diff.status !== 0) reason = `git diff failed${diff.stderr ? `: ${diff.stderr.trim()}` : ''}`;
  else {
    const fields = diff.stdout.split('\0').filter(Boolean);
    for (let i = 0; i < fields.length;) {
      const status = fields[i++];
      if (/^[RC]/.test(status)) { files.push(fields[i++], fields[i++]); }
      else files.push(fields[i++]);
    }
  }
}
if (reason) files = [];
const plan = classify(files, reason);
const githubOutput = valueAfter('--github-output') || process.env.GITHUB_OUTPUT;
const json = JSON.stringify(plan);
if (args.includes('--json')) process.stdout.write(`${json}\n`);
else process.stdout.write(`risk=${plan.risk} lanes=${plan.lanes.join(',')} base=${plan.base || 'unavailable'} files=${plan.files.length}${plan.fallback ? ` fallback=${plan.fallback}` : ''}\n`);
if (githubOutput) {
  fs.appendFileSync(githubOutput, `plan<<VECTURA_PLAN\n${json}\nVECTURA_PLAN\nlanes=${plan.lanes.join(',')}\nrisk=${plan.risk}\nclasses=${plan.matchedRules.join(',')}\n`);
}

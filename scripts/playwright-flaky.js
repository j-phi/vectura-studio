#!/usr/bin/env node
/**
 * Make Playwright flakes visible (judgment R-15). The config retries a failed test once, so a
 * test that fails and then passes counts as "flaky" and the run stays green. Without this
 * script that signal is lost.
 *
 *   summarize --job <name> --out <file> <report.json...>
 *     Reads Playwright JSON reports. For each flaky test it prints a `::warning` annotation.
 *     It adds a table to $GITHUB_STEP_SUMMARY and writes {job, flaky, tests} to <file>.
 *     It never fails the job (exit 0), also when a report is missing.
 *
 *   total <dir>
 *     Reads every summary JSON under <dir>, writes `flaky=<count>` to $GITHUB_OUTPUT and the
 *     Markdown issue body to <dir>/flaky-body.md.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Collect flaky tests from a Playwright JSON report (suites nest: file -> describe -> spec).
function flakyTests(report) {
  const out = [];
  const walk = (suite, trail) => {
    const titles = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (test.status === 'flaky') {
          out.push({ file: spec.file || suite.file || '', line: spec.line || 0, title: [...titles, spec.title].join(' > '), project: test.projectName || '' });
        }
      }
    }
    for (const child of suite.suites || []) walk(child, titles);
  };
  for (const suite of report.suites || []) walk(suite, []);
  return out;
}

function readReports(files) {
  const tests = [];
  let statsFlaky = 0;
  const missing = [];
  for (const file of files) {
    if (!fs.existsSync(file)) { missing.push(file); continue; }
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    statsFlaky += Number(report.stats && report.stats.flaky) || 0;
    tests.push(...flakyTests(report));
  }
  return { flaky: Math.max(statsFlaky, tests.length), tests, missing };
}

const escapeCell = (value) => String(value).replace(/\|/g, '\\|');

function summarize(args) {
  const { flaky, tests, missing } = readReports(args.files);
  for (const file of missing) console.log(`[playwright-flaky] no report at ${file}`);
  for (const t of tests) {
    const props = [...(t.file ? [`file=tests/e2e/${t.file}`, `line=${t.line}`] : []), `title=Flaky Playwright test (${t.project})`];
    console.log(`::warning ${props.join(',')}::${t.title} failed, then passed on retry.`);
  }
  if (flaky > 0) console.log(`::warning title=Playwright flakes::${args.job}: ${flaky} flaky test(s) passed only on retry.`);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const lines = [`### Playwright flakes: ${args.job}`, '', flaky ? `${flaky} test(s) failed once and passed on retry.` : 'No flaky tests.', ''];
    if (tests.length) {
      lines.push('| Project | Test | File |', '|---|---|---|');
      for (const t of tests) lines.push(`| ${escapeCell(t.project)} | ${escapeCell(t.title)} | ${escapeCell(t.file)}:${t.line} |`);
      lines.push('');
    }
    fs.appendFileSync(summaryFile, `${lines.join('\n')}\n`);
  }
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify({ job: args.job, flaky, tests }, null, 2)}\n`);
  }
  return { flaky, tests };
}

function total(dir) {
  const summaries = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) summaries.push(JSON.parse(fs.readFileSync(full, 'utf8')));
    }
  };
  walk(dir);
  const count = summaries.reduce((sum, s) => sum + (Number(s.flaky) || 0), 0);
  const lines = [`Playwright flakes on this run: ${count}.`, ''];
  for (const s of summaries.filter((x) => x.flaky > 0).sort((a, b) => (a.job < b.job ? -1 : 1))) {
    lines.push(`- **${s.job}**: ${s.flaky}`);
    for (const t of s.tests || []) lines.push(`  - ${t.project}: ${t.title} (${t.file}:${t.line})`);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `flaky=${count}\n`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'flaky-body.md'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  return { count, body: lines.join('\n') };
}

function parseArgs(argv) {
  const args = { command: argv[0], files: [] };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--job') args.job = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else args.files.push(argv[i]);
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args.command === 'summarize') summarize({ ...args, job: args.job || 'playwright' });
    else if (args.command === 'total') total(args.files[0]);
    else throw new Error('usage: playwright-flaky.js summarize --job <name> --out <file> <report.json...> | total <dir>');
  } catch (error) {
    // Reporting must never turn a green run red.
    console.log(`::warning title=Playwright flake report::${error.message}`);
  }
}

module.exports = { flakyTests, readReports, summarize, total };

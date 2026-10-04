/*
 * TUX-054 static guard: one download helper.
 *
 * `URL.revokeObjectURL(` and anchor `.download =` assignments may appear only in
 * src/ui/download-blob.js. Inline copies bring back the synchronous-revoke bug
 * (iOS Safari loses the file) and bypass the iOS share sheet.
 * TUX-060 folds this check into the shared static guards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const HELPER = 'src/ui/download-blob.js';
// "file:line" entries for a revoke that is NOT a download (e.g. image previews), each with a reason.
const ALLOW = {};

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue; // third-party code
      walk(full, out);
    } else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};

describe('download helper guard (TUX-054)', () => {
  const hits = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel === HELPER) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/URL\.revokeObjectURL\s*\(/.test(line) || /\.download\s*=[^=]/.test(line)) {
        const key = `${rel}:${i + 1}`;
        if (!ALLOW[key]) hits.push(`${key}  ${line.trim()}`);
      }
    });
  }

  it('the shared helper exists', () => {
    expect(fs.existsSync(path.join(ROOT, HELPER))).toBe(true);
  });

  it('no inline revokeObjectURL or anchor.download outside the helper', () => {
    expect(hits).toEqual([]);
  });
});

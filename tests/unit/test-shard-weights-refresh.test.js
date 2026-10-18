import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stringify } = require('flatted');
const { buildWeights, readBlobDir } = require('../../scripts/test-shard-weights-refresh.js');
const roots = [];

const fileEntry = (name, extra) => ({ filepath: `/runner/work/repo/tests/${name}`, result: { duration: 1000 }, ...extra });
function makeRun(shards) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weights-refresh-'));
  roots.push(dir);
  shards.forEach((files, i) => {
    fs.mkdirSync(path.join(dir, `coverage-shard-${i + 1}`));
    fs.writeFileSync(path.join(dir, `coverage-shard-${i + 1}`, 'blob.json'), stringify([[], files]));
  });
  return dir;
}

afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

describe('test-shard-weights-refresh', () => {
  it('includes hook, collect, setup, env and prepare time', () => {
    const dir = makeRun([[fileEntry('unit/a.test.js', { collectDuration: 2000, setupDuration: 3000, environmentLoad: 4000, prepareDuration: 5000 })]]);
    expect(readBlobDir(dir)['tests/unit/a.test.js']).toBe(15);
  });

  it('averages across runs, keeps previous for unmeasured files, omits unknown, excludes e2e', () => {
    const r1 = readBlobDir(makeRun([[fileEntry('unit/a.test.js', { result: { duration: 10000 } })], [fileEntry('e2e/x.spec.js')]]));
    const r2 = readBlobDir(makeRun([[fileEntry('unit/a.test.js', { result: { duration: 20000 } })]]));
    const inventory = ['tests/unit/a.test.js', 'tests/unit/b.test.js', 'tests/unit/c.test.js'];
    const previous = { schemaVersion: 1, source: { unknownFileWeightSeconds: 19.355 }, weightsSeconds: { 'tests/unit/b.test.js': 7 } };
    const next = buildWeights({ runs: [r1, r2], inventory, previous, runIds: ['1', '2'] });
    expect(next.weightsSeconds).toEqual({ 'tests/unit/a.test.js': 15, 'tests/unit/b.test.js': 7 });
    expect(next.source.fileCount).toBe(2);
    expect(next.source.fileDurationSumSeconds).toBe(22);
    expect(next.source.unknownFileWeightSeconds).toBeUndefined();
    expect(next.source.unweightedFilePolicy).toMatch(/median/);
    expect(next.source.description).toContain('1, 2');
  });
});

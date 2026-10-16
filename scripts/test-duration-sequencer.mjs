import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseSequencer } from 'vitest/node';
import shardPlan from './test-shard-plan.js';

const { readPlan, planHash } = shardPlan;

function filePath(moduleId, root) {
  const absolute = moduleId.startsWith('file:') ? fileURLToPath(moduleId) : path.resolve(root, moduleId);
  return path.relative(root, absolute).split(path.sep).join('/');
}

export default class DurationBalancedSequencer extends BaseSequencer {
  loadPlan() {
    const planPath = process.env.VECTURA_SHARD_PLAN_FILE;
    if (!planPath || !fs.existsSync(planPath)) throw new Error('VECTURA_SHARD_PLAN_FILE must point to the validated current-SHA pilot plan');
    const plan = readPlan(planPath);
    if (plan.sha !== process.env.GITHUB_SHA) throw new Error('shard plan SHA does not match GITHUB_SHA');
    if (plan.hash !== planHash(plan)) throw new Error('shard plan hash failed validation');
    return plan;
  }

  shard(specifications) {
    const plan = this.loadPlan();
    const root = this.ctx.config.root;
    const files = specifications.map((spec) => filePath(spec.moduleId, root)).sort();
    if (JSON.stringify(files) !== JSON.stringify(plan.inventory)) throw new Error('Vitest-collected file inventory differs from the deterministic shard plan');
    const { index, count } = this.ctx.config.shard;
    if (count !== plan.shardCount) throw new Error(`vitest --shard count ${count} differs from the shard plan count ${plan.shardCount}`);
    const assigned = new Set(plan.shards[index - 1]?.files || []);
    if (!assigned.size) throw new Error(`shard ${index} has no assigned files`);
    return specifications.filter((spec) => assigned.has(filePath(spec.moduleId, root)));
  }

  sort(specifications) {
    const plan = this.loadPlan();
    const root = this.ctx.config.root;
    return [...specifications].sort((a, b) => {
      const pathA = filePath(a.moduleId, root);
      const pathB = filePath(b.moduleId, root);
      const weightA = plan.weightsSeconds[pathA] || plan.unknownFileWeightSeconds;
      const weightB = plan.weightsSeconds[pathB] || plan.unknownFileWeightSeconds;
      return weightB - weightA || (pathA < pathB ? -1 : pathA > pathB ? 1 : 0);
    });
  }
}

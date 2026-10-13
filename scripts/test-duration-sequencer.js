'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { BaseSequencer } = require('vitest/node');
const { readPlan, planHash } = require('./test-shard-plan');

function filePath(moduleId, root) {
  const absolute = moduleId.startsWith('file:') ? fileURLToPath(moduleId) : path.resolve(root, moduleId);
  return path.relative(root, absolute).split(path.sep).join('/');
}

class DurationBalancedSequencer extends BaseSequencer {
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
    const index = this.ctx.config.shard.index;
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

module.exports = DurationBalancedSequencer;

import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.mjs';
import DurationBalancedSequencer from './scripts/test-duration-sequencer.mjs';

// The sharded CI roster (scripts/test-shard-plan.js COVERAGE_EXCLUDED_DIRS): every Vitest file
// except tests/perf (the `perf` job) and tests/audit (the `audit` job). The PR shards run it
// uninstrumented and the main/nightly coverage shards run it under V8 coverage
// (VECTURA_TEST_COVERAGE=1); both must collect the same inventory as the shard plan.
export default mergeConfig(baseConfig, {
  test: {
    exclude: ['tests/perf/**', 'tests/audit/**'],
    sequence: { sequencer: DurationBalancedSequencer },
  },
});

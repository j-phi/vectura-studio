import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.mjs';
import DurationBalancedSequencer from './scripts/test-duration-sequencer.js';

export default mergeConfig(baseConfig, {
  test: {
    sequence: { sequencer: DurationBalancedSequencer },
  },
});

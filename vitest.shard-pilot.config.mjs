import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.mjs';
import DurationBalancedSequencer from './scripts/test-duration-sequencer.mjs';

export default mergeConfig(baseConfig, {
  test: {
    sequence: { sequencer: DurationBalancedSequencer },
  },
});

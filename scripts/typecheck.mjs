import { execSync } from 'node:child_process';

try {
  execSync('eslint .', { stdio: 'inherit' });
} catch (err) {
  process.exit(err?.status || 1);
}

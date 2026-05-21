const fs = require('fs');
const path = require('path');

const optimization = require('../../src/core/optimization-utils.js');

const SRC_ROOT = path.join(__dirname, '..', '..', 'src');

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
};

describe('isClosedPath canonical export + no fallback patterns', () => {
  test('OptimizationUtils.isClosedPath is defined after runtime load', () => {
    expect(typeof optimization.isClosedPath).toBe('function');
    // sanity: behaves correctly on a closed and open path
    expect(optimization.isClosedPath([
      { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 0, y: 0 },
    ])).toBe(true);
    expect(optimization.isClosedPath([
      { x: 0, y: 0 }, { x: 1, y: 1 },
    ])).toBe(false);
  });

  test('no src/ file declares an isClosedPath fallback over OptimizationUtils', () => {
    const files = walk(SRC_ROOT);
    // Pattern: `isClosedPath = <expr> || ...` — a fallback expression assigned
    // to a local `isClosedPath` binding. Use a multi-line scan that lets the
    // RHS run across line breaks (pattern.js's was multi-line).
    const fallbackPattern = /\bisClosedPath\s*=\s*[^;]*?\|\|\s*\(/s;
    const offenders = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      // Walk each statement (split on `;`) to keep file locality manageable
      // while still letting line breaks appear inside an assignment RHS.
      const statements = text.split(';');
      let cursor = 0;
      for (const stmt of statements) {
        if (fallbackPattern.test(stmt)) {
          // Compute approximate line number for the match
          const matchOffset = cursor + stmt.search(/\bisClosedPath\b/);
          const line = text.slice(0, matchOffset).split('\n').length;
          offenders.push(`${path.relative(SRC_ROOT, file)}:${line}`);
        }
        cursor += stmt.length + 1; // +1 for the consumed `;`
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        'Found isClosedPath fallback assignments (should call OptimizationUtils.isClosedPath directly):\n  '
        + offenders.join('\n  ')
      );
    }
  });
});

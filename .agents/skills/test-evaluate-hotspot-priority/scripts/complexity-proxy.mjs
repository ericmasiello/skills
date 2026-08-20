import { readFileSync } from 'node:fs';

/**
 * Resolve a complexity value for a module.
 *
 * Prefers an explicitly supplied cyclomatic complexity number (e.g. from a
 * language-specific complexity tool). Falls back to a LOC (non-blank lines)
 * proxy when no real complexity metric is available, matching the
 * documented fallback: "complexity proxy = cyclomatic if available, else LOC".
 *
 * @param {string} filePath - absolute or cwd-relative path to the source file
 * @param {{ explicitComplexity?: number }} [options]
 * @returns {{ value: number, source: 'cyclomatic' | 'loc-proxy' }}
 */
export function computeComplexityProxy(filePath, options = {}) {
  const { explicitComplexity } = options;

  if (explicitComplexity != null) {
    const value = Number(explicitComplexity);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`explicitComplexity must be a positive number, got "${explicitComplexity}"`);
    }
    return { value, source: 'cyclomatic' };
  }

  let contents;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read "${filePath}" for complexity proxy: ${error.message}`);
  }

  const loc = contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

  return { value: Math.max(loc, 1), source: 'loc-proxy' };
}

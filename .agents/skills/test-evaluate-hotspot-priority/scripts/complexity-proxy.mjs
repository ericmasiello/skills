import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.cs', '.go', '.java', '.kt', '.rs', '.rb', '.php', '.swift', '.scala',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx',
]);

/**
 * Directories excluded from the LOC proxy.
 *
 * Complexity is a direct multiplicand of the hotspot score, so counting a
 * vendored tree or a virtualenv inflates a module's rank by orders of magnitude.
 * Test code is excluded too: the proxy measures the production complexity being
 * protected, not the size of the suite protecting it.
 */
const IGNORED_DIRECTORIES = new Set([
  '.git', '.hg', '.svn',
  'node_modules', 'bower_components', 'jspm_packages',
  'bin', 'obj', 'build', 'target', 'dist', 'out', 'coverage',
  '.venv', 'venv', 'env', '.tox', '.nox', '__pycache__', 'site-packages', '.eggs',
  'vendor', 'Pods', 'Carthage',
  '.next', '.nuxt', '.svelte-kit', '.parcel-cache', '.turbo',
  '.mypy_cache', '.pytest_cache', '.ruff_cache', '.gradle', '.idea', '.vscode',
  'test', 'tests', '__tests__', 'spec', 'specs', 'testdata', 'fixtures', '__fixtures__', '__mocks__',
]);

const TEST_FILE_PATTERN = /(^|[.\-_])(test|tests|spec|specs)\.[^.]+$|(^|[/\\])(test_|conftest\b)/i;

function isTestFile(fileName) {
  return TEST_FILE_PATTERN.test(fileName) || /Tests?\.(cs|java|kt|swift|scala)$/i.test(fileName);
}

function sourceFiles(directory) {
  const files = [];
  let entries;
  try {
    // withFileTypes does not follow symlinks, so a dangling link cannot throw.
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // An unreadable directory contributes nothing rather than aborting the walk.
    return files;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        files.push(...sourceFiles(join(directory, entry.name)));
      }
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(extname(entry.name)) &&
      !isTestFile(entry.name)
    ) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function locForFile(filePath) {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

/**
 * Resolve a complexity value for a module.
 *
 * Prefers an explicitly supplied cyclomatic complexity number (e.g. from a
 * language-specific complexity tool). Falls back to a LOC (non-blank lines)
 * proxy when no real complexity metric is available, matching the
 * documented fallback: "complexity proxy = cyclomatic if available, else LOC".
 *
 * @param {string} filePath - absolute or cwd-relative source file or module directory
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

  let stats;
  try {
    stats = statSync(filePath);
  } catch (error) {
    throw new Error(`Unable to read "${filePath}" for complexity proxy: ${error.message}`);
  }

  let loc;
  let matchedFiles;
  try {
    if (stats.isDirectory()) {
      matchedFiles = sourceFiles(filePath);
      loc = matchedFiles.reduce((total, sourceFile) => total + locForFile(sourceFile), 0);
    } else {
      matchedFiles = [filePath];
      loc = locForFile(filePath);
    }
  } catch (error) {
    throw new Error(`Unable to read "${filePath}" for complexity proxy: ${error.message}`);
  }

  // Refuse to invent a floor of 1. A module with no recognised production
  // source is an unsupported language or a wrong path, and must surface as
  // missing evidence rather than as a near-zero hotspot score.
  if (matchedFiles.length === 0) {
    throw new Error(
      `No recognised production source files under "${filePath}" (test, vendored, and build directories are excluded). Complexity is unknown, not 1.`,
    );
  }
  if (loc === 0) {
    throw new Error(
      `"${filePath}" contains no non-blank source lines, so a LOC complexity proxy is not meaningful. Supply an explicit complexity value.`,
    );
  }

  return { value: loc, source: 'loc-proxy' };
}

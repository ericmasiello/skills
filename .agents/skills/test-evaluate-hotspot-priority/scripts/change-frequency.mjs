import { execFileSync } from 'node:child_process';

/**
 * Compute how many commits touched a path within a repository.
 *
 * Uses execFileSync (argv array, no shell) so path/since values can never be
 * interpreted as shell metacharacters — this is the injection-safe way to
 * shell out to git from Node. Never build this as a concatenated string
 * passed through a shell.
 *
 * @param {string} repoPath - repository root to run git in
 * @param {string} targetPath - file or directory path, relative to repoPath
 * @param {{ since?: string }} [options] - optional `--since` window (e.g. "90 days ago")
 * @returns {number} count of commits that touched targetPath
 */
export function computeChangeFrequency(repoPath, targetPath, options = {}) {
  const { since } = options;
  const args = ['log', '--format=%H'];
  if (since) {
    args.push(`--since=${since}`);
  }
  args.push('--', targetPath);

  let output;
  try {
    output = execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(
      `Unable to compute change frequency for "${targetPath}" in "${repoPath}": ${error.message}`,
    );
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

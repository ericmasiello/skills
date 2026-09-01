import { execFileSync } from 'node:child_process';

/**
 * Count how many commits touched a path within a repository.
 *
 * Uses execFileSync (argv array, no shell) so path/since values can never be
 * interpreted as shell metacharacters — this is the injection-safe way to
 * shell out to git from Node. Never build this as a concatenated string
 * passed through a shell.
 *
 * Rename handling is pinned explicitly with `-c diff.renames=<bool>` and an
 * explicit `--no-follow`/`--follow` flag. Without pinning, a developer's global
 * `log.follow=true` and a bare CI environment return different counts for the
 * same path, which makes the hotspot ranking irreproducible.
 *
 * Uses `rev-list --count` rather than `log --format=%H`, so stdout is a single
 * number. Listing one hash per commit overflows Node's default 1 MB maxBuffer
 * at roughly 25,000 commits — and the path that overflows first is the busiest
 * path in the repository, i.e. the top hotspot.
 *
 * Returns `null` when the path has no commit history. A path that git does not
 * know about is missing evidence, not a stable file with zero churn. Scoring it
 * as 0 annihilates the hotspot product and ranks new, untested code last.
 *
 * @param {string} repoPath - repository root to run git in
 * @param {string} targetPath - file or directory path, relative to repoPath
 * @param {{ since?: string, followRenames?: boolean }} [options]
 * @returns {number|null} commit count, or null when the path has no history
 */
export function computeChangeFrequency(repoPath, targetPath, options = {}) {
  const { since, followRenames = false } = options;

  const args = ['-c', `diff.renames=${followRenames ? 'true' : 'false'}`, 'rev-list', '--count'];
  if (followRenames) {
    args.push('--follow');
  } else {
    args.push('--no-renames');
  }
  args.push('HEAD');
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
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      // Neutralise ambient configuration so the count is reproducible.
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    });
  } catch (error) {
    throw new Error(
      `Unable to compute change frequency for "${targetPath}" in "${repoPath}": ${error.message}`,
    );
  }

  const count = Number.parseInt(String(output).trim(), 10);
  if (!Number.isFinite(count)) {
    throw new Error(
      `git rev-list returned a non-numeric count for "${targetPath}" in "${repoPath}": ${JSON.stringify(output)}`,
    );
  }

  // No history is unknown churn, not zero churn.
  return count === 0 ? null : count;
}

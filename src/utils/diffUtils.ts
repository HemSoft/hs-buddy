export function getDiffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'repo-commit-diff-line repo-commit-diff-line-hunk'
  if (line.startsWith('+')) return 'repo-commit-diff-line repo-commit-diff-line-added'
  if (line.startsWith('-')) return 'repo-commit-diff-line repo-commit-diff-line-removed'
  return 'repo-commit-diff-line'
}

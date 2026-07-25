import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'sfl-auditor.yml')
const temporaryDirectories: string[] = []

function stalledPrScript(): string {
  const workflow = readFileSync(workflowPath, 'utf8').replaceAll('\r\n', '\n')
  const marker = '        id: stalled-prs\n        run: |\n'
  const start = workflow.indexOf(marker)
  const nextStep = workflow.indexOf('\n      - name:', start + marker.length)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(nextStep).toBeGreaterThan(start)

  return workflow
    .slice(start + marker.length, nextStep)
    .split('\n')
    .map(line => line.slice(10))
    .join('\n')
}

function bashExecutable(): string {
  const gitBash = String.raw`C:\Program Files\Git\bin\bash.exe`
  return process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash'
}

function runStalledPrCheck(draftPrs: unknown[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'sfl-auditor-'))
  temporaryDirectories.push(directory)

  const fixturePath = join(directory, 'draft-prs.json')
  const outputPath = join(directory, 'github-output')
  const commentsPath = join(directory, 'comments')
  writeFileSync(fixturePath, JSON.stringify(draftPrs))

  const mockGh = `
gh() {
  if [ "$1 $2" = "pr list" ]; then
    cat "$DRAFT_PRS_FIXTURE"
    return
  fi
  if [ "$1 $2" = "pr comment" ]; then
    echo "$3" >> "$COMMENTS_LOG"
    return
  fi
  return 1
}
`
  const result = spawnSync(bashExecutable(), ['-s'], {
    input: `${mockGh}\n${stalledPrScript()}`,
    encoding: 'utf8',
    env: {
      ...process.env,
      COMMENTS_LOG: commentsPath,
      DRAFT_PRS_FIXTURE: fixturePath,
      GITHUB_OUTPUT: outputPath,
      REPO: 'HemSoft/hs-buddy',
    },
  })

  expect(result.status).toBe(0)
  return readFileSync(outputPath, 'utf8')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('SFL Auditor stalled draft PR counter', () => {
  it('writes zero when no draft PR qualifies', () => {
    expect(runStalledPrCheck([])).toContain('stalled_prs_found=0')
  })

  it('writes one when a stalled draft PR lacks analyzer markers', () => {
    const draftPr = {
      body: '',
      comments: [],
      createdAt: '2020-01-01T00:00:00Z',
      headRefName: 'agent-fix/issue-305',
      number: 42,
    }

    expect(runStalledPrCheck([draftPr])).toContain('stalled_prs_found=1')
  })
})

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

interface StalledPrCheckResult {
  comments: string
  output: string
}

const mockGh = `
gh() {
  if [ "$1 $2" = "pr list" ]; then
    cat "$DRAFT_PRS_FIXTURE"
    return
  fi
  if [ "$1 $2" = "pr comment" ]; then
    shift 2
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--body" ]; then
        printf '%s\n' "$2" >> "$COMMENTS_LOG"
        return
      fi
      shift
    done
    return 1
  fi
  return 1
}
`

function runStalledPrCheck(draftPrs: unknown[]): StalledPrCheckResult {
  const directory = mkdtempSync(join(tmpdir(), 'sfl-auditor-'))
  temporaryDirectories.push(directory)

  const fixturePath = join(directory, 'draft-prs.json')
  const outputPath = join(directory, 'github-output')
  const commentsPath = join(directory, 'comments')
  writeFileSync(fixturePath, JSON.stringify(draftPrs))

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
  return {
    comments: existsSync(commentsPath) ? readFileSync(commentsPath, 'utf8') : '',
    output: readFileSync(outputPath, 'utf8'),
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('SFL Auditor stalled draft PR counter', () => {
  it('writes zero when no draft PR qualifies', () => {
    expect(runStalledPrCheck([]).output).toContain('stalled_prs_found=0')
  })

  it('writes one when a stalled draft PR lacks analyzer markers', () => {
    const draftPr = {
      body: '',
      comments: [],
      createdAt: '2020-01-01T00:00:00Z',
      headRefName: 'agent-fix/issue-305',
      number: 42,
    }

    const result = runStalledPrCheck([draftPr])

    expect(result.output).toContain('stalled_prs_found=1')
    expect(result.comments).toContain('<!-- sfl-auditor:stalled-pr-missing-analyzers -->')
  })

  it('does not post the emitted warning twice for the same PR', () => {
    const draftPr = {
      body: '',
      comments: [],
      createdAt: '2020-01-01T00:00:00Z',
      headRefName: 'agent-fix/issue-306',
      number: 42,
    }
    const firstRun = runStalledPrCheck([draftPr])
    const secondRun = runStalledPrCheck([
      {
        ...draftPr,
        comments: [{ body: firstRun.comments }],
      },
    ])

    expect(firstRun.output).toContain('stalled_prs_found=1')
    expect(secondRun.output).toContain('stalled_prs_found=0')
    expect(secondRun.comments).toBe('')
  }, 10_000)
})

describe('SFL Auditor stalled draft PR warning detection', () => {
  it('recognizes warning text emitted before the stable marker existed', () => {
    const result = runStalledPrCheck([
      {
        body: '',
        comments: [
          {
            body: '⏰ **SFL Auditor**: Draft PR #42 has been open for over 2 hours and is missing one or more analyzer markers.',
          },
        ],
        createdAt: '2020-01-01T00:00:00Z',
        headRefName: 'agent-fix/issue-306',
        number: 42,
      },
    ])

    expect(result.output).toContain('stalled_prs_found=0')
    expect(result.comments).toBe('')
  })

  it('recognizes the documented legacy warning wording', () => {
    const result = runStalledPrCheck([
      {
        body: '',
        comments: [
          {
            body: '⏰ **SFL Auditor**: Draft PR #42 is missing analyzer markers.',
          },
        ],
        createdAt: '2020-01-01T00:00:00Z',
        headRefName: 'agent-fix/issue-306',
        number: 42,
      },
    ])

    expect(result.output).toContain('stalled_prs_found=0')
    expect(result.comments).toBe('')
  })

  it('does not treat unrelated reviewer text as an auditor warning', () => {
    const result = runStalledPrCheck([
      {
        body: '',
        comments: [
          {
            body: 'Review note: this test discusses missing analyzer markers.',
          },
        ],
        createdAt: '2020-01-01T00:00:00Z',
        headRefName: 'agent-fix/issue-306',
        number: 42,
      },
    ])

    expect(result.output).toContain('stalled_prs_found=1')
    expect(result.comments).toContain('<!-- sfl-auditor:stalled-pr-missing-analyzers -->')
  })
})

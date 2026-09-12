import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const normalizeLineEndings = (text: string): string => text.replaceAll('\r\n', '\n')

const readRepositoryText = (path: string): string =>
  normalizeLineEndings(readFileSync(resolve(process.cwd(), path), 'utf8'))

const workflow = readRepositoryText('.github/workflows/dependabot-lockfile.yml')
const ciWorkflow = readRepositoryText('.github/workflows/ci.yml')
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const convexConfig = readRepositoryText('vitest.convex.config.ts')
const generateJob = workflow.slice(
  workflow.indexOf('\n  generate-lockfile:\n'),
  workflow.indexOf('\n  commit-lockfile:\n')
)
const writeJob = workflow.slice(workflow.indexOf('\n  commit-lockfile:\n'))
const dispatchStep = workflow.slice(
  workflow.indexOf('- name: Dispatch generated-commit CI'),
  workflow.indexOf('- name: Wait for generated-commit CI')
)
const convexJob = ciWorkflow.slice(
  ciWorkflow.indexOf('\n  test-convex:\n'),
  ciWorkflow.indexOf('\n  test-e2e:\n')
)

const stepNames = [...workflow.matchAll(/^\s+- name: (.+)$/gm)].map(match => match[1])

describe('workflow text normalization', () => {
  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('normalizes %s text before section assertions', (_label, lineEnding) => {
    const fixture = ['jobs:', '  read-only:', '  write-only:'].join(lineEnding)
    const normalized = normalizeLineEndings(fixture)

    expect(normalized).toContain('\n  read-only:\n')
    expect(normalized).toContain('\n  write-only:')
  })
})

describe('Dependabot Lockfile Fix workflow', () => {
  it('loads trusted workflow code while isolating PR execution in a read-only job', () => {
    expect(workflow).toContain('pull_request_target:')
    expect(workflow).not.toMatch(/^\s+pull_request:\s*$/m)
    expect(workflow).toContain("github.event.pull_request.user.login == 'dependabot[bot]'")
    expect(workflow).toContain('permissions: {}')
    expect(generateJob).toContain('permissions:\n      contents: read')
    expect(generateJob).not.toMatch(/\b(contents|actions|pull-requests): write\b/)
    expect(generateJob).toContain('ref: ${{ github.event.pull_request.head.sha }}')
    expect(generateJob).toContain('persist-credentials: false')
    expect(generateJob).toContain('run: bun install --no-frozen-lockfile')
    expect(generateJob).toContain('run: bun install --frozen-lockfile')
  })

  it('keeps write credentials out of every untrusted execution path', () => {
    expect(writeJob).toContain('actions: write')
    expect(writeJob).toContain('contents: write')
    expect(writeJob).not.toContain('uses: actions/checkout')
    expect(writeJob).not.toContain('uses: ./.github/actions/')
    expect(writeJob).not.toContain('bun install')
    expect(writeJob).not.toContain('npm install')
  })

  it('rejects unexpected files, symlinks, authors, forks, and stale heads', () => {
    expect(generateJob).toContain('Expected only bun.lock to change')
    expect(generateJob).toContain('test ! -L bun.lock')
    expect(writeJob).toContain('test "$(jq -r .user.login pr.json)" = "dependabot[bot]"')
    expect(writeJob).toContain('test "$HEAD_REPOSITORY" = "$REPOSITORY"')
    expect(writeJob).toContain('test ! -L artifact/bun.lock')
    expect(writeJob).toContain('Expected one bun.lock artifact')
    expect(writeJob).toContain('test "$(jq -r .head.sha pr.json)" = "$EXPECTED_HEAD"')
    expect(writeJob).toContain(
      'test "$(gh api "repos/$REPOSITORY/pulls/$PR_NUMBER" --jq .head.sha)" = "$EXPECTED_HEAD"'
    )
  })
})

describe('trusted Dependabot writer', () => {
  it('creates a one-file commit without checking out the untrusted head', () => {
    expect(writeJob).toContain('Git Database API')
    expect(writeJob).toContain('git/commits/$EXPECTED_HEAD')
    expect(writeJob).toContain('path: "bun.lock"')
    expect(writeJob).toContain('base_tree: $base_tree')
    expect(writeJob).toContain('parents: [$parent]')
    expect(writeJob).toContain('{sha: $sha, force: false}')
    expect(writeJob).toContain('git/refs/heads/$HEAD_REF')
  })

  it('dispatches CI only after the pushed commit is verified', () => {
    expect(stepNames).toEqual(
      expect.arrayContaining([
        'Validate generated files',
        'Validate artifact and current Dependabot head',
        'Commit lockfile through the Git Database API',
        'Dispatch generated-commit CI',
        'Wait for generated-commit CI',
      ])
    )
    expect(writeJob).toContain("steps.commit-lockfile.outputs.pushed == 'true'")
    const verifyRef =
      'test "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$TARGET_REF" --jq .object.sha)" = "$TARGET_SHA"'
    const dispatch = 'gh workflow run ci.yml --ref "$TARGET_REF"'
    expect(dispatchStep).toContain(verifyRef)
    expect(dispatchStep.indexOf(verifyRef)).toBeLessThan(dispatchStep.indexOf(dispatch))
    expect(dispatchStep).toContain('--event workflow_dispatch')
    expect(dispatchStep).toContain('--commit "$TARGET_SHA"')

    const scriptLines = dispatchStep
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))
    const warningIndex = scriptLines.findIndex(line =>
      line.includes('::warning::No workflow_dispatch CI run appeared')
    )
    const errorIndex = scriptLines.findIndex(line =>
      line.includes('refusing to skip generated-commit validation')
    )
    expect(warningIndex).toBeGreaterThan(-1)
    expect(scriptLines[warningIndex + 1]).toBe('exit 0')
    expect(errorIndex).toBeGreaterThan(warningIndex)
    expect(scriptLines[errorIndex + 1]).toBe('exit 1')
  })

  it('delegates generated commits to coverage-gated Convex follow-up CI', () => {
    expect(ciWorkflow).toContain('  workflow_dispatch:')
    expect(writeJob).not.toContain('run: bun run test:convex')
    expect(convexJob).toContain('run: bun run test:convex:coverage')
    expect(packageJson.scripts['test:convex:coverage']).toContain('--coverage')
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      expect(convexConfig).toContain(`${metric}: 90`)
    }
  })

  it('treats a cancelled dispatched run as superseded only by a newer commit', () => {
    expect(writeJob).toContain('gh run watch "$RUN_ID" --compact --exit-status')
    expect(writeJob).toContain('"$conclusion" = "cancelled"')
    expect(writeJob).toContain('no newer commit supersedes $TARGET_SHA')
    expect(writeJob).toMatch(/::warning::Dispatched CI run \$RUN_ID was cancelled/)
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/release.yml'),
  'utf8'
).replaceAll('\r\n', '\n')

describe('release workflow qualification contract', () => {
  it('starts only from a successful main push CI completion', () => {
    expect(workflow).toContain('workflow_run:')
    expect(workflow).toContain('workflows: [CI]')
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(workflow).toContain("github.event.workflow_run.event == 'push'")
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(workflow).not.toMatch(/^\s+push:\s*$/m)
  })

  it('binds qualification, checkout, and version reads to one SHA', () => {
    expect(workflow).toContain('TARGET_SHA: ${{ github.event.workflow_run.head_sha }}')
    expect(workflow).toContain('actions/runs/$RUN_ID/jobs?per_page=100')
    expect(workflow).toContain('.[].jobs[]')
    expect(workflow).toContain('.name == "ci-complete"')
    expect(workflow).toContain('.conclusion == "success"')
    expect(workflow).toContain('ref: ${{ github.event.workflow_run.head_sha }}')
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$TARGET_SHA"')
  })

  it('rejects stale candidates and commits without a version change', () => {
    const staleCheck = 'test "$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)" = "$TARGET_SHA"'
    expect(workflow.split(staleCheck)).toHaveLength(4)
    expect(workflow).toContain('parent_version=')
    expect(workflow).toContain('if [ "$version" = "$parent_version" ]')
    expect(workflow).toContain('eligible=false')
  })

  it('never moves an existing tag and creates releases from the exact tag', () => {
    expect(workflow).toContain('test "$(resolve_tag)" = "$TARGET_SHA"')
    expect(workflow).not.toContain('force: true')
    expect(workflow).not.toContain('git tag -f')
    expect(workflow).not.toContain('git/refs" --input')
    expect(workflow).toContain('gh release create "$TAG"')
    expect(workflow).toContain('--verify-tag')
    expect(workflow).toContain('--target "$TARGET_SHA"')
  })

  it('serializes retries and makes an existing matching release a no-op', () => {
    expect(workflow).toContain('group: release')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('gh release view "$TAG"')
    expect(workflow).toContain('Release $TAG already exists at the qualified commit')
    expect(workflow).toContain('exit 0')
  })
})

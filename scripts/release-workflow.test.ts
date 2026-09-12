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

  it('binds qualification and API-only version reads to one SHA', () => {
    expect(workflow).toContain('TARGET_SHA: ${{ github.event.workflow_run.head_sha }}')
    expect(workflow).toContain('actions/runs/$RUN_ID/jobs?per_page=100')
    expect(workflow).toContain('.[].jobs[]')
    expect(workflow).toContain('.name == "ci-complete"')
    expect(workflow).toContain('.conclusion == "success"')
    expect(workflow).not.toContain('actions/checkout')
    expect(workflow).not.toContain('git checkout')
    expect(workflow).toContain('git/commits/$TARGET_SHA')
    expect(workflow).toContain('contents/package.json?ref=$TARGET_SHA')
    expect(workflow).toContain('contents/package.json?ref=$parent')
  })

  it('accepts SemVer and rejects malformed identifiers', () => {
    const pattern = workflow.match(/semver='([^']+)'/)?.[1]
    expect(pattern).toBeDefined()
    const semver = new RegExp(pattern ?? '')

    for (const valid of ['1.2.3', '1.2.3-alpha.1', '1.2.3+build.5']) {
      expect(semver.test(valid)).toBe(true)
    }
    for (const invalid of ['1.2.3-01', '1.2.3+.', '01.2.3', '1.2']) {
      expect(semver.test(invalid)).toBe(false)
    }
  })

  it('rejects stale candidates and commits without a version change', () => {
    const staleCheck = 'test "$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)" = "$TARGET_SHA"'
    expect(workflow.split(staleCheck)).toHaveLength(1)
    expect(workflow.match(/^ {10}abort_if_stale$/gm)).toHaveLength(3)
    expect(workflow).toContain(
      'current_main="$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)"'
    )
    expect(workflow).toContain('parent_version=')
    expect(workflow).toContain('if [ "$version" = "$parent_version" ]')
    expect(workflow).toContain('eligible=false')
  })

  it('fails closed while checking tags and never moves an existing tag', () => {
    expect(workflow).toContain('git/matching-refs/tags/$TAG')
    expect(workflow).toContain('select(.ref == $ref)')
    expect(workflow).not.toContain('git/ref/tags/$TAG" >/dev/null 2>&1')
    expect(workflow).toContain('test "$(resolve_tag)" = "$TARGET_SHA"')
    expect(workflow).not.toContain('force: true')
    expect(workflow).not.toContain('git tag -f')
    expect(workflow).not.toContain('git/refs" --input')
    expect(workflow).toContain('gh api --method POST "repos/$REPOSITORY/git/refs"')
    expect(workflow).toContain('-f ref="refs/tags/$TAG"')
    expect(workflow).toContain('git/tags"')
    expect(workflow).toContain('-f object="$TARGET_SHA"')
    expect(workflow).toContain('-f sha="$tag_object"')
    expect(workflow).toContain('live_tag_object')
    expect(workflow).toContain('tag_message="$(')
    expect(workflow).toContain('if [ "$tag_message" = "Qualified by CI run $RUN_ID" ]; then')
    expect(workflow).toContain('tag_owned=true')
    expect(workflow).toContain('gh api --method DELETE "repos/$REPOSITORY/git/refs/tags/$TAG"')
    expect(workflow).toContain('gh release create "$TAG"')
    expect(workflow).toContain('--verify-tag')
    expect(workflow).toContain('--draft')
    expect(workflow).toContain('gh release edit "$TAG" --repo "$REPOSITORY" --draft=false')
    expect(workflow).toContain('gh release delete "$TAG" --repo "$REPOSITORY" --yes')
    expect(workflow).toContain('release_marker="<!-- hs-buddy-release-ci:$RUN_ID -->"')
    expect(workflow).toContain('grep -Fq "$release_marker"')
    expect(workflow).not.toContain('--target "$TARGET_SHA"')
  })

  it('serializes retries and makes an existing matching release a no-op', () => {
    expect(workflow).toContain('group: release')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('repos/$REPOSITORY/releases?per_page=100')
    expect(workflow).toContain('select(.tag_name == $tag)')
    expect(workflow).toContain('gh release view "$TAG"')
    expect(workflow).toContain('Release $TAG already exists at the qualified commit')
    expect(workflow).toContain('exit 0')
  })
})

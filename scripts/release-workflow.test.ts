import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/release.yml'),
  'utf8'
).replaceAll('\r\n', '\n')

const bashAvailable = spawnSync('bash', ['--version'], { stdio: 'ignore' }).status === 0
const waitFunctionStart = workflow.indexOf('          wait_for_exact_release() {')
const waitFunctionEnd = workflow.indexOf('          delete_release_id() {', waitFunctionStart)
const waitFunction = workflow.slice(waitFunctionStart, waitFunctionEnd).replace(/^ {10}/gm, '')

const delayedVisibilitySetup = `counter="$(mktemp)"
trap 'rm -f "$counter"' EXIT
printf '0' > "$counter"
find_exact_release() {
  count="$(( $(cat "$counter") + 1 ))"
  printf '%s' "$count" > "$counter"
  if [ "$count" -lt 3 ]; then
    printf 'null\\n'
  else
    printf '{"id":123}\\n'
  fi
}
sleep() { :; }`

const delayedVisibilityAssertion = `release="$(wait_for_exact_release)"
printf '%s\\n%s\\n' "$release" "$(cat "$counter")"`

const duplicateFailureSetup = `counter="$(mktemp)"
trap 'rm -f "$counter"' EXIT
printf '0' > "$counter"
find_exact_release() {
  count="$(( $(cat "$counter") + 1 ))"
  printf '%s' "$count" > "$counter"
  if [ "$count" = 1 ]; then return 5; fi
  printf '{"id":123}\\n'
}
sleep() { :; }`

const duplicateFailureAssertion = `wait_for_exact_release
status=$?
printf '%s\\n%s\\n' "$status" "$(cat "$counter")"`

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
})

describe('release artifact safety contract', () => {
  it('rejects stale candidates and carries forward an untagged version', () => {
    const staleCheck = 'test "$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)" = "$TARGET_SHA"'
    expect(workflow.split(staleCheck)).toHaveLength(1)
    const staleGuard = workflow.split('abort_if_stale() {')[1]?.split('\n          }')[0]
    expect(staleGuard).toContain(
      'if ! current_main="$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)"; then\n              trap - ERR\n              cleanup_owned_artifacts\n              exit 1\n            fi'
    )
    expect(staleGuard).toContain('if [ "$current_main" = "$TARGET_SHA" ]; then')
    expect(staleGuard).toContain('exit 1')
    expect(workflow.match(/^ {10}abort_if_stale$/gm)).toHaveLength(3)
    expect(workflow).toContain(
      'current_main="$(gh api "repos/$REPOSITORY/commits/main" --jq .sha)"'
    )
    expect(workflow).toContain('parent_version=')
    expect(workflow).toContain('if [ "$version" = "$parent_version" ]')
    expect(workflow).toContain('select(.tag_name == $tag and .draft == false)')
    expect(workflow).toContain('if [ "$published_count" != 0 ]')
    expect(workflow).toContain(
      'Carrying forward unpublished version $version from a superseded run'
    )
    expect(workflow).toMatch(
      /Carrying forward unpublished version \$version[\s\S]+echo "eligible=true" >> "\$GITHUB_OUTPUT"/
    )
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
    expect(workflow).toContain('live_tag_ref="$(gh api "repos/$REPOSITORY/git/ref/tags/$TAG")"')
    expect(workflow).toContain('if [ "$tag_message" = "Qualified by CI run $RUN_ID" ]; then')
    expect(workflow).toContain(
      '[ "$live_tag_message" = "Qualified by CI run $tag_owner_run_id" ] &&'
    )
    expect(workflow).toContain('[ "$live_tag_object" = "$tag_owned_object" ] &&')
    expect(workflow).toContain('tag_owned=true')
    expect(workflow).toContain('--force-with-lease="refs/tags/$TAG:$expected_object"')
    expect(workflow).toContain('git init --bare "$git_dir"')
    expect(workflow).toContain('git --git-dir="$git_dir"')
    expect(workflow).toContain(`":refs/tags/$TAG"`)
    expect(workflow).toContain('Refusing to delete replacement tag object')
    expect(workflow).toContain('gh release create "$TAG"')
    expect(workflow).toContain('--verify-tag')
    expect(workflow).toContain('--draft')
    expect(workflow).toContain(
      'gh api --method PATCH "repos/$REPOSITORY/releases/$release_id" -F draft=false'
    )
    expect(workflow).toContain('delete_release_id "$release_id"')
    expect(workflow).toContain('release_id="$(jq -r .id <<< "$release_json")"')
    expect(workflow).toContain('release_marker="<!-- hs-buddy-release-ci:$RUN_ID -->"')
    expect(workflow).toContain('grep -Fq "$release_marker"')
    expect(workflow).not.toContain('--target "$TARGET_SHA"')
  })
})

describe('release cleanup and idempotency contract', () => {
  it('recovers marker-owned artifacts and keeps error cleanup active', () => {
    expect(workflow).toContain('retry_command() {')
    expect(workflow).toContain('for attempt in 1 2 3; do')
    expect(workflow).toContain('retry_command gh api "$@"')
    expect(workflow).toContain('delete_release_id() {')
    expect(workflow).toContain('delete_tag_ref() {')
    expect(workflow).toContain('restore_tag_ref() {')
    expect(workflow).toContain('[.[][] | select(.id == $id)] | length')
    expect(workflow).toContain('cleanup_release="$(')
    expect(workflow).toContain('cleanup_tag_ref="$(')
    expect(workflow).toContain('release_count_before_tag_delete="$(')
    expect(workflow).toContain('release_count_after_tag_delete="$(')
    const cleanupIndex = workflow.indexOf('cleanup_owned_artifacts() {')
    const trapIndex = workflow.indexOf('trap on_error ERR')
    const finalOwnershipClearIndex = workflow.lastIndexOf('managed_release=false')
    const finalTrapRemovalIndex = workflow.lastIndexOf('trap - ERR')
    expect(cleanupIndex).toBeGreaterThan(-1)
    expect(trapIndex).toBeGreaterThan(cleanupIndex)
    expect(finalOwnershipClearIndex).toBeGreaterThan(trapIndex)
    expect(finalTrapRemovalIndex).toBeGreaterThan(finalOwnershipClearIndex)
    expect(workflow).toContain('previous_run_id="${BASH_REMATCH[1]}"')
    expect(workflow).toContain('tag_owner_run_id="$previous_run_id"')
    expect(workflow).toContain('tag_owned_target="$tag_target"')
    const recoveryIndex = workflow.indexOf('previous_run_id="${BASH_REMATCH[1]}"')
    const recoveryDeleteIndex = workflow.indexOf('delete_tag_ref', recoveryIndex)
    expect(workflow.indexOf('tag_owner_run_id="$RUN_ID"', recoveryDeleteIndex)).toBeGreaterThan(
      recoveryDeleteIndex
    )
    expect(workflow.indexOf('tag_owned_target="$TARGET_SHA"', recoveryDeleteIndex)).toBeGreaterThan(
      recoveryDeleteIndex
    )
    expect(workflow).toContain('live_previous_release="$(')
    expect(workflow).toContain('repos/$REPOSITORY/releases/$previous_release_id')
    expect(workflow).toContain('test "$replacement_release_count" = 0')
    expect(workflow).toContain('restore_tag_ref "$previous_tag_object"')
    expect(workflow).toContain('<!-- hs-buddy-release-ci:$previous_run_id -->')
  })

  it('serializes retries and makes an existing matching release a no-op', () => {
    expect(workflow).toMatch(/runs-on: ubuntu-latest\n {4}concurrency:\n {6}group: release/)
    expect(workflow).not.toMatch(/^concurrency:/m)
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('repos/$REPOSITORY/releases?per_page=100')
    expect(workflow).toContain('select(.tag_name == $tag)')
    expect(workflow).toContain('live_release="$(gh api "repos/$REPOSITORY/releases/$release_id")"')
    expect(workflow).toContain('Release $TAG already exists at the qualified commit')
    expect(workflow).toContain('exit 0')
  })
})

describe('release visibility error handling', () => {
  it('uses bounded exact-release discovery after draft creation', () => {
    expect(waitFunctionStart).toBeGreaterThan(-1)
    expect(waitFunctionEnd).toBeGreaterThan(waitFunctionStart)
    expect(waitFunction).toContain('for attempt in 1 2 3; do')
    const creation = workflow.slice(workflow.indexOf('if [ "$release_json" = null ]; then'))
    expect(creation).toContain('release_json="$(wait_for_exact_release)"')
    expect(creation).not.toMatch(
      /release_json="\$\(\n\s+gh api --paginate "repos\/\$REPOSITORY\/releases\?per_page=100"/
    )
  })

  it.runIf(bashAvailable)('recovers when a new draft is briefly absent', () => {
    const result = execFileSync(
      'bash',
      ['-c', `${delayedVisibilitySetup}\n${waitFunction}\n${delayedVisibilityAssertion}`],
      { encoding: 'utf8' }
    )
    expect(result).toBe('{"id":123}\n3\n')
  })

  it('retries API transport but propagates exact-lookup errors', () => {
    expect(workflow).toContain(
      'find_exact_release() {\n            retry_api --paginate "repos/$REPOSITORY/releases?per_page=100"'
    )
    expect(waitFunction).toContain('candidate="$(find_exact_release)" || return')
  })

  it.runIf(bashAvailable)('fails immediately after a duplicate-release error', () => {
    const result = execFileSync(
      'bash',
      ['-c', `${duplicateFailureSetup}\n${waitFunction}\n${duplicateFailureAssertion}`],
      { encoding: 'utf8' }
    )
    expect(result).toBe('5\n1\n')
  })
})

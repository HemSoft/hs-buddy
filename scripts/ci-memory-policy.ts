import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

interface Change {
  path: string
  before?: string
  after?: string
}

function metadataOnly(change: Change): boolean {
  if (change.path !== 'package.json' || !change.before || !change.after) return false
  const before = JSON.parse(change.before) as Record<string, unknown>
  const after = JSON.parse(change.after) as Record<string, unknown>
  delete before.version
  delete after.version
  return JSON.stringify(before) === JSON.stringify(after)
}

function cannotAffectMemory(change: Change): boolean {
  return (
    /^(docs\/|e2e\/)/.test(change.path) ||
    /^(README|CHANGELOG|CONTRIBUTING)\.md$/.test(change.path) ||
    change.path === 'playwright.config.ts' ||
    metadataOnly(change)
  )
}

export function memoryPolicy(event: string, draft: boolean, changes: Change[]) {
  if (event !== 'pull_request') {
    return {
      mode: 'run',
      reason: 'Full qualification for main, schedule, dispatch, or merge group.',
    }
  }
  const relevant = changes.filter(change => !cannotAffectMemory(change))
  if (changes.length > 0 && relevant.length === 0) {
    return {
      mode: 'skip',
      reason: 'Only docs, browser tests, or package version metadata changed.',
    }
  }
  return draft
    ? { mode: 'defer', reason: 'Draft review: mark ready to qualify this revision before merge.' }
    : { mode: 'run', reason: 'Runtime inputs changed or impact could not be proven safe.' }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function readChanges(base: string, head: string): Change[] {
  const mergeBase = git('merge-base', base, head).trim()
  // Disabling rename detection includes both old and new paths, so moving runtime
  // code into a skipped directory cannot hide its deletion from the application.
  return git('diff', '--no-renames', '--name-only', '-z', mergeBase, head)
    .split('\0')
    .filter(Boolean)
    .map(file => {
      if (file !== 'package.json') return { path: file }
      return {
        path: file,
        before: git('show', `${mergeBase}:package.json`),
        after: git('show', `${head}:package.json`),
      }
    })
}

if (import.meta.main) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')) as {
    pull_request?: { draft: boolean; base: { sha: string }; head: { sha: string } }
  }
  const pr = event.pull_request
  if (eventName === 'pull_request' && !pr) throw new Error('Missing pull request context')
  const changes = pr ? readChanges(pr.base.sha, pr.head.sha) : []
  const policy = memoryPolicy(eventName, pr?.draft === true, changes)
  appendFileSync(process.env.GITHUB_OUTPUT!, `mode=${policy.mode}\n`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY!, `## Memory qualification\n\n${policy.reason}\n`)
  console.log(policy.reason)
}

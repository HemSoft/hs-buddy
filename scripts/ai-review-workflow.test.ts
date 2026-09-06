import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/ai-review-automerge.yml', 'utf8').replaceAll(
  '\r\n',
  '\n'
)

it('keeps the privileged controller off automatic PR-owned workflow definitions', () => {
  const triggerBlock = workflow.split('\npermissions:')[0]
  const events = [...triggerBlock.matchAll(/^ {2}([a-z_]+):/gm)].map(match => match[1])
  const trustedEvents = new Set([
    'pull_request_target',
    'issue_comment',
    'workflow_run',
    'schedule',
    'workflow_dispatch',
  ])
  expect(events.length).toBeGreaterThan(0)
  expect(events.every(event => trustedEvents.has(event))).toBe(true)
  expect(workflow).toContain("github.ref == 'refs/heads/main'")
  expect(workflow).toContain('ref: refs/heads/main')
  expect(workflow).toContain('persist-credentials: false')
  expect(triggerBlock).toContain('auto_merge_enabled')
  expect(triggerBlock).toContain('auto_merge_disabled')
})

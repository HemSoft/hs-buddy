import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/benchmarks.yml'), 'utf8')

function pushBlock(): string {
  const newline = '\\r?\\n'
  const match = workflow.match(
    new RegExp(`^  push:${newline}[\\s\\S]*?(?=${newline}${newline}permissions:)`, 'm')
  )
  if (!match) throw new Error('Missing push trigger block')
  return match[0]
}

const deploymentOnlyPaths = [
  '.github/workflows/sfl-pr-review-auto.yml',
  '.sfl/sfl.json',
  'sfl.json',
]

describe('Benchmarks workflow', () => {
  it('skips SFL deployment-only pushes', () => {
    const trigger = pushBlock()
    expect(trigger).toContain('paths-ignore:')
    for (const path of deploymentOnlyPaths) expect(trigger).toContain(`- '${path}'`)
  })

  it('keeps manual benchmark dispatch available', () => {
    expect(workflow).toContain('  workflow_dispatch:')
  })
})

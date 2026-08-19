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

function ignoredPushPaths(): string[] {
  const match = pushBlock().match(/^ {4}paths-ignore:\r?\n((?: {6}- ['"][^'"\r\n]+['"]\r?\n?)+)/m)
  if (!match) throw new Error('Missing push paths-ignore list')
  return Array.from(match[1].matchAll(/^ {6}- ['"]([^'"]+)['"]$/gm), ([, path]) => path)
}

const deploymentOnlyPaths = [
  '.github/workflows/sfl-pr-review-auto.yml',
  '.sfl/sfl.json',
  'sfl.json',
]

describe('Benchmarks workflow', () => {
  it('skips SFL deployment-only pushes', () => {
    expect(ignoredPushPaths()).toEqual(deploymentOnlyPaths)
  })

  it('keeps manual benchmark dispatch available', () => {
    expect(workflow).toContain('  workflow_dispatch:')
  })
})

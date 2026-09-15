import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
}
const markdownConfig = readFileSync('.markdownlint-cli2.jsonc', 'utf8')
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n')

function jobBlock(name: string): string {
  const block = workflow.split(`  ${name}:`)[1]?.split(/\n {2}[\w-]+:/, 1)[0]
  if (!block) throw new Error(`Missing workflow job ${name}`)
  return block
}

describe('Markdown CI contract', () => {
  it('runs the repository Markdown command in the existing lint job', () => {
    expect(packageJson.scripts['lint:md']).toBe('markdownlint-cli2 "**/*.md"')
    expect(jobBlock('lint')).toContain('- name: Lint Markdown\n        run: bun run lint:md')
  })

  it('keeps workflow Markdown covered by the repository-wide glob', () => {
    expect(packageJson.scripts['lint:md']).toContain('**/*.md')
    expect(markdownConfig).not.toContain('.github/workflows/**')
  })

  it('propagates a Markdown failure through both aggregate gates', () => {
    expect(jobBlock('ci-feedback')).toMatch(/needs:[\s\S]*\blint\b/)
    expect(jobBlock('ci-complete')).toContain('ci-feedback')
  })
})

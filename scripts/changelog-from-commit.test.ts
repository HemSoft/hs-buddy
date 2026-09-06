import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'buddy-changelog-test-'))
  mkdirSync(join(directory, 'scripts'))
  copyFileSync(
    resolve('scripts/changelog-from-commit.ts'),
    join(directory, 'scripts/changelog-from-commit.ts')
  )
  writeFileSync(join(directory, 'message'), 'fix: café entry\n')
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function run() {
  const result = spawnSync(
    'bun',
    [join(directory, 'scripts/changelog-from-commit.ts'), join(directory, 'message')],
    {
      cwd: directory,
      encoding: 'utf8',
    }
  )
  expect(result.status, result.stderr).toBe(0)
}

it.each(['1.2.3', '1.2.3+build.4', String.raw`1.2.3+test\d(a)[b]{2}^$|?*`])(
  'matches version text literally: %s',
  version => {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }))
    writeFileSync(
      join(directory, 'CHANGELOG.md'),
      `# Changelog\n\n## [Unreleased]\n\n## [${version}] - 2026-09-06\n\n- Version bump\n`
    )
    run()
    const first = readFileSync(join(directory, 'CHANGELOG.md'), 'utf8')
    expect(first).toContain(`## [${version}] - 2026-09-06\n\n### Fixed\n\n- Café entry\n`)
    run()
    expect(readFileSync(join(directory, 'CHANGELOG.md'), 'utf8')).toBe(first)
  }
)

it('truncates removed trailing headings instead of leaving old bytes', () => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  writeFileSync(
    join(directory, 'CHANGELOG.md'),
    '# Changelog\n\n## [1.2.3] - 2026-09-06\n\n### Fixed\n\n- Café entry\n\n## [1.2.2] - 2026-09-05\n' +
      ' '.repeat(500)
  )
  run()
  const text = readFileSync(join(directory, 'CHANGELOG.md'), 'utf8')
  expect(text).not.toContain('1.2.2')
  expect(text.length).toBeLessThan(100)
  expect(text).toContain('- Café entry')
})

it.each(['message', 'package.json', 'CHANGELOG.md'])('does not create a missing %s', missing => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  writeFileSync(join(directory, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n')
  rmSync(join(directory, missing))
  run()
  expect(existsSync(join(directory, missing))).toBe(false)
})

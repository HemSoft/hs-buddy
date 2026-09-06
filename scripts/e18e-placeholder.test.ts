import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createE18ePlaceholder } from './e18e-placeholder'

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'buddy-e18e-test-'))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

it('creates the missing parent and placeholder exclusively', () => {
  const target = join(directory, 'dist-electron', 'main.js')
  expect(createE18ePlaceholder(target)).toBe(true)
  expect(readFileSync(target, 'utf8')).toContain('Temporary e18e analysis placeholder')
  expect(createE18ePlaceholder(target)).toBe(false)
})

it('never truncates an existing bundle', () => {
  const target = join(directory, 'main.js')
  writeFileSync(target, 'real bundle bytes')
  expect(createE18ePlaceholder(target)).toBe(false)
  expect(readFileSync(target, 'utf8')).toBe('real bundle bytes')
})

it('propagates errors other than an existing destination', () => {
  const parent = join(directory, 'file')
  writeFileSync(parent, 'not a directory')
  expect(() => createE18ePlaceholder(join(parent, 'main.js'))).toThrow()
})

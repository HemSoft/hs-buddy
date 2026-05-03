import { describe, it, expect } from 'vitest'
import { execAsync, execFileAsync } from './utils'

describe('utils', () => {
  describe('execAsync', () => {
    it('returns a promise that resolves with { stdout, stderr }', async () => {
      const result = await execAsync('echo hello')
      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result.stdout.trim()).toBe('hello')
    })

    it('rejects on invalid command', async () => {
      await expect(execAsync('__nonexistent_cmd_xyz__')).rejects.toThrow()
    })
  })

  describe('execFileAsync', () => {
    it('returns a promise that resolves with { stdout, stderr }', async () => {
      const cmd = process.platform === 'win32' ? 'cmd' : 'echo'
      const args = process.platform === 'win32' ? ['/c', 'echo hello'] : ['hello']
      const result = await execFileAsync(cmd, args)
      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result.stdout.trim()).toBe('hello')
    })

    it('rejects on invalid executable', async () => {
      await expect(execFileAsync('__nonexistent_bin_xyz__')).rejects.toThrow()
    })
  })
})

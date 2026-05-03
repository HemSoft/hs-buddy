import { describe, it, expect } from 'vitest'
import type { Worker, JobConfig, WorkerResult } from './types'

describe('workers/types', () => {
  it('JobConfig interface allows exec-worker fields', () => {
    const config: JobConfig = { command: 'echo hello', cwd: '/tmp', timeout: 5000, shell: 'bash' }
    expect(config.command).toBe('echo hello')
    expect(config.shell).toBe('bash')
  })

  it('JobConfig interface allows ai-worker fields', () => {
    const config: JobConfig = { prompt: 'hello', model: 'gpt-4' }
    expect(config.prompt).toBe('hello')
  })

  it('JobConfig interface allows skill-worker fields', () => {
    const config: JobConfig = { skillName: 'deploy', action: 'run', params: { env: 'prod' } }
    expect(config.skillName).toBe('deploy')
  })

  it('Worker interface requires execute method', () => {
    const worker: Worker = {
      execute: async (_config: JobConfig, _signal?: AbortSignal): Promise<WorkerResult> => ({
        success: true,
        output: 'done',
        duration: 100,
        exitCode: 0,
      }),
    }
    expect(typeof worker.execute).toBe('function')
  })
})

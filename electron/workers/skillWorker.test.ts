import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/copilotClient', () => ({
  sendPrompt: vi.fn(),
  DEFAULT_MODEL: 'gpt-4',
}))

vi.mock('../../src/utils/workerUtils', () => ({
  workerSuccess: vi.fn((output, start, _max) => ({
    success: true,
    output,
    duration: Date.now() - start,
    exitCode: 0,
  })),
  workerFailure: vi.fn((err, start) => ({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    duration: Date.now() - start,
  })),
  workerConfigError: vi.fn((field: string) => ({
    success: false,
    error: `Missing required config field: ${field}`,
    duration: 0,
  })),
  resolvePromptDefaults: vi.fn((config, defaults) => ({
    model: config.model ?? defaults.model,
    timeout: config.timeout ?? defaults.timeout,
  })),
}))

vi.mock('../../src/utils/shellUtils', () => ({
  buildSkillPrompt: vi.fn(
    (name: string, action?: string, params?: unknown) =>
      `skill:${name} action:${action ?? 'default'} params:${JSON.stringify(params)}`
  ),
}))

import { skillWorker } from './skillWorker'
import { sendPrompt } from '../services/copilotClient'
import { buildSkillPrompt } from '../../src/utils/shellUtils'

describe('skillWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns config error when skillName is missing', async () => {
    const result = await skillWorker.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toContain('skillName')
  })

  it('builds skill prompt and sends to copilot', async () => {
    vi.mocked(sendPrompt).mockResolvedValue('skill output')
    const result = await skillWorker.execute({
      skillName: 'my-skill',
      action: 'run',
      params: { key: 'value' },
    })
    expect(buildSkillPrompt).toHaveBeenCalledWith('my-skill', 'run', { key: 'value' })
    expect(result.success).toBe(true)
    expect(result.output).toBe('skill output')
  })

  it('passes abort signal through', async () => {
    vi.mocked(sendPrompt).mockResolvedValue('done')
    const controller = new AbortController()
    await skillWorker.execute({ skillName: 'test' }, controller.signal)
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }))
  })

  it('returns failure when sendPrompt rejects', async () => {
    vi.mocked(sendPrompt).mockRejectedValue(new Error('Copilot unavailable'))
    const result = await skillWorker.execute({ skillName: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Copilot unavailable')
  })

  it('sends prompt with cwd set to skills directory', async () => {
    vi.mocked(sendPrompt).mockResolvedValue('ok')
    await skillWorker.execute({ skillName: 'some-skill' })
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: expect.stringMatching(/\.agents[\\/]skills/),
      })
    )
  })
})

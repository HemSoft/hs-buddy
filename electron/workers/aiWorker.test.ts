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

import { aiWorker } from './aiWorker'
import { sendPrompt } from '../services/copilotClient'

describe('aiWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns config error when prompt is missing', async () => {
    const result = await aiWorker.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toContain('prompt')
  })

  it('sends prompt and returns success', async () => {
    vi.mocked(sendPrompt).mockResolvedValue('AI response here')
    const result = await aiWorker.execute({ prompt: 'Hello AI' })
    expect(result.success).toBe(true)
    expect(result.output).toBe('AI response here')
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Hello AI', model: 'gpt-4' })
    )
  })

  it('passes abort signal to sendPrompt', async () => {
    vi.mocked(sendPrompt).mockResolvedValue('done')
    const controller = new AbortController()
    await aiWorker.execute({ prompt: 'test' }, controller.signal)
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }))
  })

  it('returns failure when sendPrompt rejects', async () => {
    vi.mocked(sendPrompt).mockRejectedValue(new Error('API timeout'))
    const result = await aiWorker.execute({ prompt: 'test' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('API timeout')
  })

  it('uses custom model from config', async () => {
    vi.mocked(sendPrompt).mockResolvedValue('result')
    await aiWorker.execute({ prompt: 'test', model: 'custom-model' })
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ model: 'custom-model' }))
  })
})

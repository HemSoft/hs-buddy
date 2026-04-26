import { sendPrompt, DEFAULT_MODEL } from '../services/copilotClient'
import type { Worker, WorkerResult, JobConfig } from './types'
import {
  workerSuccess,
  workerFailure,
  workerConfigError,
  resolvePromptDefaults,
} from '../../src/utils/workerUtils'

const DEFAULT_TIMEOUT = 120_000
const MAX_OUTPUT_SIZE = 1_024_000

export const aiWorker: Worker = {
  async execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult> {
    if (!config.prompt) return workerConfigError('prompt')
    const start = Date.now()
    const { model, timeout } = resolvePromptDefaults(config, {
      model: DEFAULT_MODEL,
      timeout: DEFAULT_TIMEOUT,
    })
    try {
      const output = await sendPrompt({ prompt: config.prompt, model, timeout, signal })
      return workerSuccess(output, start, MAX_OUTPUT_SIZE)
    } catch (err) {
      return workerFailure(err, start)
    }
  },
}

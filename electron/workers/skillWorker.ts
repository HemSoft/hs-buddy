import path from 'node:path'
import os from 'node:os'
import { sendPrompt, DEFAULT_MODEL } from '../services/copilotClient'
import type { Worker, WorkerResult, JobConfig } from './types'
import {
  workerSuccess,
  workerFailure,
  workerConfigError,
  resolvePromptDefaults,
} from '../../src/utils/workerUtils'
import { buildSkillPrompt } from '../../src/utils/shellUtils'

const DEFAULT_TIMEOUT = 120_000
const MAX_OUTPUT_SIZE = 1_024_000

/** Skills live under ~/.agents/skills — run the Copilot agent from there */
const SKILLS_DIR = path.join(os.homedir(), '.agents', 'skills')

export const skillWorker: Worker = {
  async execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult> {
    if (!config.skillName) return workerConfigError('skillName')
    const start = Date.now()
    const { model, timeout } = resolvePromptDefaults(config, {
      model: DEFAULT_MODEL,
      timeout: DEFAULT_TIMEOUT,
    })
    try {
      const prompt = buildSkillPrompt(config.skillName, config.action, config.params)
      const output = await sendPrompt({ prompt, model, timeout, signal, cwd: SKILLS_DIR })
      return workerSuccess(output, start, MAX_OUTPUT_SIZE)
    } catch (err) {
      return workerFailure(err, start)
    }
  },
}

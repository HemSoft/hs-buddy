import { openPullNumbers, reconcilePull } from './ai-review-controller'
import { githubApi } from './ai-review-github'
import { reconcileBatch } from './ai-review-batch'

const repository = process.env.GITHUB_REPOSITORY ?? 'HemSoft/hs-buddy'
if (repository !== 'HemSoft/hs-buddy') throw new Error('This policy is scoped to HemSoft/hs-buddy')
const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN is required')
const api = githubApi(token)
const requested = process.env.PR_NUMBER
if (requested && !/^[1-9]\d*$/.test(requested))
  throw new Error('PR_NUMBER must be a positive integer')
const numbers = requested ? [Number(requested)] : await openPullNumbers(api, repository)
const options = {
  apply: process.argv.includes('--apply'),
  enabled: process.env.AI_AUTOMERGE_ENABLED === 'true',
}
const failed = await reconcileBatch(
  numbers,
  async number => {
    console.log(await reconcilePull(api, repository, number, options))
  },
  (number, error) => {
    console.error(`PR #${number}: ${error instanceof Error ? error.message : 'evaluation failed'}`)
  }
)
if (failed) process.exitCode = 1

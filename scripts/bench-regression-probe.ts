import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

// Temporary #655 proof: enforce the measured slowdown despite this PR's harness changes.
const policy = JSON.parse(readFileSync('bench-policy.json', 'utf8'))
policy.mode = 'enforce'
policy.reasons = ['Temporary #655 controlled regression proof; remove before merge']
writeFileSync('bench-policy.json', JSON.stringify(policy, null, 2) + '\n')
appendFileSync(
  process.env.GITHUB_STEP_SUMMARY!,
  '\nControlled #655 proof overrides advisory mode to enforce. Remove this probe before merge.\n'
)

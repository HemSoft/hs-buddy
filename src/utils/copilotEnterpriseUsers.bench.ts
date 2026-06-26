import { bench, describe } from 'vitest'
import {
  normalizeCopilotEnterpriseUsersSnapshot,
  parseCopilotEnterpriseUsersContent,
} from './copilotEnterpriseUsers'

function makeNestedUser(index: number) {
  return {
    User: `user-${String(index).padStart(4, '0')}`,
    Success: index % 17 !== 0,
    Responses: Array.from({ length: 3 }, (_, day) => ({
      Day: day + 1,
      Response: {
        usageItems: Array.from({ length: 4 }, (_, item) => ({
          model: item % 2 === 0 ? 'Claude Opus 4.8' : 'GPT-5.4 Codex',
          grossQuantity: index + day + item,
          grossAmount: (index + day + item) * 0.01,
          netAmount: (index + day + item) * 0.005,
        })),
      },
    })),
  }
}

function makeDirectUser(index: number) {
  return {
    login: `direct-user-${String(index).padStart(4, '0')}`,
    grossQuantity: index * 3,
    grossAmount: index * 0.03,
    netAmount: index * 0.01,
    topModel: index % 2 === 0 ? 'Claude Sonnet 4.5' : 'GPT-5.4 Codex',
  }
}

function makeNestedSnapshot(userCount: number) {
  return {
    GeneratedAtUtc: '2026-06-26T12:00:00.000Z',
    Enterprise: 'bertelsmann',
    Organization: 'Relias-Engineering',
    Year: 2026,
    Month: 6,
    Days: [1, 2, 3],
    Users: Array.from({ length: userCount }, (_, index) => makeNestedUser(index)),
  }
}

function makeDirectSnapshot(userCount: number) {
  return {
    generatedAtUtc: '2026-06-26T12:00:00.000Z',
    org: 'HemSoft',
    users: Array.from({ length: userCount }, (_, index) => makeDirectUser(index)),
  }
}

const metadata = {
  sourceFile: 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json',
  fileLastWriteTime: '2026-06-26T12:00:00.000Z',
}
const nested10 = makeNestedSnapshot(10)
const nested100 = makeNestedSnapshot(100)
const nested500 = makeNestedSnapshot(500)
const direct500 = makeDirectSnapshot(500)
const nested100Json = `\uFEFF${JSON.stringify(nested100)}`

describe('parseCopilotEnterpriseUsersContent', () => {
  bench('100 nested users JSON with BOM', () => {
    parseCopilotEnterpriseUsersContent(nested100Json)
  })
})

describe('normalizeCopilotEnterpriseUsersSnapshot', () => {
  bench('10 nested users', () => {
    normalizeCopilotEnterpriseUsersSnapshot(nested10, metadata)
  })

  bench('100 nested users', () => {
    normalizeCopilotEnterpriseUsersSnapshot(nested100, metadata)
  })

  bench('500 nested users', () => {
    normalizeCopilotEnterpriseUsersSnapshot(nested500, metadata)
  })

  bench('500 direct aggregate users', () => {
    normalizeCopilotEnterpriseUsersSnapshot(direct500, metadata)
  })
})

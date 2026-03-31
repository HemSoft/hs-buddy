import { bench, describe } from 'vitest'
import {
  findCopilotBudget,
  findBudgetAcrossPages,
  type BudgetItem,
  type BudgetPageResponse,
} from './budgetUtils'

function makeBudgets(count: number): BudgetItem[] {
  return Array.from({ length: count }, (_, i) => ({
    budget_product_sku: i === count - 1 ? 'copilot_premium_requests' : `sku_${i}`,
    budget_amount: 300 + i * 10,
    prevent_further_usage: false,
    budget_entity_name: `org-${i}`,
  }))
}

const SMALL_LIST = makeBudgets(5)
const MEDIUM_LIST = makeBudgets(50)
const LARGE_LIST = makeBudgets(200)

describe('findCopilotBudget', () => {
  bench('5 budgets — no filter', () => {
    findCopilotBudget(SMALL_LIST)
  })

  bench('50 budgets — no filter', () => {
    findCopilotBudget(MEDIUM_LIST)
  })

  bench('200 budgets — no filter', () => {
    findCopilotBudget(LARGE_LIST)
  })

  bench('50 budgets — with entity filter (match)', () => {
    findCopilotBudget(MEDIUM_LIST, 'org-49')
  })

  bench('50 budgets — with entity filter (no match)', () => {
    findCopilotBudget(MEDIUM_LIST, 'nonexistent-org')
  })
})

describe('findBudgetAcrossPages', () => {
  bench('found on page 1', async () => {
    const fetchPage = async (_page: number): Promise<BudgetPageResponse> => ({
      budgets: makeBudgets(10),
      has_next_page: true,
    })
    await findBudgetAcrossPages(fetchPage, 'org-9')
  })

  bench('found on page 3 of 5', async () => {
    let call = 0
    const fetchPage = async (_page: number): Promise<BudgetPageResponse> => {
      call++
      if (call < 3)
        return {
          budgets: makeBudgets(10).map(b => ({ ...b, budget_product_sku: `other_${call}` })),
          has_next_page: true,
        }
      return { budgets: makeBudgets(10), has_next_page: true }
    }
    await findBudgetAcrossPages(fetchPage, 'org-9', 5)
  })

  bench('not found — exhaust 5 pages', async () => {
    const fetchPage = async (_page: number): Promise<BudgetPageResponse> => ({
      budgets: makeBudgets(10).map(b => ({ ...b, budget_product_sku: 'other' })),
      has_next_page: true,
    })
    await findBudgetAcrossPages(fetchPage, 'org-9', 5)
  })
})

import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { expect, vi } from 'vitest'
import {
  findCopilotBudget,
  findBudgetAcrossPages,
  type BudgetItem,
  type BudgetPageResponse,
} from '../utils/budgetUtils'

const feature = await loadFeature('src/features/budget-discovery.feature')

describeFeature(feature, ({ Scenario }) => {
  let budgets: BudgetItem[]
  let entityFilter: string | undefined
  let budgetResult: BudgetItem | undefined
  let paginatedResult: { budget_amount: number; prevent_further_usage: boolean } | null
  let pagesFetched: number

  Scenario('Prefer premium SKU over generic copilot', ({ Given, When, Then }) => {
    Given('a budget list with both "copilot_premium_request" and "copilot_business" SKUs', () => {
      budgets = [
        {
          budget_product_sku: 'copilot_business',
          budget_amount: 1000,
          prevent_further_usage: false,
        },
        {
          budget_product_sku: 'copilot_premium_request',
          budget_amount: 500,
          prevent_further_usage: false,
        },
      ]
    })
    When('searching for a copilot budget without entity filter', () => {
      budgetResult = findCopilotBudget(budgets)
    })
    Then('the premium SKU budget should be returned', () => {
      expect(budgetResult).toBeDefined()
      expect(budgetResult!.budget_product_sku).toBe('copilot_premium_request')
    })
  })

  Scenario('Match entity name with substring flexibility', ({ Given, When, Then, And }) => {
    Given('a budget with entity name "Relias"', () => {
      budgets = [
        {
          budget_product_sku: 'copilot_premium_request',
          budget_amount: 500,
          prevent_further_usage: false,
          budget_entity_name: 'Relias',
        },
      ]
    })
    And('an entity filter of "relias-engineering"', () => {
      entityFilter = 'relias-engineering'
    })
    When('searching for a copilot budget', () => {
      budgetResult = findCopilotBudget(budgets, entityFilter)
    })
    Then('the budget should match because the entity is a substring of the filter', () => {
      expect(budgetResult).toBeDefined()
      expect(budgetResult!.budget_entity_name).toBe('Relias')
    })
  })

  Scenario('Return undefined when no copilot budget exists', ({ Given, When, Then }) => {
    Given('a budget list with only "actions_compute" SKUs', () => {
      budgets = [
        {
          budget_product_sku: 'actions_compute',
          budget_amount: 2000,
          prevent_further_usage: false,
        },
        {
          budget_product_sku: 'packages_data_transfer',
          budget_amount: 500,
          prevent_further_usage: false,
        },
      ]
    })
    When('searching for a copilot budget without entity filter', () => {
      budgetResult = findCopilotBudget(budgets)
    })
    Then('the result should be undefined', () => {
      expect(budgetResult).toBeUndefined()
    })
  })

  Scenario('Find budget on first page of paginated results', ({ Given, When, Then, And }) => {
    Given('the API returns a matching budget on page 1', () => {
      pagesFetched = 0
    })
    When('searching across pages', async () => {
      const fetchPage = vi.fn(async (_page: number): Promise<BudgetPageResponse> => {
        pagesFetched++
        return {
          budgets: [
            {
              budget_product_sku: 'copilot_premium_request',
              budget_amount: 500,
              prevent_further_usage: false,
              budget_entity_name: 'test-org',
            },
          ],
          has_next_page: true,
        }
      })
      paginatedResult = await findBudgetAcrossPages(fetchPage, 'test-org')
    })
    Then('the match should be returned from page 1', () => {
      expect(paginatedResult).not.toBeNull()
      expect(paginatedResult!.budget_amount).toBe(500)
    })
    And('only 1 page should be fetched', () => {
      expect(pagesFetched).toBe(1)
    })
  })

  Scenario('Search across multiple pages until found', ({ Given, When, Then, And }) => {
    let fetchPage: (page: number) => Promise<BudgetPageResponse>

    Given('the API returns no match on pages 1 and 2', () => {
      pagesFetched = 0
    })
    And('a matching budget on page 3', () => {
      fetchPage = vi.fn(async (page: number): Promise<BudgetPageResponse> => {
        pagesFetched++
        if (page < 3) {
          return {
            budgets: [
              {
                budget_product_sku: 'actions_compute',
                budget_amount: 100,
                prevent_further_usage: false,
              },
            ],
            has_next_page: true,
          }
        }
        return {
          budgets: [
            {
              budget_product_sku: 'copilot_premium_request',
              budget_amount: 750,
              prevent_further_usage: false,
              budget_entity_name: 'test-org',
            },
          ],
          has_next_page: true,
        }
      })
    })
    When('searching across pages with max 10', async () => {
      paginatedResult = await findBudgetAcrossPages(fetchPage, 'test-org', 10)
    })
    Then('the match should be returned from page 3', () => {
      expect(paginatedResult).not.toBeNull()
      expect(paginatedResult!.budget_amount).toBe(750)
    })
    And('exactly 3 pages should be fetched', () => {
      expect(pagesFetched).toBe(3)
    })
  })

  Scenario('Return null when budget not found in any page', ({ Given, When, Then, And }) => {
    Given('the API returns 3 pages with no copilot budgets', () => {
      pagesFetched = 0
    })
    When('searching across pages with max 3', async () => {
      const fetchPage = vi.fn(async (page: number): Promise<BudgetPageResponse> => {
        pagesFetched++
        return {
          budgets: [
            {
              budget_product_sku: 'actions_compute',
              budget_amount: 100,
              prevent_further_usage: false,
            },
          ],
          has_next_page: page < 3,
        }
      })
      paginatedResult = await findBudgetAcrossPages(fetchPage, 'test-org', 3)
    })
    Then('the result should be null', () => {
      expect(paginatedResult).toBeNull()
    })
    And('all 3 pages should be fetched', () => {
      expect(pagesFetched).toBe(3)
    })
  })
})

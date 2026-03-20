import { describe, it, expect, vi } from 'vitest'
import {
  findCopilotBudget,
  findBudgetAcrossPages,
  type BudgetItem,
  type BudgetPageResponse,
} from './budgetUtils'

// ---------------------------------------------------------------------------
// findCopilotBudget
// ---------------------------------------------------------------------------
describe('findCopilotBudget', () => {
  const premiumBudget: BudgetItem = {
    budget_product_sku: 'copilot_premium_request',
    budget_amount: 1000,
    prevent_further_usage: true,
    budget_entity_name: 'Relias',
  }

  const copilotBudget: BudgetItem = {
    budget_product_sku: 'copilot_business',
    budget_amount: 500,
    prevent_further_usage: false,
    budget_entity_name: 'Relias',
  }

  const unrelatedBudget: BudgetItem = {
    budget_product_sku: 'actions_compute',
    budget_amount: 200,
    prevent_further_usage: false,
    budget_entity_name: 'Relias',
  }

  it('returns undefined for an empty array', () => {
    expect(findCopilotBudget([])).toBeUndefined()
  })

  it('returns undefined when no copilot-related SKU exists', () => {
    expect(findCopilotBudget([unrelatedBudget])).toBeUndefined()
  })

  it('finds a premium SKU budget', () => {
    expect(findCopilotBudget([unrelatedBudget, premiumBudget])).toBe(premiumBudget)
  })

  it('finds a copilot SKU budget when no premium exists', () => {
    expect(findCopilotBudget([unrelatedBudget, copilotBudget])).toBe(copilotBudget)
  })

  it('prefers premium over copilot when both exist', () => {
    expect(findCopilotBudget([copilotBudget, premiumBudget])).toBe(premiumBudget)
  })

  // --- entity filtering ---
  it('filters by exact entity name match (case-insensitive)', () => {
    const other: BudgetItem = { ...premiumBudget, budget_entity_name: 'OtherOrg' }
    expect(findCopilotBudget([other, premiumBudget], 'relias')).toBe(premiumBudget)
  })

  it('returns undefined when entity filter does not match any item', () => {
    expect(findCopilotBudget([premiumBudget], 'nonexistent-org')).toBeUndefined()
  })

  it('matches when entity is a substring of filter', () => {
    // budget_entity_name "Relias" is contained in filter "relias-engineering"
    expect(findCopilotBudget([premiumBudget], 'relias-engineering')).toBe(premiumBudget)
  })

  it('matches when filter is a substring of entity', () => {
    const item: BudgetItem = { ...premiumBudget, budget_entity_name: 'relias-engineering' }
    expect(findCopilotBudget([item], 'relias')).toBe(item)
  })

  it('handles undefined entity name gracefully', () => {
    const noEntity: BudgetItem = { ...premiumBudget, budget_entity_name: undefined }
    // empty entity '' won't match 'relias'
    expect(findCopilotBudget([noEntity], 'relias')).toBeUndefined()
    // without filter, it should still match by SKU
    expect(findCopilotBudget([noEntity])).toBe(noEntity)
  })

  it('handles undefined budget_product_sku gracefully', () => {
    const noSku = { ...premiumBudget, budget_product_sku: undefined as unknown as string }
    expect(findCopilotBudget([noSku])).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// findBudgetAcrossPages
// ---------------------------------------------------------------------------
describe('findBudgetAcrossPages', () => {
  it('finds a budget on the first page', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>().mockResolvedValue({
      budgets: [
        {
          budget_product_sku: 'copilot_premium_request',
          budget_amount: 1000,
          prevent_further_usage: true,
          budget_entity_name: 'Relias',
        },
      ],
      has_next_page: false,
    })

    const result = await findBudgetAcrossPages(fetchPage, 'relias-engineering')
    expect(result).toEqual({ budget_amount: 1000, prevent_further_usage: true })
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(1)
  })

  it('finds a budget on page 2 (the real-world Relias case)', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ budgets: [], has_next_page: true })
      .mockResolvedValueOnce({
        budgets: [
          {
            budget_product_sku: 'copilot_premium_request',
            budget_amount: 1000,
            prevent_further_usage: true,
            budget_entity_name: 'Relias',
          },
        ],
        has_next_page: true,
      })

    const result = await findBudgetAcrossPages(fetchPage, 'relias-engineering')
    expect(result).toEqual({ budget_amount: 1000, prevent_further_usage: true })
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenCalledWith(1)
    expect(fetchPage).toHaveBeenCalledWith(2)
  })

  it('finds a budget on a late page (page 5 of 7)', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()

    // Pages 1-4: empty, with more pages
    for (let i = 0; i < 4; i++) {
      fetchPage.mockResolvedValueOnce({ budgets: [], has_next_page: true })
    }
    // Page 5: has the budget
    fetchPage.mockResolvedValueOnce({
      budgets: [
        {
          budget_product_sku: 'copilot_premium_request',
          budget_amount: 2000,
          prevent_further_usage: false,
          budget_entity_name: 'MyOrg',
        },
      ],
      has_next_page: true,
    })

    const result = await findBudgetAcrossPages(fetchPage, 'MyOrg')
    expect(result).toEqual({ budget_amount: 2000, prevent_further_usage: false })
    expect(fetchPage).toHaveBeenCalledTimes(5)
  })

  it('returns null when budget is not on any page', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ budgets: [], has_next_page: true })
      .mockResolvedValueOnce({
        budgets: [
          {
            budget_product_sku: 'actions_compute',
            budget_amount: 100,
            prevent_further_usage: false,
            budget_entity_name: 'SomeOrg',
          },
        ],
        has_next_page: false,
      })

    const result = await findBudgetAcrossPages(fetchPage, 'relias-engineering')
    expect(result).toBeNull()
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('returns null when all pages are empty', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ budgets: [], has_next_page: true })
      .mockResolvedValueOnce({ budgets: [], has_next_page: false })

    const result = await findBudgetAcrossPages(fetchPage, 'relias-engineering')
    expect(result).toBeNull()
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('respects maxPages limit', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValue({ budgets: [], has_next_page: true })

    const result = await findBudgetAcrossPages(fetchPage, 'org', 3)
    expect(result).toBeNull()
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('uses default maxPages of 10', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValue({ budgets: [], has_next_page: true })

    await findBudgetAcrossPages(fetchPage, 'org')
    expect(fetchPage).toHaveBeenCalledTimes(10)
  })

  it('stops when has_next_page is false even if under maxPages', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ budgets: [], has_next_page: true })
      .mockResolvedValueOnce({ budgets: [], has_next_page: false })

    await findBudgetAcrossPages(fetchPage, 'org', 10)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('stops when has_next_page is undefined (missing field)', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ budgets: [] })

    await findBudgetAcrossPages(fetchPage, 'org')
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('handles missing budgets field as empty array', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ has_next_page: false })

    const result = await findBudgetAcrossPages(fetchPage, 'org')
    expect(result).toBeNull()
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('skips non-matching orgs on earlier pages', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({
        budgets: [
          {
            budget_product_sku: 'copilot_premium_request',
            budget_amount: 500,
            prevent_further_usage: false,
            budget_entity_name: 'OtherOrg',
          },
        ],
        has_next_page: true,
      })
      .mockResolvedValueOnce({
        budgets: [
          {
            budget_product_sku: 'copilot_premium_request',
            budget_amount: 1000,
            prevent_further_usage: true,
            budget_entity_name: 'Relias',
          },
        ],
        has_next_page: false,
      })

    const result = await findBudgetAcrossPages(fetchPage, 'relias-engineering')
    expect(result).toEqual({ budget_amount: 1000, prevent_further_usage: true })
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('stops iterating immediately once a match is found', async () => {
    const fetchPage = vi.fn<(page: number) => Promise<BudgetPageResponse>>()
      .mockResolvedValueOnce({ budgets: [], has_next_page: true })
      .mockResolvedValueOnce({
        budgets: [
          {
            budget_product_sku: 'copilot_premium_request',
            budget_amount: 1000,
            prevent_further_usage: true,
            budget_entity_name: 'Relias',
          },
        ],
        has_next_page: true, // more pages exist but we should stop
      })

    await findBudgetAcrossPages(fetchPage, 'relias-engineering')
    // Must NOT fetch page 3 — budget was found on page 2
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})

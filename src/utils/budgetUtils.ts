export interface BudgetItem {
  budget_product_sku: string
  budget_amount: number
  prevent_further_usage: boolean
  budget_entity_name?: string
}

export interface BudgetPageResponse {
  budgets?: BudgetItem[]
  has_next_page?: boolean
}

interface BudgetMatch {
  budget_amount: number
  prevent_further_usage: boolean
}

function isBudgetEntityMatch(entity: string, filterLower: string): boolean {
  return entity === filterLower || filterLower.includes(entity) || entity.includes(filterLower)
}

function matchesBudgetEntityFilter(budget: BudgetItem, entityFilter?: string): boolean {
  if (!entityFilter) {
    return true
  }
  const entity = budget.budget_entity_name?.toLowerCase() ?? ''
  if (entity === '') {
    return false
  }
  return isBudgetEntityMatch(entity, entityFilter.toLowerCase())
}

function getCopilotBudgetCandidates(budgets: BudgetItem[], entityFilter?: string): BudgetItem[] {
  return budgets.filter(budget => matchesBudgetEntityFilter(budget, entityFilter))
}

function getBudgetSku(budget: BudgetItem): string {
  return budget.budget_product_sku?.toLowerCase() ?? ''
}

function getBudgetPageBudgets(data: BudgetPageResponse): BudgetItem[] {
  return data.budgets ?? []
}

function hasNextBudgetPage(data: BudgetPageResponse): boolean {
  return data.has_next_page === true
}

/**
 * Find a Copilot-related budget from a list of budget items.
 * Prefers "premium" SKU over generic "copilot" SKU.
 * When entityFilter is provided, only budgets whose entity name
 * fuzzy-matches the filter are considered.
 */
export function findCopilotBudget(
  budgets: BudgetItem[],
  entityFilter?: string
): BudgetItem | undefined {
  const candidates = getCopilotBudgetCandidates(budgets, entityFilter)
  return (
    candidates.find(budget => getBudgetSku(budget).includes('premium')) ??
    candidates.find(budget => getBudgetSku(budget).includes('copilot'))
  )
}

/**
 * Search through paginated budget responses for a Copilot budget
 * matching the given org. Calls fetchPage(pageNumber) for each page
 * until the budget is found or all pages are exhausted.
 *
 * Returns the matching budget or null if not found.
 */
export async function findBudgetAcrossPages(
  fetchPage: (page: number) => Promise<BudgetPageResponse>,
  org: string,
  maxPages = 10
): Promise<BudgetMatch | null> {
  let page = 1
  let hasNext = true
  while (hasNext && page <= maxPages) {
    const data = await fetchPage(page)
    const match = findCopilotBudget(getBudgetPageBudgets(data), org)
    if (match) {
      return {
        budget_amount: match.budget_amount,
        prevent_further_usage: match.prevent_further_usage,
      }
    }
    hasNext = hasNextBudgetPage(data)
    page++
  }
  return null
}

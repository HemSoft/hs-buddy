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

/**
 * Find a Copilot-related budget from a list of budget items.
 * Prefers "premium" SKU over generic "copilot" SKU.
 * When entityFilter is provided, only budgets whose entity name
 * fuzzy-matches the filter are considered.
 */
function normalizeEntityName(b: BudgetItem): string {
  return b.budget_entity_name?.toLowerCase() ?? ''
}

function matchesEntityFilter(b: BudgetItem, entityFilter: string): boolean {
  const entity = normalizeEntityName(b)
  if (entity === '') return false
  const filterLower = entityFilter.toLowerCase()
  return entity === filterLower || filterLower.includes(entity) || entity.includes(filterLower)
}

export function findCopilotBudget(
  budgets: BudgetItem[],
  entityFilter?: string
): BudgetItem | undefined {
  const candidates = entityFilter
    ? budgets.filter(b => matchesEntityFilter(b, entityFilter))
    : budgets
  const sku = (b: BudgetItem) => b.budget_product_sku?.toLowerCase() ?? ''
  return (
    candidates.find(b => sku(b).includes('premium')) ??
    candidates.find(b => sku(b).includes('copilot'))
  )
}

/**
 * Search through paginated budget responses for a Copilot budget
 * matching the given org. Calls fetchPage(pageNumber) for each page
 * until the budget is found or all pages are exhausted.
 *
 * Returns the matching budget or null if not found.
 */
function toBudgetMatch(match: BudgetItem): BudgetMatch {
  return {
    budget_amount: match.budget_amount,
    prevent_further_usage: match.prevent_further_usage,
  }
}

function hasMorePages(hasNext: boolean, page: number, maxPages: number): boolean {
  return hasNext && page <= maxPages
}

export async function findBudgetAcrossPages(
  fetchPage: (page: number) => Promise<BudgetPageResponse>,
  org: string,
  maxPages = 10
): Promise<BudgetMatch | null> {
  let page = 1
  let hasNext = true
  while (hasMorePages(hasNext, page, maxPages)) {
    const data = await fetchPage(page)
    const budgets = data.budgets ?? []
    const match = findCopilotBudget(budgets, org)
    if (match) return toBudgetMatch(match)
    hasNext = data.has_next_page === true
    page++
  }
  return null
}

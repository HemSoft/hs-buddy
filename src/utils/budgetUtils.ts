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

const DEFAULT_MAX_BUDGET_PAGES = 10

function matchesEntityFilter(entityName: string | undefined, filter: string): boolean {
  const entity = typeof entityName === 'string' ? entityName.toLowerCase() : ''
  if (entity === '') return false

  const filterLower = filter.toLowerCase()
  return entity === filterLower || filterLower.includes(entity) || entity.includes(filterLower)
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
  const candidates = entityFilter
    ? budgets.filter(b => matchesEntityFilter(b.budget_entity_name, entityFilter))
    : budgets
  const sku = (b: BudgetItem) => b.budget_product_sku?.toLowerCase() ?? ''
  return (
    candidates.find(b => sku(b).includes('premium')) ??
    candidates.find(b => sku(b).includes('copilot'))
  )
}

async function findBudgetAcrossPagesWithLimit(
  fetchPage: (page: number) => Promise<BudgetPageResponse>,
  org: string,
  maxPages: number
): Promise<BudgetMatch | null> {
  let page = 1
  let hasNext = true
  while (hasNext && page <= maxPages) {
    const data = await fetchPage(page)
    const match = findCopilotBudget(data.budgets ?? [], org)
    if (match) {
      return {
        budget_amount: match.budget_amount,
        prevent_further_usage: match.prevent_further_usage,
      }
    }
    hasNext = data.has_next_page === true
    page++
  }
  return null
}

/**
 * Search through paginated budget responses for a Copilot budget
 * matching the given org. Calls fetchPage(pageNumber) for each page
 * until the budget is found or all pages are exhausted.
 *
 * Returns the matching budget or null if not found.
 */
export function findBudgetAcrossPages(
  fetchPage: (page: number) => Promise<BudgetPageResponse>,
  org: string,
  maxPages?: number
): Promise<BudgetMatch | null> {
  return findBudgetAcrossPagesWithLimit(fetchPage, org, maxPages ?? DEFAULT_MAX_BUDGET_PAGES)
}

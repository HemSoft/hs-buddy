interface OrgBudgetData {
  org: string
  budgetAmount: number | null
  preventFurtherUsage: boolean
  spent: number
  spentUnavailable: boolean
  useQuotaOverage: boolean
  billingMonth: number
  billingYear: number
  fetchedAt: number
}

export interface OrgBudgetState {
  data: OrgBudgetData | null
  loading: boolean
  error: string | null
}

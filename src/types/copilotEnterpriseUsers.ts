export interface CopilotEnterpriseUser {
  login: string
  grossQuantity: number
  grossAmount: number
  netAmount: number
  modelCount: number
  topModel: string | null
  topModelQuantity: number
  success: boolean
  errorMessage: string | null
  sourceJson: string
}

export interface CopilotEnterpriseUsersSnapshot {
  generatedAt: string
  fileLastWriteTime: string
  sourceFile: string
  enterprise: string
  organization: string
  year: number | null
  month: number | null
  days: number[]
  totalUsers: number
  activeUsers: number
  users: CopilotEnterpriseUser[]
}

export interface CopilotEnterpriseUsersResponse {
  success: boolean
  data?: CopilotEnterpriseUsersSnapshot
  error?: string
}

/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`

interface CopilotQuotaSnapshot {
  entitlement: number
  overage_count: number
  overage_permitted: boolean
  percent_remaining: number
  quota_id: string
  quota_remaining: number
  remaining: number
  unlimited: boolean
  timestamp_utc: string
}

interface Window {
  ipcRenderer: import('electron').IpcRenderer
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  }
  github: {
    getCliToken: (username?: string) => Promise<string>
    getActiveAccount: () => Promise<string | null>
    switchAccount: (username: string) => Promise<{ success: boolean; error?: string }>
    getCopilotUsage: (org: string, username?: string) => Promise<{
      success: boolean
      error?: string
      data?: {
        org: string
        premiumRequests: number
        grossCost: number
        discount: number
        netCost: number
        businessSeats: number
        allItems: Array<{
          date: string
          product: string
          sku: string
          quantity: number
          unitType: string
          pricePerUnit: number
          grossAmount: number
          discountAmount: number
          netAmount: number
          organizationName: string
          repositoryName: string
        }>
        fetchedAt: number
      }
    }>
    getCopilotQuota: (username: string) => Promise<{
      success: boolean
      error?: string
      data?: {
        login: string
        copilot_plan: string
        quota_reset_date: string
        quota_reset_date_utc: string
        organization_login_list: string[]
        quota_snapshots: {
          chat: CopilotQuotaSnapshot
          completions: CopilotQuotaSnapshot
          premium_interactions: CopilotQuotaSnapshot
        }
      }
    }>
  }
  copilot: {
    execute: (args: {
      prompt: string
      category?: string
      metadata?: unknown
      model?: string
    }) => Promise<{ resultId: string | null; success: boolean; error?: string }>
    cancel: (resultId: string) => Promise<{ success: boolean; error?: string }>
    getActiveCount: () => Promise<number>
    listModels: (ghAccount?: string) => Promise<
      Array<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }>
      | { error: string }
    >
  }
}

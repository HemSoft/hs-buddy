import type { Schema } from 'electron-store'

/**
 * GitHub account configuration
 * Uses GitHub CLI (gh) authentication - no tokens stored!
 */
export interface GitHubAccount {
  username: string
  org: string
}

/** Rectangle describing display bounds or work area */
export interface DisplayRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Application configuration stored in electron-store
 * NOTE: No secrets stored! Authentication uses GitHub CLI (gh auth).
 */
export interface AppConfig {
  github: {
    accounts: GitHubAccount[]
  }
  ui: {
    theme: 'dark' | 'light'
    accentColor: string // Hex color (e.g., '#0e639c')
    fontColor: string // Font/text color hex (e.g., '#cccccc')
    bgPrimary: string // Primary background hex color
    bgSecondary: string // Secondary background hex color
    statusBarBg: string // Status bar background hex color
    statusBarFg: string // Status bar foreground/text hex color
    fontFamily: string
    monoFontFamily: string
    zoomLevel: number
    sidebarWidth: number
    paneSizes: number[]
    displayId: number // Electron display ID for multi-monitor tracking
    displayBounds: DisplayRect // Saved display bounds for robust restore
    displayWorkArea: DisplayRect // Saved display work area for robust restore
    showBookmarkedOnly: boolean // Filter org repos to bookmarked only
    assistantOpen: boolean // Whether the Copilot Assistant pane is open
    favoriteUsers: string[] // Favorite user keys ('org/login') that sort to the top
  }
  pr: {
    refreshInterval: number // minutes
    autoRefresh: boolean
    recentlyMergedDays: number // days to look back for recently merged PRs
  }
  copilot: {
    ghAccount: string // GitHub CLI account username for Copilot SDK (empty = active account)
    model: string // LLM model to use (e.g., 'claude-sonnet-4.5', 'gpt-4o')
    prReviewPromptTemplate: string // Default prompt template for PR review (supports {{prUrl}})
  }
  automation: {
    scheduleForecastDays: number // Number of days to show in schedule forecast (1-30)
  }
}

/**
 * JSON Schema for configuration validation
 */
export const configSchema: Schema<AppConfig> = {
  github: {
    type: 'object',
    properties: {
      accounts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            org: { type: 'string' },
          },
          required: ['username', 'org'],
        },
        default: [],
      },
    },
    required: ['accounts'],
  },
  ui: {
    type: 'object',
    properties: {
      theme: {
        type: 'string',
        enum: ['dark', 'light'],
        default: 'dark',
      },
      accentColor: {
        type: 'string',
        default: '#0e639c',
      },
      fontColor: {
        type: 'string',
        default: '#cccccc',
      },
      bgPrimary: {
        type: 'string',
        default: '#1e1e1e',
      },
      bgSecondary: {
        type: 'string',
        default: '#252526',
      },
      statusBarBg: {
        type: 'string',
        default: '#181818',
      },
      statusBarFg: {
        type: 'string',
        default: '#9d9d9d',
      },
      fontFamily: {
        type: 'string',
        default: 'Inter',
      },
      monoFontFamily: {
        type: 'string',
        default: 'Cascadia Code',
      },
      zoomLevel: {
        type: 'number',
        minimum: 80,
        maximum: 150,
        default: 100,
      },
      sidebarWidth: {
        type: 'number',
        minimum: 200,
        maximum: 500,
        default: 300,
      },
      paneSizes: {
        type: 'array',
        items: { type: 'number' },
        default: [300, 900],
      },
      displayId: {
        type: 'number',
        default: 0,
      },
      displayBounds: {
        type: 'object',
        properties: {
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', default: 0 },
          height: { type: 'number', default: 0 },
        },
        default: { x: 0, y: 0, width: 0, height: 0 },
      },
      displayWorkArea: {
        type: 'object',
        properties: {
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', default: 0 },
          height: { type: 'number', default: 0 },
        },
        default: { x: 0, y: 0, width: 0, height: 0 },
      },
      showBookmarkedOnly: {
        type: 'boolean',
        default: false,
      },
      assistantOpen: {
        type: 'boolean',
        default: false,
      },
      favoriteUsers: {
        type: 'array',
        items: { type: 'string' },
        default: [],
      },
    },
    required: [
      'theme',
      'accentColor',
      'fontColor',
      'bgPrimary',
      'bgSecondary',
      'statusBarBg',
      'statusBarFg',
      'fontFamily',
      'monoFontFamily',
      'zoomLevel',
      'sidebarWidth',
      'paneSizes',
      'displayId',
      'showBookmarkedOnly',
      'assistantOpen',
      'favoriteUsers',
    ],
  },
  pr: {
    type: 'object',
    properties: {
      refreshInterval: {
        type: 'number',
        minimum: 1,
        maximum: 60,
        default: 15,
      },
      autoRefresh: {
        type: 'boolean',
        default: false,
      },
      recentlyMergedDays: {
        type: 'number',
        minimum: 1,
        maximum: 365,
        default: 7,
      },
    },
    required: ['refreshInterval', 'autoRefresh', 'recentlyMergedDays'],
  },
  copilot: {
    type: 'object',
    properties: {
      ghAccount: {
        type: 'string',
        default: '',
      },
      model: {
        type: 'string',
        default: 'claude-sonnet-4.5',
      },
      prReviewPromptTemplate: {
        type: 'string',
        default: '',
      },
    },
    required: ['ghAccount', 'model', 'prReviewPromptTemplate'],
  },
  automation: {
    type: 'object',
    properties: {
      scheduleForecastDays: {
        type: 'number',
        minimum: 1,
        maximum: 30,
        default: 3,
      },
    },
    required: ['scheduleForecastDays'],
  },
}

/**
 * Default configuration values
 */
export const defaultConfig: AppConfig = {
  github: {
    accounts: [],
  },
  ui: {
    theme: 'dark',
    accentColor: '#0e639c',
    fontColor: '#cccccc',
    bgPrimary: '#1e1e1e',
    bgSecondary: '#252526',
    statusBarBg: '#181818',
    statusBarFg: '#9d9d9d',
    fontFamily: 'Inter',
    monoFontFamily: 'Cascadia Code',
    zoomLevel: 100,
    sidebarWidth: 300,
    paneSizes: [300, 900],
    displayId: 0,
    displayBounds: { x: 0, y: 0, width: 0, height: 0 },
    displayWorkArea: { x: 0, y: 0, width: 0, height: 0 },
    showBookmarkedOnly: false,
    assistantOpen: false,
    favoriteUsers: [],
  },
  pr: {
    refreshInterval: 15,
    autoRefresh: true,
    recentlyMergedDays: 7,
  },
  copilot: {
    ghAccount: '', // Empty = use currently-active gh CLI account
    model: 'claude-sonnet-4.5',
    prReviewPromptTemplate: '',
  },
  automation: {
    scheduleForecastDays: 3,
  },
}

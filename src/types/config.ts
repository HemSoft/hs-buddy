import type { Schema } from 'electron-store';

/**
 * GitHub account configuration
 * Uses GitHub CLI (gh) authentication - no tokens stored!
 */
export interface GitHubAccount {
  username: string;
  org: string;
}

/**
 * Bitbucket workspace configuration
 * Uses GitHub CLI (gh) authentication - no tokens stored!
 */
export interface BitbucketWorkspace {
  workspace: string;
  username: string;
  userDisplayName: string;
}

/**
 * Application configuration stored in electron-store
 * NOTE: No secrets stored! Authentication uses GitHub CLI (gh auth).
 */
export interface AppConfig {
  github: {
    accounts: GitHubAccount[];
  };
  bitbucket: {
    workspaces: BitbucketWorkspace[];
  };
  ui: {
    theme: 'dark' | 'light';
    accentColor: string; // Hex color (e.g., '#0e639c')
    fontColor: string; // Font/text color hex (e.g., '#cccccc')
    bgPrimary: string; // Primary background hex color
    bgSecondary: string; // Secondary background hex color
    statusBarBg: string; // Status bar background hex color
    statusBarFg: string; // Status bar foreground/text hex color
    fontFamily: string;
    monoFontFamily: string;
    zoomLevel: number;
    sidebarWidth: number;
    paneSizes: number[];
    displayId: number; // Electron display ID for multi-monitor tracking
    showBookmarkedOnly: boolean; // Filter org repos to bookmarked only
  };
  pr: {
    refreshInterval: number; // minutes
    autoRefresh: boolean;
    recentlyMergedDays: number; // days to look back for recently merged PRs
  };
  copilot: {
    ghAccount: string; // GitHub CLI account username for Copilot SDK (empty = active account)
    model: string; // LLM model to use (e.g., 'claude-sonnet-4.5', 'gpt-4o')
  };
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
  bitbucket: {
    type: 'object',
    properties: {
      workspaces: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            workspace: { type: 'string' },
            username: { type: 'string' },
            userDisplayName: { type: 'string' },
          },
          required: ['workspace', 'username', 'userDisplayName'],
        },
        default: [],
      },
    },
    required: ['workspaces'],
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
      showBookmarkedOnly: {
        type: 'boolean',
        default: false,
      },
    },
    required: ['theme', 'accentColor', 'fontColor', 'bgPrimary', 'bgSecondary', 'statusBarBg', 'statusBarFg', 'fontFamily', 'monoFontFamily', 'zoomLevel', 'sidebarWidth', 'paneSizes', 'displayId', 'showBookmarkedOnly'],
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
    },
    required: ['ghAccount', 'model'],
  },
};

/**
 * Default configuration values
 */
export const defaultConfig: AppConfig = {
  github: {
    accounts: [],
  },
  bitbucket: {
    workspaces: [],
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
    showBookmarkedOnly: false,
  },
  pr: {
    refreshInterval: 15,
    autoRefresh: true,
    recentlyMergedDays: 7,
  },
  copilot: {
    ghAccount: '', // Empty = use currently-active gh CLI account
    model: 'claude-sonnet-4.5',
  },
};

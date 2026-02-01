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
    sidebarWidth: number;
  };
  pr: {
    refreshInterval: number; // minutes
    autoRefresh: boolean;
    recentlyMergedDays: number; // days to look back for recently merged PRs
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
      sidebarWidth: {
        type: 'number',
        minimum: 200,
        maximum: 500,
        default: 300,
      },
    },
    required: ['theme', 'sidebarWidth'],
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
        default: 30,
      },
    },
    required: ['refreshInterval', 'autoRefresh', 'recentlyMergedDays'],
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
    sidebarWidth: 300,
  },
  pr: {
    refreshInterval: 15,
    autoRefresh: false,
    recentlyMergedDays: 30,
  },
};

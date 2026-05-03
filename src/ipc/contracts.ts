/**
 * IPC Channel Contract Registry
 *
 * Single source of truth for all Electron IPC channel names used between
 * the main process and the renderer process. Both sides import from here.
 *
 * Three transport categories:
 * 1. Invoke channels (renderer → main, request/response via ipcMain.handle)
 * 2. Send channels (renderer → main, fire-and-forget via ipcMain.on)
 * 3. Push channels (main → renderer, fire-and-forget via webContents.send)
 */

// ─── Config UI Value Channels ──────────────────────────────────────────────
// Authoritative list of config UI channel keys.
// configHandlers.ts imports CONFIG_UI_KEYS to build its handler map — changes
// here are enforced at compile time in both modules.

export const CONFIG_UI_KEYS = [
  'theme',
  'accent-color',
  'bg-primary',
  'bg-secondary',
  'statusbar-bg',
  'statusbar-fg',
  'font-color',
  'font-family',
  'mono-font-family',
  'zoom-level',
  'sidebar-width',
  'pane-sizes',
  'show-bookmarked-only',
  'favorite-users',
  'dashboard-cards',
] as const

type ConfigUiKey = (typeof CONFIG_UI_KEYS)[number]

// ─── Invoke Channels (renderer → main, request/response) ──────────────────

export const IPC_INVOKE = {
  // ── GitHub ──────────────────────────────────────────────────────────────
  GITHUB_GET_CLI_TOKEN: 'github:get-cli-token',
  GITHUB_GET_ACTIVE_ACCOUNT: 'github:get-active-account',
  GITHUB_GET_COPILOT_USAGE: 'github:get-copilot-usage',
  GITHUB_GET_COPILOT_QUOTA: 'github:get-copilot-quota',
  GITHUB_GET_COPILOT_BUDGET: 'github:get-copilot-budget',
  GITHUB_GET_COPILOT_MEMBER_USAGE: 'github:get-copilot-member-usage',
  GITHUB_GET_USER_PREMIUM_REQUESTS: 'github:get-user-premium-requests',
  GITHUB_SWITCH_ACCOUNT: 'github:switch-account',
  GITHUB_COLLECT_COPILOT_SNAPSHOTS: 'github:collect-copilot-snapshots',

  // ── Config ─────────────────────────────────────────────────────────────
  CONFIG_GET_ASSISTANT_OPEN: 'config:get-assistant-open',
  CONFIG_SET_ASSISTANT_OPEN: 'config:set-assistant-open',
  CONFIG_GET_TERMINAL_OPEN: 'config:get-terminal-open',
  CONFIG_SET_TERMINAL_OPEN: 'config:set-terminal-open',
  CONFIG_GET_TERMINAL_PANEL_HEIGHT: 'config:get-terminal-panel-height',
  CONFIG_SET_TERMINAL_PANEL_HEIGHT: 'config:set-terminal-panel-height',
  CONFIG_GET_SCHEDULE_FORECAST_DAYS: 'config:get-schedule-forecast-days',
  CONFIG_SET_SCHEDULE_FORECAST_DAYS: 'config:set-schedule-forecast-days',
  CONFIG_GET_COPILOT_PR_REVIEW_PROMPT_TEMPLATE: 'config:get-copilot-pr-review-prompt-template',
  CONFIG_SET_COPILOT_PR_REVIEW_PROMPT_TEMPLATE: 'config:set-copilot-pr-review-prompt-template',
  CONFIG_GET_NOTIFICATION_SOUND_ENABLED: 'config:get-notification-sound-enabled',
  CONFIG_SET_NOTIFICATION_SOUND_ENABLED: 'config:set-notification-sound-enabled',
  CONFIG_GET_NOTIFICATION_SOUND_PATH: 'config:get-notification-sound-path',
  CONFIG_SET_NOTIFICATION_SOUND_PATH: 'config:set-notification-sound-path',
  CONFIG_PICK_AUDIO_FILE: 'config:pick-audio-file',
  CONFIG_PLAY_NOTIFICATION_SOUND: 'config:play-notification-sound',
  CONFIG_GET_FINANCE_WATCHLIST: 'config:get-finance-watchlist',
  CONFIG_SET_FINANCE_WATCHLIST: 'config:set-finance-watchlist',
  CONFIG_GET_CONFIG: 'config:get-config',
  CONFIG_GET_STORE_PATH: 'config:get-store-path',
  CONFIG_OPEN_IN_EDITOR: 'config:open-in-editor',
  CONFIG_RESET: 'config:reset',

  // ── Cache ──────────────────────────────────────────────────────────────
  CACHE_READ_ALL: 'cache:read-all',
  CACHE_WRITE: 'cache:write',
  CACHE_DELETE: 'cache:delete',
  CACHE_CLEAR: 'cache:clear',

  // ── Shell ──────────────────────────────────────────────────────────────
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHELL_OPEN_IN_APP_BROWSER: 'shell:open-in-app-browser',
  SHELL_FETCH_PAGE_TITLE: 'shell:fetch-page-title',
  SYSTEM_GET_FONTS: 'system:get-fonts',

  // ── Terminal ────────────────────────────────────────────────────────────
  TERMINAL_SPAWN: 'terminal:spawn',
  TERMINAL_ATTACH: 'terminal:attach',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_RESOLVE_REPO_PATH: 'terminal:resolve-repo-path',

  // ── Copilot ────────────────────────────────────────────────────────────
  COPILOT_EXECUTE: 'copilot:execute',
  COPILOT_CANCEL: 'copilot:cancel',
  COPILOT_ACTIVE_COUNT: 'copilot:active-count',
  COPILOT_LIST_MODELS: 'copilot:list-models',
  COPILOT_CHAT_SEND: 'copilot:chat-send',
  COPILOT_CHAT_ABORT: 'copilot:chat-abort',
  COPILOT_QUICK_PROMPT: 'copilot:quick-prompt',

  // ── Copilot Sessions ───────────────────────────────────────────────────
  COPILOT_SESSIONS_SCAN: 'copilot-sessions:scan',
  COPILOT_SESSIONS_GET_SESSION: 'copilot-sessions:get-session',
  COPILOT_SESSIONS_COMPUTE_DIGEST: 'copilot-sessions:compute-digest',

  // ── Crew ───────────────────────────────────────────────────────────────
  CREW_ADD_PROJECT: 'crew:add-project',
  CREW_LIST_PROJECTS: 'crew:list-projects',
  CREW_REMOVE_PROJECT: 'crew:remove-project',
  CREW_GET_SESSION: 'crew:get-session',
  CREW_CREATE_SESSION: 'crew:create-session',
  CREW_ADD_MESSAGE: 'crew:add-message',
  CREW_UPDATE_SESSION_STATUS: 'crew:update-session-status',
  CREW_UPDATE_CHANGED_FILES: 'crew:update-changed-files',
  CREW_CLEAR_SESSION: 'crew:clear-session',
  CREW_UNDO_FILE: 'crew:undo-file',

  // ── Tempo ──────────────────────────────────────────────────────────────
  TEMPO_GET_TODAY: 'tempo:get-today',
  TEMPO_GET_RANGE: 'tempo:get-range',
  TEMPO_GET_WEEK: 'tempo:get-week',
  TEMPO_CREATE_WORKLOG: 'tempo:create-worklog',
  TEMPO_UPDATE_WORKLOG: 'tempo:update-worklog',
  TEMPO_DELETE_WORKLOG: 'tempo:delete-worklog',
  TEMPO_GET_ACCOUNTS: 'tempo:get-accounts',
  TEMPO_GET_PROJECT_ACCOUNTS: 'tempo:get-project-accounts',
  TEMPO_GET_CAPEX_MAP: 'tempo:get-capex-map',
  TEMPO_GET_SCHEDULE: 'tempo:get-schedule',

  // ── Todoist ────────────────────────────────────────────────────────────
  TODOIST_GET_UPCOMING: 'todoist:get-upcoming',
  TODOIST_GET_TODAY: 'todoist:get-today',
  TODOIST_COMPLETE_TASK: 'todoist:complete-task',
  TODOIST_REOPEN_TASK: 'todoist:reopen-task',
  TODOIST_CREATE_TASK: 'todoist:create-task',
  TODOIST_UPDATE_TASK: 'todoist:update-task',
  TODOIST_DELETE_TASK: 'todoist:delete-task',
  TODOIST_GET_PROJECTS: 'todoist:get-projects',

  // ── Finance ────────────────────────────────────────────────────────────
  FINANCE_FETCH_QUOTE: 'finance:fetch-quote',

  // ── Slack ──────────────────────────────────────────────────────────────
  SLACK_NUDGE_AUTHOR: 'slack:nudge-author',

  // ── Filesystem ─────────────────────────────────────────────────────────
  FILESYSTEM_READ_DIR: 'fs:read-dir',
  FILESYSTEM_READ_FILE: 'fs:read-file',

  // ── Ralph ──────────────────────────────────────────────────────────────
  RALPH_LAUNCH: 'ralph:launch',
  RALPH_STOP: 'ralph:stop',
  RALPH_LIST: 'ralph:list',
  RALPH_GET_STATUS: 'ralph:get-status',
  RALPH_GET_CONFIG: 'ralph:get-config',
  RALPH_GET_SCRIPTS_PATH: 'ralph:get-scripts-path',
  RALPH_LIST_TEMPLATES: 'ralph:list-templates',
  RALPH_SELECT_DIRECTORY: 'ralph:select-directory',
} as const

// ─── Send Channels (renderer → main, fire-and-forget) ─────────────────────

export const IPC_SEND = {
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_MAXIMIZE: 'window-maximize',
  WINDOW_CLOSE: 'window-close',
  TOGGLE_DEVTOOLS: 'toggle-devtools',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
} as const

// ─── Push Channels (main → renderer, fire-and-forget) ─────────────────────

export const IPC_PUSH = {
  MAIN_PROCESS_MESSAGE: 'main-process-message',
  TOGGLE_ASSISTANT: 'toggle-assistant',
  TAB_NEXT: 'tab-next',
  TAB_PREV: 'tab-prev',
  TAB_CLOSE: 'tab-close',
  RALPH_STATUS_UPDATE: 'ralph:status-update',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_CWD_CHANGED: 'terminal:cwd-changed',
} as const

// ─── Derived types ────────────────────────────────────────────────────────

/** All invoke channel string values */
export type IpcInvokeChannel = (typeof IPC_INVOKE)[keyof typeof IPC_INVOKE]

/** All send channel string values */
export type IpcSendChannel = (typeof IPC_SEND)[keyof typeof IPC_SEND]

/** All push channel string values */
export type IpcPushChannel = (typeof IPC_PUSH)[keyof typeof IPC_PUSH]

/** Config UI get/set channel pairs (generated from CONFIG_UI_KEYS) */
export type ConfigGetChannel = `config:get-${ConfigUiKey}`
export type ConfigSetChannel = `config:set-${ConfigUiKey}`

// ─── Runtime channel sets (for testing & validation) ──────────────────────

/** All invoke channel values as a flat array */
export const ALL_INVOKE_CHANNELS: readonly IpcInvokeChannel[] = Object.values(IPC_INVOKE)

/** All send channel values as a flat array */
export const ALL_SEND_CHANNELS: readonly IpcSendChannel[] = Object.values(IPC_SEND)

/** All push channel values as a flat array */
export const ALL_PUSH_CHANNELS: readonly IpcPushChannel[] = Object.values(IPC_PUSH)

/** Dynamic config UI channels (get + set pairs) */
export const CONFIG_UI_CHANNELS: readonly string[] = CONFIG_UI_KEYS.flatMap(key => [
  `config:get-${key}`,
  `config:set-${key}`,
])

/** Complete list of every channel registered in the system */
export const ALL_CHANNELS: readonly string[] = [
  ...ALL_INVOKE_CHANNELS,
  ...ALL_SEND_CHANNELS,
  ...ALL_PUSH_CHANNELS,
  ...CONFIG_UI_CHANNELS,
]

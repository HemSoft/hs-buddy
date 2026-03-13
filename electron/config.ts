import Store from 'electron-store';
import type { AppConfig, GitHubAccount, BitbucketWorkspace, DisplayRect } from '../src/types/config';
import { configSchema, defaultConfig } from '../src/types/config';

/** Shared Convex URL — single source of truth for the main process. */
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || 'https://balanced-trout-451.convex.cloud'

/**
 * Configuration manager using electron-store for persistent storage
 * Stores in userData/config.json (OS-specific location)
 * 
 * SECURITY NOTE: Uses GitHub CLI (gh) for authentication.
 * No tokens are stored in config or environment variables!
 * Authentication is handled securely by GitHub CLI in system keychain.
 */
class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      schema: configSchema,
      defaults: defaultConfig,
      name: 'config', // Creates config.json in userData
      clearInvalidConfig: false, // Preserve config even if validation fails
      watch: true, // Watch for external changes
    });

    console.log('[ConfigManager] Store location:', this.store.path);
  }

  // GitHub Account Management
  getGitHubAccounts(): GitHubAccount[] {
    return this.store.get('github.accounts', []);
  }

  addGitHubAccount(account: GitHubAccount): void {
    const accounts = this.getGitHubAccounts();
    // Check for duplicates
    const exists = accounts.some(
      (a) => a.username === account.username && a.org === account.org
    );
    if (exists) {
      throw new Error(`GitHub account ${account.username}@${account.org} already exists`);
    }
    accounts.push(account);
    this.store.set('github.accounts', accounts);
  }

  removeGitHubAccount(username: string, org: string): void {
    const accounts = this.getGitHubAccounts();
    const filtered = accounts.filter((a) => !(a.username === username && a.org === org));
    this.store.set('github.accounts', filtered);
  }

  updateGitHubAccount(username: string, org: string, updates: Partial<GitHubAccount>): void {
    const accounts = this.getGitHubAccounts();
    const index = accounts.findIndex((a) => a.username === username && a.org === org);
    if (index === -1) {
      throw new Error(`GitHub account ${username}@${org} not found`);
    }
    accounts[index] = { ...accounts[index], ...updates };
    this.store.set('github.accounts', accounts);
  }

  // Bitbucket Workspace Management
  getBitbucketWorkspaces(): BitbucketWorkspace[] {
    return this.store.get('bitbucket.workspaces', []);
  }

  addBitbucketWorkspace(workspace: BitbucketWorkspace): void {
    const workspaces = this.getBitbucketWorkspaces();
    const exists = workspaces.some((w) => w.workspace === workspace.workspace);
    if (exists) {
      throw new Error(`Bitbucket workspace ${workspace.workspace} already exists`);
    }
    workspaces.push(workspace);
    this.store.set('bitbucket.workspaces', workspaces);
  }

  removeBitbucketWorkspace(workspace: string): void {
    const workspaces = this.getBitbucketWorkspaces();
    const filtered = workspaces.filter((w) => w.workspace !== workspace);
    this.store.set('bitbucket.workspaces', filtered);
  }

  private getUiValue<K extends keyof AppConfig['ui']>(key: K): AppConfig['ui'][K] {
    return this.store.get(`ui.${key}`, defaultConfig.ui[key]) as AppConfig['ui'][K];
  }

  private setUiValue<K extends keyof AppConfig['ui']>(key: K, value: AppConfig['ui'][K]): void {
    this.store.set(`ui.${key}`, value);
  }

  // UI Settings
  getTheme(): 'dark' | 'light' {
    return this.getUiValue('theme');
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.setUiValue('theme', theme);
  }

  getAccentColor(): string {
    return this.getUiValue('accentColor');
  }

  setAccentColor(color: string): void {
    this.setUiValue('accentColor', color);
  }

  getBgPrimary(): string {
    return this.getUiValue('bgPrimary');
  }

  setBgPrimary(color: string): void {
    this.setUiValue('bgPrimary', color);
  }

  getBgSecondary(): string {
    return this.getUiValue('bgSecondary');
  }

  setBgSecondary(color: string): void {
    this.setUiValue('bgSecondary', color);
  }

  getStatusBarBg(): string {
    return this.getUiValue('statusBarBg');
  }

  setStatusBarBg(color: string): void {
    this.setUiValue('statusBarBg', color);
  }

  getStatusBarFg(): string {
    return this.getUiValue('statusBarFg');
  }

  setStatusBarFg(color: string): void {
    this.setUiValue('statusBarFg', color);
  }

  getFontColor(): string {
    return this.getUiValue('fontColor');
  }

  setFontColor(color: string): void {
    this.setUiValue('fontColor', color);
  }

  getFontFamily(): string {
    return this.getUiValue('fontFamily');
  }

  setFontFamily(font: string): void {
    this.setUiValue('fontFamily', font);
  }

  getMonoFontFamily(): string {
    return this.getUiValue('monoFontFamily');
  }

  setMonoFontFamily(font: string): void {
    this.setUiValue('monoFontFamily', font);
  }

  getZoomLevel(): number {
    return this.getUiValue('zoomLevel');
  }

  setZoomLevel(level: number): void {
    this.setUiValue('zoomLevel', level);
  }

  getSidebarWidth(): number {
    return this.getUiValue('sidebarWidth');
  }

  setSidebarWidth(width: number): void {
    this.setUiValue('sidebarWidth', width);
  }

  getPaneSizes(): number[] {
    return this.getUiValue('paneSizes');
  }

  setPaneSizes(sizes: number[]): void {
    this.setUiValue('paneSizes', sizes);
  }

  getDisplayId(): number {
    return this.getUiValue('displayId');
  }

  setDisplayId(id: number): void {
    this.setUiValue('displayId', id);
  }

  getDisplayBounds(): DisplayRect {
    return this.getUiValue('displayBounds');
  }

  setDisplayBounds(bounds: DisplayRect): void {
    this.setUiValue('displayBounds', bounds);
  }

  getDisplayWorkArea(): DisplayRect {
    return this.getUiValue('displayWorkArea');
  }

  setDisplayWorkArea(workArea: DisplayRect): void {
    this.setUiValue('displayWorkArea', workArea);
  }

  getShowBookmarkedOnly(): boolean {
    return this.getUiValue('showBookmarkedOnly');
  }

  setShowBookmarkedOnly(value: boolean): void {
    this.setUiValue('showBookmarkedOnly', value);
  }

  getAssistantOpen(): boolean {
    return this.getUiValue('assistantOpen');
  }

  setAssistantOpen(value: boolean): void {
    this.setUiValue('assistantOpen', value);
  }

  // Copilot Settings (PR Review Prompt Template — still used via IPC)
  getCopilotPRReviewPromptTemplate(): string {
    return this.store.get('copilot.prReviewPromptTemplate', '');
  }

  setCopilotPRReviewPromptTemplate(template: string): void {
    this.store.set('copilot.prReviewPromptTemplate', template);
  }

  // Automation Settings
  getScheduleForecastDays(): number {
    return this.store.get('automation.scheduleForecastDays', 3);
  }

  setScheduleForecastDays(days: number): void {
    this.store.set('automation.scheduleForecastDays', Math.max(1, Math.min(30, days)));
  }

  // Full config access
  getConfig(): AppConfig {
    return this.store.store;
  }

  // Migration helper from environment variables
  migrateFromEnv(): void {
    // Check if we already have accounts - don't overwrite
    if (this.getGitHubAccounts().length > 0) {
      console.log('[ConfigManager] GitHub accounts already configured, skipping migration');
      return;
    }

    // Try to read the .env file pattern (legacy support)
    const username = process.env.VITE_GITHUB_USERNAME;
    const org = process.env.VITE_GITHUB_ORG;

    if (username && org) {
      console.log('[ConfigManager] Migrating from environment variables...');
      this.addGitHubAccount({
        username,
        org,
      });
      console.log('[ConfigManager] Migration complete - now using GitHub CLI authentication');
      console.log('[ConfigManager] You can remove VITE_GITHUB_USERNAME and VITE_GITHUB_ORG from .env (no longer needed)');
    } else {
      console.log('[ConfigManager] No environment variables found for migration');
      console.log('[ConfigManager] Add accounts manually through Settings or edit config.json');
    }
  }

  // Utility methods
  getStorePath(): string {
    return this.store.path;
  }

  reset(): void {
    this.store.clear();
    console.log('[ConfigManager] Configuration reset to defaults');
  }
}

// Singleton instance
export const configManager = new ConfigManager();

import Store from 'electron-store';
import type { AppConfig, GitHubAccount, BitbucketWorkspace } from '../src/types/config';
import { configSchema, defaultConfig } from '../src/types/config';

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

  // UI Settings
  getTheme(): 'dark' | 'light' {
    return this.store.get('ui.theme', 'dark');
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.store.set('ui.theme', theme);
  }

  getAccentColor(): string {
    return this.store.get('ui.accentColor', '#0e639c');
  }

  setAccentColor(color: string): void {
    this.store.set('ui.accentColor', color);
  }

  getBgPrimary(): string {
    return this.store.get('ui.bgPrimary', '#1e1e1e');
  }

  setBgPrimary(color: string): void {
    this.store.set('ui.bgPrimary', color);
  }

  getBgSecondary(): string {
    return this.store.get('ui.bgSecondary', '#252526');
  }

  setBgSecondary(color: string): void {
    this.store.set('ui.bgSecondary', color);
  }

  getFontColor(): string {
    return this.store.get('ui.fontColor', '#cccccc');
  }

  setFontColor(color: string): void {
    this.store.set('ui.fontColor', color);
  }

  getFontFamily(): string {
    return this.store.get('ui.fontFamily', 'Inter');
  }

  setFontFamily(font: string): void {
    this.store.set('ui.fontFamily', font);
  }

  getMonoFontFamily(): string {
    return this.store.get('ui.monoFontFamily', 'Cascadia Code');
  }

  setMonoFontFamily(font: string): void {
    this.store.set('ui.monoFontFamily', font);
  }

  getZoomLevel(): number {
    return this.store.get('ui.zoomLevel', 100);
  }

  setZoomLevel(level: number): void {
    this.store.set('ui.zoomLevel', level);
  }

  getSidebarWidth(): number {
    return this.store.get('ui.sidebarWidth', 300);
  }

  setSidebarWidth(width: number): void {
    this.store.set('ui.sidebarWidth', width);
  }

  getPaneSizes(): number[] {
    return this.store.get('ui.paneSizes', [300, 900]) as number[];
  }

  setPaneSizes(sizes: number[]): void {
    this.store.set('ui.paneSizes', sizes);
  }

  // PR Settings
  getPRRefreshInterval(): number {
    return this.store.get('pr.refreshInterval', 15);
  }

  setPRRefreshInterval(minutes: number): void {
    this.store.set('pr.refreshInterval', minutes);
  }

  getPRAutoRefresh(): boolean {
    return this.store.get('pr.autoRefresh', false);
  }

  setPRAutoRefresh(enabled: boolean): void {
    this.store.set('pr.autoRefresh', enabled);
  }

  getRecentlyMergedDays(): number {
    return this.store.get('pr.recentlyMergedDays', 7);
  }

  setRecentlyMergedDays(days: number): void {
    this.store.set('pr.recentlyMergedDays', days);
  }

  // Full config access
  getConfig(): AppConfig {
    return this.store.store;
  }

  setConfig(config: AppConfig): void {
    this.store.store = config;
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
      console.log('[ConfigManager] You can remove VITE_GITHUB_TOKEN from .env (no longer needed)');
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

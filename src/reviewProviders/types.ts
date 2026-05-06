/* v8 ignore start — pure type definitions, no runtime code */
import type { GitHubClient } from '../api/github'

/** Opaque checkpoint that a provider uses to detect new reviews since trigger. */
export type ReviewCheckpoint = unknown

/** Result of a single poll cycle. */
export interface PollResult {
  status: 'pending' | 'completed' | 'failed'
}

/** Capability flags — providers may support triggering, monitoring, or both. */
export interface ProviderCapabilities {
  canTrigger: boolean
  canMonitor: boolean
}

/**
 * Contract that every AI review provider implements.
 * Providers own their completion semantics — the monitor hook treats them
 * as opaque state machines with a common lifecycle.
 */
export interface AIReviewProvider {
  /** Unique stable identifier (e.g. 'copilot', 'coderabbit'). */
  readonly id: string
  /** Human-readable name (e.g. 'Copilot', 'CodeRabbit'). */
  readonly name: string
  /** GitHub bot login used to detect activity. */
  readonly botLogin: string
  /** Lucide icon name for UI rendering. */
  readonly iconName: string
  /** Capability flags. */
  readonly capabilities: ProviderCapabilities

  /** Detect whether this provider is available for the given repo. */
  detect(client: GitHubClient, owner: string, repo: string): Promise<boolean>

  /** Kick off the review. */
  trigger(client: GitHubClient, owner: string, repo: string, prNumber: number): Promise<void>

  /**
   * Capture the current state so we can detect changes after triggering.
   * Returns an opaque checkpoint the provider will compare against during polling.
   */
  getCheckpoint(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewCheckpoint>

  /**
   * Check whether the review has completed since the checkpoint was taken.
   * Returns a PollResult indicating current status.
   */
  poll(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number,
    checkpoint: ReviewCheckpoint
  ): Promise<PollResult>
}

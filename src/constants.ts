/** Multiplier to convert minutes to milliseconds */
export const MS_PER_MINUTE = 60_000

/** Default number of days to look back for recently merged PRs. */
export const DEFAULT_RECENTLY_MERGED_DAYS = 7

/** PR dashboard view modes. */
export const PR_MODES = ['my-prs', 'needs-review', 'recently-merged', 'need-a-nudge'] as const

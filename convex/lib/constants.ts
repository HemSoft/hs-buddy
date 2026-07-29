export const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * How long a run may remain in `pending` or `running` before the stuck-run
 * reaper in `scheduleScanner.scanAndDispatch` fails it automatically.
 *
 * Justified against the slowest worker default: the ai/skill workers abort
 * their underlying call after 120_000ms (2 minutes), and the exec worker
 * after 30_000ms (see `electron/workers/*Worker.ts`). A run still
 * pending/running an hour after it started has almost certainly lost its
 * worker (e.g. the Electron app was killed or crashed mid-run) rather than
 * genuinely still executing, so this threshold gives ~30x headroom over the
 * slowest built-in default while still freeing a wedged schedule well within
 * the same working day.
 */
export const STALE_RUN_TIMEOUT_MS = 60 * 60 * 1000 // 1 hour

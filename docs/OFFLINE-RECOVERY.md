# Offline schedule recovery

Electron startup lists enabled schedules and submits overdue candidates to
`schedules.recoverMissed`. The client snapshot does not authorize run creation.
The mutation rereads the schedule and commits run inserts, aggregate counts,
`runsTriggered`, and the next-run cursor together.

Convex [serializable transactions](https://docs.convex.dev/database/advanced/occ)
serialize recovery against another recovery request or the minute scanner through
the schedule row. A retry after a lost response sees the advanced cursor and
creates no additional runs. A failed transaction leaves both the cursor and its
work unchanged. This guarantees enqueue safety, not exactly-once execution of
external shell or AI side effects.

## Policies

- `skip` advances to the next future occurrence without creating work.
- `last` creates one run for the missed interval.
- `catchup` creates at most 100 runs, then advances beyond the entire missed gap.
  Older occurrences beyond that cap are not replayed, matching the prior limit.
- A disabled or no-longer-overdue schedule is ignored. A deleted schedule or job
  produces an error without partial writes. Invalid catch-up cron expressions
  fail without advancing the cursor.

The minute scanner retains its existing policy. Whichever transaction processes
an overdue cursor first owns that interval; recovery does not retrospectively
replay intervals already advanced by the scanner.

## Rollout and verification

Deploy the new Convex function before distributing a client that calls it.
Older clients still use separate creation and advancement calls; stop or upgrade
those clients before relying on the new multi-client guarantee. The legacy
`advanceNextRun` endpoint remains available for compatibility. No schema migration
or production-data rewrite is required.

Run `bun run test:convex -- convex/__tests__/offlineRecovery.test.ts` and
`bun run test:electron -- electron/workers/offlineSync.test.ts`. The server tests
cover concurrent callers, both scanner orderings, transaction rollback, retry
after a committed response is lost, counts, policy limits, and stale candidates.
The Electron tests require a single recovery mutation rather than client-owned
run creation or cursor updates. Tests use isolated databases, not a deployment.

import type { DatabaseWriter } from "../_generated/server";

/** Increment a buddyStats counter field within the current transaction */
export async function incrementStat(db: DatabaseWriter, field: string, amount = 1) {
  const now = Date.now();
  const doc = await db
    .query("buddyStats")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .first();
  if (doc) {
    const current = (doc as Record<string, unknown>)[field] as number ?? 0;
    await db.patch(doc._id, { [field]: current + amount, updatedAt: now });
  } else {
    // Create the document if it doesn't exist yet (e.g., cron-triggered before any client connect)
    await db.insert("buddyStats", {
      key: "default" as const,
      appLaunches: 0, tabsOpened: 0, prsViewed: 0, prsReviewed: 0,
      prsMergedWatched: 0, reposBrowsed: 0, repoDetailViews: 0,
      jobsCreated: 0, runsTriggered: 0, runsCompleted: 0, runsFailed: 0,
      schedulesCreated: 0, bookmarksCreated: 0, settingsChanged: 0,
      searchesPerformed: 0,
      [field]: amount,
      firstLaunchDate: now, totalUptimeMs: 0,
      createdAt: now, updatedAt: now,
    });
  }
}

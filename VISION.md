# Buddy Vision

**Version**: 2.1
**Updated**: 2026-02-18
**Status**: Active Execution

## Executive Summary

Buddy has successfully evolved beyond a PR viewer into a workflow-capable productivity platform built on Convex for real-time, cross-device delivery.

---

## Set it Free Loop™

Buddy is the first reference consumer of the **Set it Free Loop™** — a continuous quality improvement operating model for software repositories.

> One Intake. One Loop. Compounding Quality.

The operating model, workflow library, governance policy, and intake tooling all live in the canonical home:
**[relias-engineering/set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop)**

Buddy's `.github/workflows/` deploys from that library. Its governance labels are configured by the label setup script in that repo.

---

## Strategic Goals

1. **Replace hs-conductor** — Buddy becomes the single productivity hub
2. **Platform Independence** — Full data sync across Windows, Mac, Linux, and future mobile apps
3. **Serverless Architecture** — No local Express server or Windows Service required
4. **Real-time Experience** — Live task status updates via Convex subscriptions
5. **Skill Integration** — First-class support for the 110+ Claude skills library
6. **Unified Delivery Intake** — Normalize all feature demand into GitHub Issues
7. **Recursive Quality Automation** — Continuously run audit → fix → verify loops
8. **Portfolio Scalability** — Operate this model across many repositories with cost controls

---

## Architecture Overview

### Current State (hs-conductor)

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Admin UI       │────▶│  Express Server │────▶│  Inngest Dev    │
│  (Electron)     │     │  (Port 2900)    │     │  (Port 2901)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  File System    │
                        │  (JSON/YAML)    │
                        └─────────────────┘
```

**Pain Points:**

- Requires Windows Service running 24/7
- Inngest Dev Server must be running locally
- Data locked to local machine
- No mobile access possible

### Target State (hs-buddy + Convex)

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Buddy Desktop  │────▶│                 │◀────│  Buddy Mobile   │
│  (Electron)     │     │   Convex Cloud  │     │  (Future)       │
└─────────────────┘     │                 │     └─────────────────┘
                        │  • Schedules    │
                        │  • Jobs         │
                        │  • Run History  │
                        │  • File Storage │
                        │  • Real-time    │
                        └─────────────────┘
```

**Benefits:**

- No local server required
- Data syncs across all devices
- Real-time updates via subscriptions
- Offline queue with catch-up
- Mobile app ready

---

## Data Model

### Full Convex Storage

All data lives in Convex for maximum platform independence:

| Entity | Storage | Description |
|--------|---------|-------------|
| **Jobs** | Convex DB | Task definitions (name, worker type, config, params) |
| **Schedules** | Convex DB | Cron expressions, enabled state, linked job |
| **Runs** | Convex DB | Execution history (status, duration, timestamps) |
| **Run Outputs** | Convex File Storage | Generated files, logs (S3-like storage) |

### Convex Schema (Draft)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  jobs: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    workerType: v.union(
      v.literal("exec"),
      v.literal("ai"),
      v.literal("skill")
    ),
    config: v.any(), // Worker-specific configuration
    params: v.optional(v.array(v.object({
      name: v.string(),
      type: v.string(),
      default: v.optional(v.any()),
      required: v.boolean(),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  schedules: defineTable({
    jobId: v.id("jobs"),
    name: v.string(),
    cron: v.string(), // "0 9 * * *"
    enabled: v.boolean(),
    params: v.optional(v.any()), // Runtime params for job
    missedPolicy: v.union(
      v.literal("catchup"),
      v.literal("skip"),
      v.literal("last")
    ),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_enabled", ["enabled"])
    .index("by_next_run", ["nextRunAt"]),

  runs: defineTable({
    jobId: v.id("jobs"),
    scheduleId: v.optional(v.id("schedules")),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    triggeredBy: v.union(
      v.literal("manual"),
      v.literal("schedule"),
      v.literal("api")
    ),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    outputFileId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    duration: v.optional(v.number()),
  }).index("by_job", ["jobId"])
    .index("by_status", ["status"])
    .index("by_started", ["startedAt"]),
});
```

---

## Worker Types

Three core workers handle all task execution:

### 1. exec-worker (Shell Commands)

Execute PowerShell/bash commands locally on the Electron host.

```typescript
{
  workerType: "exec",
  config: {
    command: "pwsh -Command \"Get-Process | Select-Object -First 10\"",
    cwd: "D:\\projects",
    timeout: 30000,
    shell: "powershell" // or "bash", "cmd"
  }
}
```

**Execution**: Runs in Electron main process via Node.js `child_process`.

### 2. ai-worker (LLM Tasks)

Execute AI prompts via configured LLM provider.

```typescript
{
  workerType: "ai",
  config: {
    prompt: "Summarize the following text: {{input}}",
    model: "claude-sonnet-4-20250514", // or "gpt-4", etc.
    maxTokens: 1000,
    temperature: 0.7
  }
}
```

**Execution**: Calls LLM API from Electron via GitHub Copilot CLI.

### 3. skill-worker (Claude Skills)

Invoke any of the 110+ Claude skills directly.

```typescript
{
  workerType: "skill",
  config: {
    skillName: "diary",
    action: "create", // skill-specific action
    params: {
      date: "{{today}}"
    }
  }
}
```

**Execution**: Spawns GitHub Copilot CLI with skill context, captures output.

---

## Execution Model

### Where Tasks Run

| Component | Runs Where | Why |
|-----------|------------|-----|
| Schedule scanning | Convex Cloud (cron job) | Always-on, no local process needed |
| Task dispatch | Convex Cloud | Triggers via mutation |
| exec-worker | Electron main process | Needs local filesystem/shell access |
| ai-worker | Electron main process | Uses local API keys |
| skill-worker | Electron main process | Spawns local Claude CLI |
| Status updates | Convex Cloud | Real-time sync to all clients |

### Offline Behavior

When the machine is offline:

1. **Convex cron** still fires in the cloud
2. **Task queued** in Convex with `status: "pending"`
3. **Electron reconnects** → polls for pending tasks
4. **Catch-up execution** based on `missedPolicy`:
   - `catchup`: Run all missed executions
   - `last`: Run only the most recent missed
   - `skip`: Mark as skipped, continue normally

---

## UI Design

### Activity Bar Placement

Add "Workflows" icon to the activity bar (alongside PRs, Settings):

```text
┌──────────────────────────────────────────────────────────┐
│ [≡] Buddy                               [−] [□] [×]     │
├────┬─────────────────────────────────────────────────────┤
│ 🔀 │  Sidebar              │  Content Area              │
│    │                       │                            │
│ ⚙️ │  • Schedules          │  [Schedule List View]      │
│    │  • Jobs               │  or                        │
│ 🔄 │  • Run History        │  [Job Editor]              │
│    │                       │  or                        │
│    │                       │  [Run History Table]       │
└────┴───────────────────────┴────────────────────────────┘
  ^
  └── New "Workflows" icon (🔄)
```

### Workflows Section Views

| Sidebar Item | Content |
|--------------|---------|
| **Schedules** | List of schedules with enable/disable toggles, next run time, CronBuilder for editing |
| **Jobs** | List of job definitions, Monaco editor for config |
| **Run History** | Recent runs (last 24h or last 50), status badges, duration, expandable output |

### CronBuilder Component

Port the visual cron builder from hs-conductor:

```text
┌─────────────────────────────────────────────────────┐
│ Schedule Frequency                                   │
│ ┌────────┐ ┌────────┐ ┌───────┐ ┌────────┐ ┌──────┐│
│ │ Minute │ │ Hourly │ │ Daily │ │ Weekly │ │Custom││
│ └────────┘ └────────┘ └───────┘ └────────┘ └──────┘│
│                                                      │
│ Run at: [09] : [00]                                 │
│                                                      │
│ On days:                                            │
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐        │
│ │Mon│ │Tue│ │Wed│ │Thu│ │Fri│ │Sat│ │Sun│        │
│ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘        │
│                                                      │
│ Preview: "Every Monday, Wednesday, Friday at 9:00"  │
│ Cron: 0 9 * * 1,3,5                                 │
└─────────────────────────────────────────────────────┘
```

### Real-time Status Updates

Convex subscriptions power live UI updates:

- Schedule "Next Run" countdown timers
- Run status badges update instantly (pending → running → completed)
- Toast notifications on task completion/failure

---

## Mobile App (Future)

### Scope: Read + Trigger

| Feature | Mobile Support |
|---------|----------------|
| View schedules | ✅ |
| Enable/disable schedules | ✅ |
| View run history | ✅ |
| Trigger manual runs | ✅ |
| Create/edit jobs | ❌ (desktop only) |
| Create/edit schedules | ❌ (desktop only) |

### Technology

- **React Native** with Convex SDK (same schema, same queries)
- **Expo** for rapid development
- Push notifications for task completion (via Convex + Expo Push)

---

## Migration from hs-conductor

### Migration Tool

Build a one-time migration utility:

1. **Read Conductor data**:
   - `data/schedules/*.json` → Convex `schedules` table
   - `workloads/*.yaml` → Convex `jobs` table
   - `data/runs/*/run.json` → Convex `runs` table (recent only)

2. **Transform formats**:
   - YAML job definitions → Convex document structure
   - Inngest event names → Convex function references

3. **Validate & import**:
   - Schema validation before insert
   - Dry-run mode to preview changes
   - Progress reporting

### Conductor Retirement

Once Buddy Workflows is stable:

1. Stop hs-conductor Windows Service
2. Uninstall Inngest Dev Server
3. Archive hs-conductor repository (read-only)
4. Update documentation to point to Buddy

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goal**: Convex setup + basic schedule management

- [ ] Initialize Convex project (`npx convex init`)
- [ ] Define schema (jobs, schedules, runs tables)
- [ ] Implement Convex functions (CRUD for schedules)
- [ ] Add Convex client to Electron renderer
- [ ] Create "Automation" activity bar icon
- [ ] Build Schedules sidebar + list view
- [ ] Port CronBuilder component from hs-conductor
- [ ] Implement schedule enable/disable toggles

**Deliverable**: Can create, edit, enable/disable schedules in Buddy UI

### Phase 2: Execution Engine (Weeks 3-4)

**Goal**: Tasks actually run on schedule

- [ ] Implement Convex cron job for schedule scanning
- [ ] Build task dispatch system (Convex → Electron)
- [ ] Implement exec-worker in Electron main process
- [ ] Implement ai-worker with LLM integration
- [ ] Implement skill-worker (Claude CLI spawning)
- [ ] Add run history view with real-time updates
- [ ] Implement offline queue + catch-up logic
- [ ] Add toast notifications for task events

**Deliverable**: Schedules trigger tasks, results visible in UI

### Phase 3: Jobs + Migration (Weeks 5-6)

**Goal**: Full job management + Conductor migration

- [ ] Build job list view
- [ ] Add job editor (Monaco or form-based)
- [ ] Implement job CRUD in Convex
- [ ] Build migration tool for Conductor data
- [ ] Test migration with real Conductor schedules
- [ ] Documentation updates
- [ ] Conductor retirement checklist

**Deliverable**: Full feature parity with Conductor, migration complete

### Phase 4: Polish + Mobile Prep (Future)

- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Mobile app scaffolding (React Native + Expo)
- [ ] Push notification integration
- [ ] Beta testing

### Phase 5: Set it Free Loop ✅ Foundation / 🚧 In Progress

**Goal**: Buddy as a governed reference consumer of the Set it Free Loop operating model.

The operating model itself lives in **[relias-engineering/set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop)**.
Buddy's role here is to run the loop and dogfood the governance standard.

- [x] `daily-repo-status` (`SFL Repo Status`) workflow deployed and running
- [x] `repo-audit` (`Repo Audit`) workflow deployed and running
- [x] `discussion-processor` deployed and grouping report findings into actionable issues
- [x] `sfl-issue-processor` is the single implementer for first-pass and follow-up PR work
- [x] Direct chain pattern (A→B→C→label-actions) handles deterministic ready-for-review routing
- [x] Governance labels configured via `setup-labels.ps1`
- [x] `featureIntakes` Convex table for intake normalization
- [ ] 30-day pilot metrics published to SFL repo

**Deliverable**: Buddy demonstrates the full loop; metrics feed back into the SFL operating model

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Convex (not Inngest) | Cloud-native, real-time subscriptions, no local server |
| Storage | Full Convex DB | Platform independence, mobile app support |
| Large files | Convex File Storage | S3-like API, included in Convex |
| Auth | Implicit via GitHub CLI | Reuse existing auth, no new login flow |
| Workers | exec, ai, skill (3 types) | Covers all use cases, skill integration is unique value |
| Offline | Queue + catch-up | Best UX for laptop users |
| Mobile scope | Read + trigger only | 80/20 rule, editing needs desktop |
| Implementation | 3 phases (incremental) | Reduce risk, get value early |
| Conductor fate | Replaced by Buddy | Single tool, single codebase |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Convex learning curve | Medium | Start with simple CRUD, expand gradually |
| Execution latency (cloud → local) | Low | Tasks are not latency-sensitive |
| Convex pricing at scale | Low | Free tier generous; paid tier reasonable |
| Skill worker complexity | Medium | Start with simple skills, iterate |
| Migration data loss | High | Dry-run mode, manual verification |

---

## Success Metrics

1. **All Conductor schedules migrated** to Buddy
2. **Zero missed scheduled tasks** for 30 days
3. **< 5 second** task trigger latency (cloud → local execution start)
4. **Real-time UI updates** working reliably
5. **Conductor Windows Service** safely retired
6. **Feature intake normalization rate** > 90% into GitHub Issues
7. **Agent-generated PR merge success** tracked with clear quality thresholds
8. **Cost per resolved issue** measured and trending down over pilot period

---

## References

- [relias-engineering/set-it-free-loop](https://github.com/relias-engineering/set-it-free-loop) — SFL operating model, workflow library, governance
- [hs-conductor]((hs-conductor-repo)) — Source codebase for migration
- [Convex Documentation](https://docs.convex.dev) — Backend platform
- [Convex File Storage](https://docs.convex.dev/file-storage) — For run outputs
- [Convex Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs) — For schedule scanning

---

## Appendix: Conductor Components to Port

| Conductor File | Buddy Equivalent | Notes |
|----------------|------------------|-------|
| `src/inngest/client.ts` | `convex/` folder | Complete rewrite |
| `src/workers/scheduler.ts` | Convex cron function | Simpler in Convex |
| `admin/src/components/CronBuilder.tsx` | `src/components/CronBuilder.tsx` | Mostly copy-paste |
| `src/lib/workload-loader.ts` | Not needed | Jobs in DB |
| `src/lib/executor.ts` | `electron/workers.ts` | Local execution |
| `data/schedules/*.json` | Convex `schedules` table | Migration tool |
| `workloads/*.yaml` | Convex `jobs` table | Migration tool |

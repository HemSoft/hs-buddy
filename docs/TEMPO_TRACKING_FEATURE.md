# Tempo Tracking Feature Spec

## Summary

Add a first-class **Tempo Tracking** experience to Buddy with a new tree-view
section for viewing and managing time entries through Tempo API calls.

The feature should feel modern, fast, and high-signal: strong visual hierarchy,
quick actions, and low-friction editing.

## Objectives

1. Make daily time tracking possible without leaving Buddy.
2. Surface immediate progress toward daily and weekly targets.
3. Provide fast-entry workflows for common work categories.
4. Keep credentials and API operations secure via Electron main process.
5. Keep UI consistent with Buddy's VSCode-inspired visual language.

## User Experience

### Navigation

Add a new tree-view section:

- Tempo Tracking
- Tempo Tracking > Today
- Tempo Tracking > Week
- Tempo Tracking > Quick Log
- Tempo Tracking > Recent

### Visual Design

The Tempo area should be dashboard-like and action-oriented.

- Top summary cards for key metrics:
  - Today Hours
  - Week Hours
  - Remaining to Target
  - Top Issue This Week
- Timeline list for worklogs:
  - Time range
  - Issue key and issue title
  - Account badge
  - Duration chip
  - Description preview
- Quick Log panel:
  - Preset buttons with one-click submission
  - Inline "hours" + "note" fields
  - Smart defaults (current date/time)

### Motion and Interaction

- Optimistic updates for create/edit/delete.
- Soft row-highlight animation when a worklog is added.
- Inline loading placeholders while API requests resolve.
- Undo affordance after delete (time-boxed client rollback where practical).

## Functional Scope

1. Read worklogs for today and current week.
2. Add worklog entries.
3. Edit existing worklog entries.
4. Delete worklog entries.
5. Show day/week totals and remaining target.
6. Provide quick-log aliases mapped to common Jira issues.

## Tempo API Integration

## Base URL

- `https://api.tempo.io/4`

## Required Environment Variables

- `TEMPO_API_TOKEN`
- `ATLASSIAN_EMAIL`
- `ATLASSIAN_API_TOKEN`

All secrets remain in Electron main process.

## Endpoints

- `GET /worklogs/user/{accountId}?from={date}&to={date}`
- `POST /worklogs`
- `PUT /worklogs/{id}`
- `DELETE /worklogs/{id}`
- `GET /accounts`

## Payload Examples

### Create Worklog

```json
{
  "issueKey": "PE-992",
  "timeSpentSeconds": 7200,
  "startDate": "2026-03-03",
  "startTime": "09:00:00",
  "description": "Implemented Tempo dashboard cards",
  "authorAccountId": "<tempo-account-id>",
  "attributes": [
    {
      "key": "_Account_",
      "value": "GEN-DEV"
    }
  ]
}
```

### Update Worklog

```json
{
  "description": "Updated Tempo timeline row interactions",
  "timeSpentSeconds": 5400
}
```

## Architecture

### Main Process

Create:

- `electron/services/tempoClient.ts`
  - `getTodayWorklogs(accountId)`
  - `getWeekWorklogs(accountId)`
  - `createWorklog(input)`
  - `updateWorklog(id, input)`
  - `deleteWorklog(id)`
  - `getAccounts()`

- `electron/ipc/tempoHandlers.ts`
  - `tempo:get-today`
  - `tempo:get-week`
  - `tempo:create-worklog`
  - `tempo:update-worklog`
  - `tempo:delete-worklog`
  - `tempo:get-accounts`

Modify:

- `electron/ipc/index.ts` to register tempo handlers.
- `electron/preload.ts` to expose typed tempo IPC methods.

### Renderer

Create:

- `src/types/tempo.ts`
- `src/hooks/useTempo.ts`
- `src/components/tempo/TempoDashboard.tsx`
- `src/components/tempo/TempoSummaryCards.tsx`
- `src/components/tempo/TempoTimeline.tsx`
- `src/components/tempo/TempoQuickLog.tsx`
- `src/components/tempo/TempoWorklogEditor.tsx`
- `src/components/tempo/TempoDashboard.css`

Modify:

- `src/components/ActivityBar.tsx` for Tempo section entry.
- `src/components/SidebarPanel.tsx` for Tempo tree nodes.
- `src/components/AppContentRouter.tsx` for tempo routes.
- `src/components/appContentViewLabels.ts` for tempo view labels.

## Data Model (Renderer)

```ts
export interface TempoWorklog {
  tempoWorklogId: number
  issueKey: string
  issueSummary: string
  accountKey: string
  startDate: string
  startTime: string
  timeSpentSeconds: number
  description?: string
  authorAccountId: string
}

export interface TempoDaySummary {
  date: string
  totalSeconds: number
  targetSeconds: number
  entries: TempoWorklog[]
}

export interface TempoWeekSummary {
  weekStart: string
  weekEnd: string
  totalSeconds: number
  targetSeconds: number
  byDay: TempoDaySummary[]
}
```

## Presets and Smart Defaults

Initial Quick Log presets inspired by the Tempo skill:

- Meetings -> `INT-14`
- PE Support -> `PE-869`
- Relias Assistant -> `PE-992`
- AI Chapter -> `PE-931`
- Professional Development -> `INT-5`
- PTO/Sick/Holiday -> `INT-8`

Smart defaults:

- Date defaults to today.
- Start time defaults to nearest previous 15-minute mark.
- Account inferred from issue prefix:
  - `INT-*` -> `INT`
  - `PE-*`, `RPLAT-*`, `RCOMM-*`, `PORT-*` -> `GEN-DEV`

## Error Handling

- Distinguish auth/token failures from data/validation failures.
- Show user-facing actionable messages:
  - Missing `TEMPO_API_TOKEN`
  - Permission denied for account/project
  - Invalid issue key
- Retry transient network failures with capped backoff in main process.

## Security

- Never expose Tempo token in renderer state, logs, or IPC payload echoes.
- Strip sensitive headers from all debug output.
- Keep all Tempo HTTP calls in Electron main process.

## Performance

- Cache account metadata for 5 minutes.
- Cache current week worklogs for 60 seconds unless mutated.
- Invalidate relevant cache slices on create/update/delete.

## Accessibility

- Keyboard-friendly command flow for quick logging.
- ARIA labels on all interactive controls.
- Announce create/update/delete result messages for screen readers.
- Ensure contrast ratios for card badges and chips meet AA.

## Implementation Phases

### Phase 1: Infrastructure

1. Add tree section + routing labels.
2. Implement tempo client and IPC handlers.
3. Expose preload APIs.

### Phase 2: Core UX

1. Build Today and Week views.
2. Build create/edit/delete worklog actions.
3. Add summary cards and timeline rows.

### Phase 3: Quick Log and Polish

1. Add preset-based quick-log panel.
2. Add optimistic UI + rollback.
3. Add visual polish and motion.
4. Add empty/error states.

### Phase 4: Hardening

1. Add logging and diagnostics hooks.
2. Add unit tests for hooks and mapper logic.
3. Add integration tests for IPC contract.

## Acceptance Criteria

1. Users can view today and week totals inside Buddy.
2. Users can create a worklog in under 10 seconds via Quick Log.
3. Users can edit and delete entries from the timeline.
4. Totals update immediately after mutation.
5. Tempo credentials remain main-process only.
6. Tree section is discoverable and visually cohesive.

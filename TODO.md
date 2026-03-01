# Buddy - TODO

| Status | Priority | Task | Notes |
|--------|----------|------|-------|
| 📋 | Critical | [SFL Auto-Merge mode](#sfl-auto-merge-mode) | Configurable flag to let SFL merge its own PRs autonomously; off by default |
| 📋 | High | [Global Copilot Assistant Panel](#global-copilot-assistant-panel) | Toggleable right-hand pane with context-aware AI chat powered by Copilot SDK |
| 📋 | High | [SFL Loop monitoring in Organizations tree](#sfl-loop-monitoring-in-organizations-tree) | Auto-detect SFL-enabled repos; show pipeline status node under each repo |
| 📋 | Medium | [Run 30-day Set it Free pilot](#run-30-day-set-it-free-pilot) | Measure MTTR, merge quality, false positives; publish to SFL repo |
| 📋 | Medium | [Create cost telemetry dashboard](#create-cost-telemetry-dashboard) | Run counts, p50/p90 cost, monthly budget burn |
| 📋 | Medium | [Add branch cleanup to repo-audit](#add-branch-cleanup-to-repo-audit) | Detect and delete merged/orphaned agent-fix branches |
| 📋 | Medium | [Elegant status bar queue display](#elegant-status-bar-queue-display) | Show "Processing 1 of N" with current task name instead of concatenating all queued tasks |
| 📋 | Medium | [PR Analyzers should post reviews, not update PR body](#pr-analyzers-should-post-reviews-not-update-pr-body) | Analyzers currently append verdicts to the PR body via `update_issue`; should use `add_comment` or proper PR review comments instead |
| ✅ | Medium | Copilot enterprise budget not resetting on new billing cycle | Fixed: UTC dates for billing API query, auto-refresh on month boundary, billing period display (2026-02) |
| ✅ | Critical | SFL Simplification — Replace supersession model | pr-fixer rewritten to use `push-to-pull-request-branch` (2026-02) |
| ✅ | Critical | SFL Simplification — Label pruning | 39→27 labels, removed 12 unused (2026-02) |
| ✅ | Critical | Build sfl-auditor workflow | Audits label consistency; repairs orphaned state (2026-02) |
| ✅ | High | SFL Simplification — Reduce PR Fixer prompt | 365→164 lines via V2 architecture (2026-02) |
| ✅ | High | SFL Simplification — Adopt new safe-outputs | add-comment, add-labels/remove-labels in fixer/promoter/processor (2026-02) |
| ✅ | High | SFL Complexity gate for future sessions | Session Start Gate added to SKILL.md (2026-02) |
| ✅ | High | Critically reduce and remove AGENTS.md | Covered in workflow prompts and governance docs (2026-02) |
| ✅ | High | Complete migration to relias-engineering | Migrated, PAT set, pipeline verified (2026-02) |
| ✅ | High | Define Set it Free governance policy | Moved to relias-engineering/set-it-free-loop (2026-02) |
| ✅ | High | Build feature-intake normalization workflow | Convex mapping + template-driven issue drafts + dedupe (2026-02) |
| ✅ | High | Issue Processor workflow | Cron claim → draft PR → agent:in-progress labeling (2026-02) |
| ✅ | High | Build PR Analyzer workflow (×3 models) | Three analyzers on staggered crons; cycle-aware markers (2026-02) |
| ✅ | High | Build PR Fixer workflow (authority) | Claude Opus; reads analyzer comments; commits fixes (2026-02) |
| ✅ | High | Add pr:cycle-N label system | Labels pr:cycle-1/2/3; analyzers skip cycle-3 (2026-02) |
| ✅ | High | Build PR Promoter workflow | All analyzers pass → un-draft PR + promotion comment (2026-02) |
| ✅ | High | Improve Welcome to Buddy window | Convex-backed stats dashboard, session tracking (2026-02) |
| ✅ | High | Expand repo detail view | Rich card-based repo info panel with caching (2026-02) |
| ✅ | High | Make repos expandable folders | Expandable repos with Issues & PRs children (2026-02) |
| ✅ | High | Build task dispatch system | Dispatcher + exec worker + Convex claiming (2026-02) |
| ✅ | High | Implement exec-worker | spawn()-based shell execution, timeout, abort (2026-02) |
| ✅ | High | Restructure electron/main.ts | Split 423→95 lines, 8 new modules (2026-02) |
| ✅ | High | Job management UI | CRUD, context menus, worker-type forms (2026-02) |
| ✅ | High | Implement Convex cron job | Runs every minute via crons.ts (2026-02) |
| ✅ | High | Data prefetch + persistent cache | PR data survives restarts, background refresh (2026-02) |
| ✅ | High | Tabbed window system for PRs | Tabs above content area, no duplicates (2025-01) |
| ✅ | High | Fix Recently Merged date range | 30-day default, configurable in Settings (2025-01) |
| ✅ | High | App-wide task queue system | Named queues with concurrency control (2025-01) |
| ✅ | High | Settings UI with form-based editing | SidebarPanel navigation, auto-save (2025-01) |
| ✅ | High | Initialize Convex project | Generated types ready (2025-02) |
| ✅ | High | Define Convex schema | convex/schema.ts with jobs, schedules, runs (2025-01) |
| ✅ | High | Add Convex client to Electron | ConvexClientProvider, useConvex hooks (2025-01) |
| ✅ | High | Implement schedule CRUD functions | convex/schedules.ts, jobs.ts, runs.ts (2025-01) |
| ✅ | Medium | Repos of Interest feature | Folder-organized bookmark system for GitHub repos (2026-02) |
| ✅ | Medium | Add run history view | Real-time status, filters, expandable output (2026-02) |
| ✅ | Medium | Implement skill-worker | Copilot CLI spawn, --allow-all mode, abort/timeout (2026-02) |
| ✅ | Medium | Implement ai-worker | Copilot CLI spawn, model selection, abort support (2026-02) |
| ✅ | Medium | Create schedule editor dialog | Modal with CronBuilder, job selector (2025-02) |
| ✅ | Medium | Add Workflows activity bar icon | RefreshCw icon in ActivityBar (2025-01) |
| ✅ | Medium | Build Schedules sidebar + list | ScheduleList component with status badges (2025-01) |
| ✅ | Medium | Port CronBuilder component | From hs-conductor with visual builder (2025-01) |
| ✅ | Medium | Implement schedule toggles | Toggle mutation in useConvex hooks (2025-02) |
| ✅ | Medium | Fix taskbar app name | "HS-body" → "Buddy" (2025-01) |
| ✅ | Medium | Create Help menu with About window | Beautiful About dialog with branding (2025-01) |
| ✅ | Medium | Design and create app icon | Gold/orange gradient Users icon (2025-01) |
| ✅ | Low | Implement offline queue | Catch-up logic on reconnect (2026-02) |

## Progress

**Remaining: 7** | **Completed: 46** (87%)

---

## Remaining Items

### SFL Auto-Merge mode

**Goal**: Make SFL capable of running fully autonomously — including merging its own PRs — as an opt-in feature. Off by default. When enabled, the PR Promoter skips the human approval gate and directly adds `ready-to-merge`, which triggers PR Label Actions to squash-merge with `--admin` bypass.

**Why configurable**: In production deployments, SFL should stop at `human:ready-for-review` and wait for a human to approve and merge. Full autonomy is an experimental capability for testing the complete loop end-to-end. The mother repo (set-it-free-loop) must ship with this OFF.

**Design considerations**:

- **Where to store the flag**: Options include a repo variable (`vars.SFL_AUTO_MERGE`), a repository label, a config file in `.github/`, or a GitHub environment. Repo variable is simplest and doesn't require code changes to read.
- **What reads the flag**: PR Promoter workflow — it's the decision point between "hand off to human" and "add ready-to-merge". The promoter prompt needs a conditional: if auto-merge is on, add the label directly; if off, stop at `human:ready-for-review`.
- **Self-approval problem**: The `fhemmerrelias` PAT creates PRs and runs the promoter — GitHub blocks self-approval. With auto-merge ON, the promoter skips the approval step entirely since `--admin` on merge bypasses all branch protection.
- **Audit trail**: When auto-merge is active, the promoter should add a comment noting the PR was auto-merged without human review, for transparency.
- **Safety guardrails**: Consider requiring `risk:trivial` or `risk:low` for auto-merge; `risk:medium`/`risk:high` PRs always wait for human review regardless of the flag.

**Implementation steps**:

1. Add `SFL_AUTO_MERGE` repo variable (or determine best config mechanism)
2. Update `pr-promoter.md` to read the flag and branch behavior accordingly
3. Update `pr-label-actions.yml` if needed (currently already uses `--admin`)
4. Test full autonomous loop: issue → PR → analyze → fix → promote → merge
5. Document the feature in SFL onboarding/governance docs
6. Verify the flag defaults to OFF in a fresh SFL deployment

---

### SFL Loop monitoring in Organizations tree

**Goal**: Dynamically detect SFL-enabled repos and show a pipeline status node under each repo in the Organizations sidebar tree.

**Detection**: Check for SFL workflow files (e.g., `sfl-dispatcher.yml`, `sfl-auditor.lock.yml`, or `issue-processor.lock.yml`) via the GitHub API (`GET /repos/{owner}/{repo}/contents/.github/workflows`). Cache the result per repo.

**UI**: When SFL is detected, add a child node under the repo (alongside Overview, Issues, Pull Requests):

- **SFL Loop** — clickable, opens a content page showing:
  - Pipeline health status (harmony check)
  - Active issues: `agent:fixable`, `agent:in-progress` counts
  - Open draft PRs in the pipeline with cycle count
  - Recent merge activity
  - Last auditor/dispatcher run timestamps

**Steps**:

1. Add `fetchSFLStatus(owner, repo)` to `GitHubClient` — check for SFL workflows + fetch labeled issues/PRs
2. Cache SFL-enabled flag per repo in `dataCache`
3. In `GitHubSidebar.tsx`, conditionally render "SFL Loop" node when detected
4. Create `SFLLoopPanel.tsx` content page with pipeline overview
5. Add `sfl-loop:owner/repo` route to `AppContentRouter.tsx` and `appContentViewLabels.ts`

---

### Run 30-day Set it Free pilot

**Goal**: Validate quality and economics with real usage in this repo. Publish metrics back to the SFL repo.

**Deliverables**:

- Baseline vs post-loop performance report
- False positive and rework analysis
- Recommendation for broader rollout

---

### Add branch cleanup to repo-audit

**Goal**: Have the repo-audit workflow detect and report stale branches (merged `agent-fix/*` branches, orphaned worktree branches, old scaffold branches) so they don't accumulate.

**Scope**:

- List remote branches matching `agent-fix/*` whose linked PR is merged or closed → create issue to delete
- Detect local-only branches that are fully merged into main
- Flag branches older than 7 days with no associated open PR

---

### Global Copilot Assistant Panel

**Goal**: Add a global, context-aware AI assistant as a toggleable right-hand pane, powered by the Copilot SDK. The assistant is always one click away and adapts to whatever the user is viewing.

**Layout Change**: The current two-pane layout (`Sidebar | Content`) becomes a three-pane layout (`Sidebar | Content | Assistant`) using the existing Allotment splitter. The third pane is optional — toggled on/off via a Copilot button in the TitleBar.

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ TitleBar  [File][Edit][View][Help]  HemSoft Developments Buddy   [✦ Copilot] [─][□][✕] │
├────────┬──────────────────────────────────────┬──────────────────────┤
│Activity│           Content Area               │  Copilot Assistant  │
│  Bar   │  ┌──────────────────────────────┐    │  ┌────────────────┐ │
│        │  │ TabBar                       │    │  │                │ │
│Sidebar │  │──────────────────────────────│    │  │  Conversation  │ │
│(Tree)  │  │                              │    │  │  Output        │ │
│        │  │  Active View Content          │    │  │  (scrollable)  │ │
│        │  │  (PR Detail, Repo, Welcome,  │    │  │                │ │
│        │  │   Issues, etc.)              │    │  │                │ │
│        │  │                              │    │  │                │ │
│        │  │                              │    │  ├────────────────┤ │
│        │  │                              │    │  │ Context badge  │ │
│        │  └──────────────────────────────┘    │  │ [  Prompt     ]│ │
│        │                                      │  │ [  Input      ]│ │
│        │                                      │  │ [  Send ▶     ]│ │
│        │                                      │  └────────────────┘ │
├────────┴──────────────────────────────────────┴──────────────────────┤
│ StatusBar                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

#### Sub-Tasks

##### Phase 1 — Layout & Toggle Infrastructure

1. **TitleBar Copilot toggle button** — Add a `✦ Copilot` button (using `Sparkles` icon from lucide-react) to `TitleBar.tsx` between the brand title and the window controls. The button toggles the assistant pane open/closed. Persist open/closed state to electron-store via `config:get-assistant-open` / `config:set-assistant-open`.

2. **Three-pane Allotment layout** — Modify the `Allotment` in `App.tsx` from 2 panes to 3 panes. The third pane (assistant) is conditionally rendered based on toggle state. Persist pane sizes as a 3-element array via existing `config:get-pane-sizes` / `config:set-pane-sizes` IPC, gracefully handling migration from the current 2-element array. Third pane constraints: `minSize={280}`, `maxSize={600}`, `preferredSize={350}`.

3. **Keyboard shortcut** — Register `Ctrl+Shift+A` (or similar) globally to toggle the assistant pane. Wire through `electron/menu.ts` accelerator and IPC.

##### Phase 2 — Assistant Panel Component

1. **`AssistantPanel.tsx`** — New component rendered in the third Allotment pane. Layout uses CSS flex column:
   - **Header** (fixed): "Copilot Assistant" with clear-conversation and model-picker controls.
   - **Conversation area** (flex-grow, scrollable): Renders a list of `AssistantMessage` entries (user + assistant turns). Auto-scrolls to bottom on new messages. Supports markdown rendering for assistant responses (reuse the existing markdown renderer from `CopilotResultPanel`).
   - **Context badge bar** (fixed): Shows what context is currently attached (e.g., "PR #142 — fix auth bug", "Repo: hs-buddy", "Issue #23"). Dismissible per-item.
   - **Input area** (fixed at bottom): Multi-line `<textarea>` with auto-resize (same pattern as `CopilotPromptBox`), Send button (`Send` icon), keyboard submit on `Enter` (Shift+Enter for newline). Shows a typing/streaming indicator while the assistant is responding.

2. **`AssistantPanel.css`** — VSCode-inspired dark theme styling consistent with the app's existing aesthetic. Conversation bubbles differentiated by role (user = right-aligned subtle, assistant = left-aligned with background). Code blocks with syntax highlighting.

##### Phase 3 — Context Awareness System

1. **`useAssistantContext` hook** — React hook that derives the current context from app state:
   - **Active tab view** (`activeViewId`): If viewing `pr-detail:owner/repo/123`, attach PR metadata (title, number, URL, author, description, diff stats). If viewing `repo-detail:owner/repo`, attach repo metadata. If viewing `repo-issues:owner/repo`, attach issue list context. If viewing `welcome`, attach app overview context.
   - **Sidebar selection** (`selectedSection` + highlighted tree node): If a specific tree item is selected/highlighted, include its identity.
   - **Selected text**: If the user has highlighted text in the content area, include it as a quote block in the prompt.
   - Returns a structured `AssistantContext` object: `{ viewType, viewId, summary, metadata }` that gets serialized into a system prompt preamble.

2. **Context serialization** — Convert `AssistantContext` into a system prompt prefix for the Copilot SDK. Example:

   ```
   You are Buddy Assistant, an expert AI helper embedded in HemSoft Buddy.
   The user is currently viewing: Pull Request #142 "Fix auth token refresh"
   Repository: relias-engineering/hs-buddy
   Author: fhemmerrelias
   Status: Open (draft)
   [Additional metadata as available]
   
   Answer questions about what's on screen, the app itself, or anything else.
   ```

##### Phase 4 — Copilot SDK Integration for Chat

1. **Streaming conversation via Copilot SDK** — Extend `copilotClient.ts` with a new `sendChatMessage()` function that supports multi-turn conversation (maintains session across turns instead of creating/destroying per prompt). Use the SDK's `AssistantMessageEvent` streaming to pipe tokens into the UI in real-time.

2. **New IPC channel: `copilot:chat`** — Add to `electron/ipc/copilotHandlers.ts`:
   - `copilot:chat-send` — Accepts `{ message, context, conversationHistory }`, returns streamed response chunks via IPC event `copilot:chat-chunk`.
   - `copilot:chat-abort` — Aborts the in-flight chat response.
   - `copilot:chat-clear` — Resets conversation history.

3. **Conversation state management** — `useAssistantConversation` hook manages:
    - `messages: AssistantMessage[]` — Full conversation history (role, content, timestamp, context snapshot).
    - `isStreaming: boolean` — Whether a response is being received.
    - `sendMessage(text)` — Appends user message, calls IPC, streams response.
    - `clearConversation()` — Resets messages array.
    - `abortResponse()` — Cancels in-flight streaming.
    - Conversation persists in React state (not Convex) — intentionally ephemeral per app session.

##### Phase 5 — Conversation Persistence (Optional)

1. **Convex conversation storage** — Optional future enhancement: persist conversations to Convex so they survive app restarts. Schema addition:

    ```typescript
    assistantConversations: defineTable({
      title: v.optional(v.string()),
      messages: v.array(v.object({
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        timestamp: v.number(),
        contextSnapshot: v.optional(v.string()),
      })),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
    ```

2. **Conversation history sidebar** — Small dropdown or list in the assistant header to switch between past conversations or start a new one.

##### Phase 6 — Polish & UX

1. **Smooth pane animation** — Animate the assistant pane sliding in/out when toggled (CSS transition on width or Allotment's built-in resize behavior).

2. **Empty state** — When the assistant pane is open but no messages exist, show a friendly onboarding message: "Ask me anything about what you're viewing, or about Buddy itself. I can help with PRs, repos, issues, and more."

3. **Suggested prompts** — In the empty state, show 3-4 contextual quick-action buttons based on current view:
    - PR view: "Summarize this PR", "List unresolved threads", "Suggest improvements"
    - Repo view: "Show recent activity", "Explain this repo"
    - Welcome: "What can you do?", "Show my open PRs"

4. **StatusBar integration** — Add a small Copilot indicator to the `StatusBar` showing streaming/idle state when the assistant is active.

5. **Copy & export** — Allow copying individual assistant messages or exporting the full conversation as markdown.

6. **Accessibility** — Ensure keyboard navigation within the assistant panel (Tab through messages, Enter to send, Escape to close pane), ARIA labels on all interactive elements, screen reader announcements for new messages.

#### Key Design Decisions

- **Ephemeral by default**: Conversations live in React state, not Convex. This keeps it lightweight and avoids schema churn during development. Convex persistence is Phase 5.
- **Copilot SDK, not a new LLM integration**: Reuses the existing `copilotClient.ts` singleton and `@github/copilot-sdk` package — no new dependencies for the AI backend.
- **Context injection, not RAG**: Context comes from structured app state (PR metadata, repo info) injected as a system prompt, not from document retrieval. This is simpler, faster, and leverages data already in memory.
- **Separate from existing Copilot Prompt tab**: The current `CopilotPromptBox` in the Activity Bar → Copilot section is a batch-style "submit prompt, view result" workflow. The assistant panel is a real-time conversational interface. Both coexist.

#### Files to Create or Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/AssistantPanel.tsx` | Main assistant pane component |
| Create | `src/components/AssistantPanel.css` | Assistant pane styling |
| Create | `src/hooks/useAssistantContext.ts` | Derives context from active view/selection |
| Create | `src/hooks/useAssistantConversation.ts` | Manages conversation state, streaming, abort |
| Create | `src/types/assistant.ts` | `AssistantMessage`, `AssistantContext` type definitions |
| Modify | `src/components/TitleBar.tsx` | Add Copilot toggle button between brand and window controls |
| Modify | `src/components/TitleBar.css` | Style the toggle button |
| Modify | `src/App.tsx` | Add third Allotment pane, toggle state, pane size persistence |
| Modify | `src/App.css` | Layout adjustments for three-pane |
| Modify | `electron/services/copilotClient.ts` | Add `sendChatMessage()` with multi-turn session |
| Modify | `electron/ipc/copilotHandlers.ts` | Add `copilot:chat-send`, `copilot:chat-abort`, `copilot:chat-clear` IPC channels |
| Modify | `electron/ipc/index.ts` | Register new chat IPC handlers |
| Modify | `electron/config.ts` | Add `assistant-open` persistence key |
| Modify | `src/components/StatusBar.tsx` | Add Copilot streaming indicator |
| Modify (Phase 5) | `convex/schema.ts` | Add `assistantConversations` table |

---

### Create cost telemetry dashboard

**Goal**: Make spend predictable at repo and portfolio level.

**Deliverables**:

- Per-workflow run and cost metrics
- p50/p90 cost-per-run reporting
- Monthly cap alerts and throttle policies

---

### Elegant status bar queue display

**Goal**: Replace the current chaotic status bar behavior during startup and scheduled processing with a clean, sequential display. When multiple tasks are queued (e.g., 4-5 tasks during startup), the status bar currently concatenates all task names, creating a busy and unreadable display.

**Desired behavior**: Show `Processing 1 of N — <current task name>` and update as each task completes, e.g.:

- `Processing 1 of 4 — Fetching PR data...`
- `Processing 2 of 4 — Syncing repo bookmarks...`
- `Processing 3 of 4 — Checking schedules...`
- `Processing 4 of 4 — Refreshing cache...`

When all tasks are done, revert to the normal idle status.

**Scope**:

- Update `StatusBar.tsx` to show a single active task with a queue position indicator
- Modify the task queue / status update logic to track total count and current index
- Ensure the display is clear and elegant even when many tasks are processing simultaneously

---

### PR Analyzers should post reviews, not update PR body

**Goal**: Migrate analyzer verdicts from PR body updates (`update_issue`) to proper PR review comments (`add_comment` or `submit-pull-request-review`), keeping the PR body clean.

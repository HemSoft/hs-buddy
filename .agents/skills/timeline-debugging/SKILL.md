---
name: timeline-debugging
description: "V1.0 - Commands: Create, Update, Normalize. Build and maintain debugging timelines for hs-buddy incidents with timestamp-first navigation, one-line summaries, and linked detail sections. Use when tracking SFL failures, workflow investigations, or any multi-step recovery path in markdown."
---

# Timeline Debugging

Protocol check: consult the `protocols` skill if you need a standardized questioning flow.

Create and maintain markdown debug logs that are navigable from the top down.

## Goal

The top of the file should behave like a fast incident index:

- timestamp first
- one-line summary second
- link to detail third

The detail sections below should expand each event without cluttering the top.

## Commands

### Create

Use when starting a new debug or recovery log.

Required structure:

1. `# {Title}`
2. `## Time Zone`
3. `## Timeline Index`
4. `## Detailed Entries`
5. Optional closing sections such as `## Current State`, `## Manual Interventions`, `## Next Investigation`

## Timeline Index Rules

The `## Timeline Index` section must contain only short entries. Prefer a markdown table with these columns:

| Time | Summary | Detail |
|------|---------|--------|

Rules:

- `Time` must be explicit and include time zone, for example `2026-03-09 05:35:11 PM ET`
- `Summary` must be one sentence or sentence fragment
- `Detail` must link to a matching anchor in `## Detailed Entries`
- do not put paragraphs in the index
- do not put root-cause analysis in the index

## Detailed Entries Rules

Each timeline event gets its own anchored subsection under `## Detailed Entries`.

Format:

```markdown
### 2026-03-09 05:35:11 PM ET - Ready for review {#event-053511}

- Observed: what changed or was detected
- Action: what was done
- Result: outcome after the action
- Evidence: run ID, PR, issue, commit, label set, or file reference
```

Rules:

- keep the heading timestamp identical to the index timestamp
- use stable anchor names such as `event-040756`, `event-053422`
- one event per subsection
- keep bullets short and factual

## Update

Use when appending new work to an existing timeline.

Process:

1. Add a new row to `## Timeline Index`
2. Add the matching detailed subsection under `## Detailed Entries`
3. Preserve chronological order
4. If an older summary becomes inaccurate, update the summary row and the detailed entry together

## Normalize

Use when an existing log is a wall of prose and needs to become navigable.

Process:

1. Extract the concrete timestamped events
2. Convert all times to one declared time zone
3. Build the compact `## Timeline Index`
4. Move explanation into `## Detailed Entries`
5. Leave summary and state sections below the detailed entries

## Style Rules

- Prefer ASCII only unless the file already requires Unicode
- Prefer exact timestamps over vague phrases like `later` or `after that`
- Prefer verified timestamps from logs, workflow runs, issue updates, or PR updates
- If a time is inferred instead of verified, mark it as `approx.`
- Keep the index readable in under 30 seconds
- Do not duplicate long prose in both the index and the detail section

## History

When this skill is updated, log the interaction in `History/{YYYY-MM-DD}.md`:

```markdown
## HH:MM - {Action Taken}
{One-line summary}
```

Use `Get-Date -Format "HH:mm"` to obtain the timestamp instead of guessing it.

## Recommended Template

```markdown
# {Incident Title}

## Time Zone

Eastern Time

## Timeline Index

| Time | Summary | Detail |
|------|---------|--------|
| 2026-03-09 04:07:56 PM ET | Issue Processor follow-up run started for PR #148. | [Details](#event-040756) |
| 2026-03-09 04:16:15 PM ET | Follow-up code fix landed, but state did not advance. | [Details](#event-041615) |

## Detailed Entries

### 2026-03-09 04:07:56 PM ET - Issue Processor follow-up started {#event-040756}

- Observed: Targeted follow-up work began for PR #148.
- Action: Issue Processor run `22872512992` was dispatched.
- Result: The workflow entered the implementation path.
- Evidence: Run `22872512992`.

### 2026-03-09 04:16:15 PM ET - Follow-up code landed without state advance {#event-041615}

- Observed: The run succeeded and the product-code change landed.
- Action: Verified commit `eef4f09` on the PR branch and inspected emitted outputs.
- Result: `push_to_pull_request_branch` succeeded, but label/body/dispatch advancement did not occur.
- Evidence: Run `22872512992`, commit `eef4f09`.
```

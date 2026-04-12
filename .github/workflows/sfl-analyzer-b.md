---
description: |
  PR Analyzer B — Full-Spectrum Review. Reviews the target draft PR
  across all dimensions using claude-opus-4.6. Dispatched by the
  SFL gate after implementation completes.

on:
  workflow_call:
    inputs:
      pull-request-number:
        description: Target draft PR number for review
        required: true
        type: string
  workflow_dispatch:
    inputs:
      pull-request-number:
        description: Target draft PR number for a manual Analyzer B review
        required: true
        type: string

permissions:
  contents: read
  issues: read
  pull-requests: read

engine:
  id: copilot
  model: claude-opus-4.6

network: defaults

tools:
  github:
    lockdown: false

safe-outputs:
  add-comment:
    target: "*"
    max: 1
  add-labels:
    target: "*"
    max: 1
source: relias-engineering/set-it-free-loop/.github/workflows/sfl-analyzer-b.md@920f9ef4b146573d638fe871db44afc0f0dc6303
---

# SFL Analyzer B — Full-Spectrum Review

You are Analyzer B (claude-opus-4.6). You have been dispatched by the
SFL gate with an explicit PR number.

**Target PR**: #${{ inputs.pull-request-number || github.event.inputs.pull-request-number }}

Follow the shared review instructions in `.github/workflows/shared/sfl-analyzer-core.md`.

Your analyzer ID is **B** (marker id: `b`). Use `sfl-analyzer-b` in all markers.

## Tooling

- For PR reads, use `github-pull_request_read`
- For linked issue reads, use `github-issue_read`
- For repository file reads, use `github-get_file_contents`
- For review comments, use `safeoutputs-add_comment`
- For adding labels (e.g., `analyzer:blocked`), use `safeoutputs-add_labels`
- For no-action exits, use `safeoutputs-noop`

Do NOT use `bash`, `write_bash`, `sql`, `view`, `web_fetch`, or planning tools.

## Important

- Do NOT dispatch any other workflows. The gate owns sequencing.
- Do NOT update any dashboard discussion. Dashboards are out-of-band.
- Post exactly one review comment with the `<!-- MARKER:sfl-analyzer-b cycle:N -->` marker.
- Add `analyzer:blocked` label only if verdict is BLOCKING ISSUES FOUND.

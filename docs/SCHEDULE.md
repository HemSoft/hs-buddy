# SFL Workflow Schedule

Scheduled GitHub Actions workflows are currently paused in this repository. The
workflow files preserve manual dispatch entry points where those workflows still
need to be runnable on demand.

---

## Scheduled Workflows

None. All `schedule` triggers have been removed from `.github/workflows`.

---

> **Note on re-enabling schedules:** GitHub Actions scheduled workflows can
> start 5-30+ minutes after their cron time during periods of high runner load.
> Offset cron times from `:00` to reduce queue congestion.

---

## Event-Driven Workflows (No Schedule)

These fire in response to GitHub events, manual dispatches, or other workflows.

| Trigger | Workflow | What It Does |
|---|---|---|
| Manual dispatch | **SFL Dispatcher** (`sfl-dispatcher.yml`) | Checks for queued SFL work and dispatches gh-aw workflows when useful |
| Dispatcher / manual | **Issue Processor** (`issue-processor.lock.yml`) | Claims one eligible issue and creates a draft PR |
| `pull_request: opened` / dispatcher | **PR Analyzer A** (`pr-analyzer-a.lock.yml`) | First full-spectrum review pass |
| Analyzer A dispatch / dispatcher | **PR Analyzer B** (`pr-analyzer-b.lock.yml`) | Second full-spectrum review pass |
| Analyzer B dispatch / dispatcher | **PR Analyzer C** (`pr-analyzer-c.lock.yml`) | Final full-spectrum review pass |
| Dispatcher / manual | **PR Fixer** (`pr-fixer.lock.yml`) | Applies analyzer feedback and advances the review cycle |
| Dispatcher / manual | **PR Promoter** (`pr-promoter.lock.yml`) | Promotes clean draft PRs or merges approved ready PRs |
| Manual dispatch | **SFL Auditor** (`sfl-auditor.yml`) | Detects and repairs issue/PR state discrepancies |

---

## Pipeline Flow

```text
Manual audit/report workflow dispatch
  ↓ creates issue with agent:fixable
SFL Dispatcher
  ↓ dispatches work only when there is useful queued state
Issue Processor
  ↓ claims issue → creates branch + draft PR
  ↓ labels: agent:in-progress, agent:pr
PR Analyzer A → B → C (sequential review chain)
  ↓ each model reviews the PR
PR Fixer
  ↓ applies analyzer feedback when needed
PR Promoter
  ↓ ready-for-review  OR  squash-merge after approval
```

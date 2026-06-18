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
| `discussion: labeled` | **Discussion Processor** | Groups Discussion findings into `agent:fixable` issues |
| `issues: opened/reopened` or Analyzer C dispatch | **SFL Issue Processor** | Claims issue, creates branch + draft PR |
| `pull_request: opened` | **Analyzer A** | First full-spectrum review pass (Model A) |
| Analyzer A dispatch | **Analyzer B** | Second full-spectrum review pass (Model B) |
| Analyzer B dispatch | **Analyzer C** | Final review pass; dispatches label-actions |
| Analyzer C dispatch / manual | **SFL PR Label Actions** | Checks labels, flips draft → ready-for-review or triggers fix cycle |

---

## Pipeline Flow

```text
Manual audit/report workflow dispatch
  ↓ creates issue with agent:fixable
Discussion Processor (if from Discussion)
  ↓ groups findings into agent:fixable issue
SFL Issue Processor
  ↓ claims issue → creates branch + draft PR
  ↓ labels: agent:in-progress, agent:pr
Analyzer A → B → C (sequential review chain)
  ↓ each model reviews the PR
SFL PR Label Actions
  ↓ ready-for-review  OR  fix cycle back to Processor
```

# SFL Workflow Schedule

All times in **Eastern Time (ET)**. UTC cron expressions are used in workflow
files; ET equivalents assume EDT (UTC-4). During EST (winter), subtract 1 hour.

---

## Scheduled Workflows (Daily)

| Time (ET) | UTC Cron | Workflow | Source | Output |
|---|---|---|---|---|
| **~1:17 AM** | `17 5 * * *` | React Doctor Audit | Local `.yml` | `agent:fixable` issues for React health findings |
| **~2:27 AM** | `27 6 * * *` | Simplisticate Audit | Local `.md` (gh-aw) | `agent:fixable` simplification issue |
| **~3:37 AM** | `37 7 * * *` | Daily Repo Status | Motherrepo `.md` | `report` Discussion |
| **~4:47 AM** | `47 8 * * *` | Repo Audit | Motherrepo `.md` | Consolidated `report` Discussion |
| **~5:57 AM** | `57 9 * * *` | SFL Auditor | Local `.md` | Repairs issue/PR label discrepancies |

> **Note on cron delays:** GitHub Actions scheduled workflows can start 5–30+
> minutes after their cron time during periods of high runner load. This is
> documented behavior and not a bug. All cron times are offset from `:00` to
> reduce queue congestion.

---

## Event-Driven Workflows (No Schedule)

These fire in response to GitHub events or are dispatched by other workflows.

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
Audit (~1:17–5:57 AM ET)
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

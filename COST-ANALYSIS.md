# Cost Analysis — Agentic Loop

> Last updated: 2026-02-20

## Who Pays

The **HemSoft** personal GitHub account pays for all Copilot premium requests consumed by the agentic loop.

| Field | Value |
|-------|-------|
| Account | `HemSoft` |
| Plan | `individual_pro` (Copilot Pro) |
| SKU | `plus_yearly_subscriber_quota` (~$100/year) |
| Subscribed since | 2025-05-19 |
| Organizations | None — personal subscription |

## How It Works

1. The repo secret `COPILOT_GITHUB_TOKEN` contains a PAT from the HemSoft account
2. Every agentic workflow run authenticates the Copilot CLI with that token
3. Each premium-model call deducts from HemSoft's monthly premium request quota
4. GitHub Actions minutes are **free** (public repo = unlimited minutes)

## Premium Requests Quota (as of 2026-02-20)

| Metric | Value |
|--------|-------|
| Monthly entitlement | 1,500 |
| Used this cycle | ~1,340 |
| Remaining | ~160 (10.7%) |
| Overage permitted | Yes |
| Overage count | 0 |
| Quota resets | 2026-03-01 |

## Cost Breakdown

| Cost Type | Source | Amount |
|-----------|--------|--------|
| Copilot Pro subscription | HemSoft personal account | ~$100/year |
| Premium requests (included) | 1,500/month | $0 (included) |
| Premium requests (overage) | Pay-per-use if >1,500 | Variable |
| GitHub Actions minutes | Public repo | $0 (unlimited) |

## Burn Rate Concern

With 8 workflows running on cron schedules (every 30 minutes each), the loop consumes premium requests rapidly:

- **8 workflows × 48 runs/day = ~384 potential runs/day**
- Not all runs invoke the Copilot agent (many exit early via idempotency checks)
- Actual consumption depends on how many issues/PRs are active
- At the current pace (~1,340 used in ~20 days), average is **~67 premium requests/day**
- Overage is permitted, so requests won't be blocked — but may incur extra charges

## Recommendations

1. **Monitor quota** — Check remaining premium requests regularly via `gh api /copilot_internal/user`
2. **Consider Copilot Pro+** — $39/month gets more premium requests if overage becomes frequent
3. **Optimize workflows** — Early-exit logic (idempotency markers, claim-before-work) already reduces unnecessary agent invocations
4. **Build cost dashboard** — Tracked as a TODO item for real-time visibility

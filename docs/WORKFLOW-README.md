# Repository workflows

The per-repository Set it Free Loop deployment is retired under Franz's October 9,
2026 organization App decision. No auditor, dispatcher, analyzer, fixer, promoter,
repository audit or status workflow should be reinstalled or dispatched here.
Native Codex and ordinary CI remain; inspect `.github/workflows` on the default
branch for their actual definitions. Existing protections remain in force.

The central reviewer service is installed on mini, using the existing
organization-installed SFL App, with hs-buddy as its sole qualification target.
Consumer repositories need no SFL Actions workflow or SFL model/App secret. Read
the [pilot contract and recovery constraints](CENTRAL-SFL-PILOT.md),
[deployment status](SFL-ORGANIZATION-REVIEW.md) and
[SFL issue #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139) for
qualification evidence and the current pause state.

Do not use `deploy-workflow.ps1` or `gh sfl init`/`sync` to restore the retired
reviewer. Labels, credentials, consumer-owned records and historical governance
are retained; their presence does not mean autonomous processing is active.

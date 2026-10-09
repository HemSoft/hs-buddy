# Retired SFL workflow tools

The repository SFL deployment is retired under Franz's October 9, 2026 decision.
The former enablement, disablement, pause and resume entry points now stop before
any GitHub command. Their paths and prior implementations remain in Git history.
The two old verification scripts are historical diagnostics; their clean-slate
assumptions do not describe current ordinary CI or native Codex operation.

Do not enable or dispatch the deleted auditor, dispatcher, analyzers, fixer,
promoter, repository audit or status workflows. Labels and historical records are
retained and do not imply active automation. The generic admin enable helper now
accepts only the named ordinary CI, security, benchmark, Rust, lockfile and release
workflows in this repository, using HemSoft and the canonical organization path.

Use [current deployment status](../../docs/SFL-ORGANIZATION-REVIEW.md) and the
[central service runbook](https://github.com/hemsoft-dev/set-it-free-loop/blob/main/central-reviewer/README.md)
for the single-repository App pilot on mini. Broader activation and autonomous
workflows require a separate owner instruction.

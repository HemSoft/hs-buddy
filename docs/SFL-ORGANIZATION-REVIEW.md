# SFL deployment retired

The repository SFL workflows and installed manifest are being removed under Franz's October 9, 2026 organization App decision. This repository is the sole central reviewer pilot after setup. No installed central service or successful pilot is claimed by this preparation PR. Native Codex reviews and ordinary repository CI continue.

Do not use `gh sfl init`, `sync`, `review`, or `gate` to reinstall the retired observer. The replacement requires no consumer SFL workflow or SFL model/App secret. Existing credential values and unrelated integrations are preserved. The paused organization rollout is tracked in [SFL issue #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139). Broader activation waits for a separate owner instruction.

## Protection decision

Franz authorized retirement of the old SFL-only gate before workflow removal.
Ruleset 24718485, `Require SFL Reviewer Gate Runner`, is deleted. The effective
main-branch checks are `ci-complete` and `npm audit`; CodeQL high-or-higher and
review-thread resolution remain. The central App check is advisory during
qualification. No SFL publisher is required to merge a PR in this transition.
Unrelated ruleset details were verified unchanged before and after gate removal.

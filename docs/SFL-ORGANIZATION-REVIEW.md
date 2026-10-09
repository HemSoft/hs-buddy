# SFL deployment status

The repository SFL workflows and installed manifest are removed under Franz's October 9, 2026 organization App decision. The central service is installed on mini, with this repository as its sole qualification target. Read the [central pilot contract and recovery constraints](CENTRAL-SFL-PILOT.md). Qualification evidence, completion status and pause state are recorded in the linked issue. Native Codex reviews and ordinary repository CI continue.

Do not use `gh sfl init`, `sync`, `review`, or `gate` to reinstall the retired observer. The replacement requires no consumer SFL workflow or SFL model/App secret. Existing credential values and unrelated integrations are preserved. The paused organization rollout is tracked in [SFL issue #139](https://github.com/hemsoft-dev/set-it-free-loop/issues/139). Broader activation waits for a separate owner instruction.

## Protection decision

Franz authorized retirement of the old SFL-only gate before workflow removal.
Ruleset 24718485, `Require SFL Reviewer Gate Runner`, is deleted. The effective
main-branch checks are `ci-complete` and `npm audit`; CodeQL high-or-higher and
review-thread resolution remain. The central App check is advisory during
qualification. No SFL publisher is required to merge a PR in this transition.
Unrelated ruleset details were verified unchanged before and after gate removal.

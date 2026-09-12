# Lighthouse CI baseline

This gate measures the production renderer bundle through its browser-safe
entry point. It audits performance, accessibility, and best practices.

## Configuration and evidence

- Build with `VITE_CONVEX_URL=https://placeholder-lhci.convex.cloud` and
  `bunx vite build --mode e2e`.
- Run `bun run lhci`, then `bun scripts/lighthouse-report.ts`.
- Lighthouse CI serves `dist/` on an ephemeral localhost port and collects
  three runs. Each category uses the median of its three scores.
- The summary reads the filesystem upload's `manifest.json` and its actual
  `.report.json` filenames. It excludes old reports and raw collector copies.
- The identical Markdown is printed in the log, appended to the Actions step
  summary, and saved as `.lighthouseci/scores.md`.
- Missing or malformed reports produce a failure summary alongside any valid
  scores. The reporter exits with an error and omits the incomplete median.
  Exactly three readable reports are required, matching the collection count.
- CI uploads the hidden `.lighthouseci/` directory with `include-hidden-files`
  enabled and fails if the artifact is empty. Reports upload after failed
  assertions too. `ci-complete` requires the Lighthouse job.

## September 5 hosted baseline

The September 5 hosted jobs from runs `33995823862`, `33996320574`, and
`33996694683` completed three Lighthouse runs each and their warning assertions
passed. All three artifact uploads reported that no files were found. Those
runs cannot establish score variance because the measured reports were lost.

Fresh hosted evidence comes from [CI run 33997864280](https://github.com/HemSoft/hs-buddy/actions/runs/33997864280)
at `59e2c8da0a50306a14cf3e99b813987cab0eb51d`. Its three Lighthouse measurements
used the normal collection configuration. An impossible 101% performance
assertion deliberately failed after measurement to verify the blocking and
artifact paths. That assertion does not affect the measured scores.

Environment: GitHub-hosted Ubuntu, Node 24.12.0, Bun 1.3.7, Lighthouse CI 0.15.1,
Lighthouse 13.4.1, Headless Chrome 152, mobile emulation, simulated throttling.

| Run    | Performance | Accessibility | Best practices |
| ------ | ----------: | ------------: | -------------: |
| 1      |          71 |            92 |            100 |
| 2      |          97 |            92 |            100 |
| 3      |          97 |            92 |            100 |
| Median |          97 |            92 |            100 |
| Range  |       71-97 |         92-92 |        100-100 |

Performance varied by 26 points within this hosted job; the other categories
did not vary. This supports a three-run median and retaining the existing
60/80/80 floors rather than tightening them from the two faster samples.
The artifact contained 941,596 bytes. Its raw JSON reports reproduce every row
in `scores.md`, and the same rows appear in the job log and step summary.
The same run's `ci-complete` job failed with Lighthouse as its only failed
dependency; fast feedback, React Doctor, and memory qualification all passed.
The temporary probe was removed after that proof, restoring `bun run lhci`
with the maintained configuration.

## September 5 local comparison

The September 5 Windows sample on the #654 worktree measured:

| Run    | Performance | Accessibility | Best practices |
| ------ | ----------: | ------------: | -------------: |
| 1      |          97 |            92 |            100 |
| 2      |          97 |            92 |            100 |
| 3      |          97 |            92 |            100 |
| Median |          97 |            92 |            100 |
| Range  |       97-97 |         92-92 |        100-100 |

## September 12 accessibility correction

[CI run 34648350886](https://github.com/HemSoft/hs-buddy/actions/runs/34648350886)
reproduced a 92 accessibility score in all three reports. Each report identified
the same two failures: low contrast for the loading detail and idle sync status,
and no main landmark. The renderer now uses theme colors with at least 4.5:1
contrast and places its content in exactly one `<main>` element.

The correction was then measured on the hosted Ubuntu runner in
[CI run 34688435275](https://github.com/HemSoft/hs-buddy/actions/runs/34688435275)
at head `43044c8dcc982ca933ecff85def7ff58165b028e`. Its retained
`lighthouse-results` artifact produced:

| Run    | Performance | Accessibility | Best practices | Contrast | Main landmark |
| ------ | ----------: | ------------: | -------------: | -------: | ------------: |
| 1      |          83 |           100 |            100 |      100 |           100 |
| 2      |          97 |           100 |            100 |      100 |           100 |
| 3      |          97 |           100 |            100 |      100 |           100 |
| Median |          97 |           100 |            100 |      100 |           100 |
| Min    |          83 |           100 |            100 |      100 |           100 |
| Max    |          97 |           100 |            100 |      100 |           100 |

These hosted results confirm the accessibility floor and both deterministic
audits. A separate local Windows measurement produced 97/100/100 in all three
runs; it is supporting evidence only and is not mixed into the hosted baseline.

## Threshold policy

The maintained minimum scores are 60 for performance, 100 for accessibility,
and 80 for best practices. `color-contrast` and `landmark-one-main` also have
explicit error assertions. Median aggregation remains in place for category
scores, while the two deterministic audits must pass every collected report.
No performance or best-practices threshold changed.

## Refresh procedure

1. Collect three runs on a clean hosted Ubuntu runner with the same Node, Bun,
   browser, build mode, and Lighthouse configuration as CI.
2. Download `lighthouse-results` and retain its workflow run URL and head SHA.
3. Record each category's individual scores, median, minimum, and maximum.
   Compare several hosted jobs when changing a threshold, and note local versus
   hosted differences rather than mixing the populations.
4. Confirm `.lighthouseci/scores.md` matches both the raw reports and the job
   log. Update this document with measured values and the reason for any
   threshold change. Do not lower a threshold solely to make a failing PR pass.
5. Verify a controlled threshold failure is rejected, then restore the maintained
   thresholds and require a passing normal CI run before merge.

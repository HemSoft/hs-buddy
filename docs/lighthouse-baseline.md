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
- CI uploads the hidden `.lighthouseci/` directory with `include-hidden-files`
  enabled and fails if the artifact is empty. Reports upload after failed
  assertions too. `ci-complete` requires the Lighthouse job.

## Baseline refresh in progress

The September 5 hosted jobs from runs `33995823862`, `33996320574`, and
`33996694683` completed three Lighthouse runs each and their warning assertions
passed. All three artifact uploads reported that no files were found. Those
runs cannot establish score variance because the measured reports were lost.
Fresh hosted samples are being captured by the #654 pull request before merge.

The September 5 Windows sample on the #654 worktree measured:

| Run | Performance | Accessibility | Best practices |
| --- | ---: | ---: | ---: |
| 1 | 97 | 92 | 100 |
| 2 | 97 | 92 | 100 |
| 3 | 97 | 92 | 100 |
| Median | 97 | 92 | 100 |
| Range | 97-97 | 92-92 | 100-100 |

## Threshold policy

The maintained minimum scores are 60 for performance, 80 for accessibility,
and 80 for best practices. All three assertions are errors. Explicit median
aggregation prevents one unusually fast run from masking a regression and
reduces sensitivity to one unusually slow run. No threshold was lowered for
this change.

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

# Lighthouse CI Baseline

This baseline captures the Electron renderer route that Lighthouse CI audits
through the browser-safe Vite entry point.

## Configuration

- Command: `bun run lhci`
- Server: `node ./node_modules/vite/bin/vite.js --mode e2e --host 127.0.0.1 --port 9222 --strictPort`
- Readiness pattern: `ready in`
- URL: `http://127.0.0.1:9222/`
- Reports: `.lighthouseci/` filesystem upload target

`127.0.0.1` and `--strictPort` keep the audited URL deterministic. The
`ready in` pattern avoids matching Vite's ANSI-styled `Local:` label, which can
split the text that LHCI receives on Windows.

## Baseline Run

Captured on 2026-06-08 on Windows with `VITE_CONVEX_URL` set to the LHCI
placeholder Convex URL.

| Run | URL | Performance | Accessibility | Best Practices |
| --- | --- | ---: | ---: | ---: |
| 1 | `http://127.0.0.1:9222/` | 48 | 85 | 100 |
| 2 | `http://127.0.0.1:9222/` | 49 | 85 | 100 |
| 3 | `http://127.0.0.1:9222/` | 49 | 85 | 100 |
| Average | `http://127.0.0.1:9222/` | 49 | 85 | 100 |

## Threshold Policy

Current assertions are intentionally warnings:

- Performance: warn below 60
- Accessibility: warn below 80
- Best Practices: warn below 80

Keep these informational until the baseline stabilizes across local Windows and
GitHub-hosted Ubuntu runs.

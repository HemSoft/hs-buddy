# Lighthouse CI Baseline

This baseline captures the production Electron renderer bundle through its
browser-safe entry point.

## Configuration

- Build: `npx vite build --mode e2e`
- Command: `bun run lhci`
- Static directory: `dist/`
- URL: `http://localhost/` (served on an ephemeral port by Lighthouse CI)
- Reports: `.lighthouseci/` filesystem upload target

The renderer build preserves source execution order across its custom split
chunks. This keeps CommonJS interop initialization deterministic while retaining
the repository's bundle-size strategy.

## Baseline Run

Captured on 2026-08-02 on Windows with `VITE_CONVEX_URL` set to the LHCI
placeholder Convex URL.

| Run     | URL                 | Performance | Accessibility | Best Practices |
| ------- | ------------------- | ----------: | ------------: | -------------: |
| 1       | `http://localhost/` |          64 |            94 |            100 |
| 2       | `http://localhost/` |          61 |            94 |            100 |
| 3       | `http://localhost/` |          63 |            94 |            100 |
| Average | `http://localhost/` |          63 |            94 |            100 |

## Threshold Policy

Current assertions are intentionally warnings:

- Performance: warn below 60
- Accessibility: warn below 80
- Best Practices: warn below 80

Keep these informational until the baseline stabilizes across local Windows and
GitHub-hosted Ubuntu runs.

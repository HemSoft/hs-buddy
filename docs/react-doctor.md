# React Doctor

React Doctor runs as a source health check for TypeScript, React, workflow, and
repository hygiene findings.

Generated output directories are excluded from `doctor.config.json` because they
are build or coverage artifacts, not maintainable source. The gh-aw
`.github/workflows/*.lock.yml` files are also generated; their source files are
the neighboring `.md` workflow definitions. React Doctor's
`build-pipeline-secret-boundary` rule is ignored only for those generated lock
files so findings must be fixed in workflow sources or in hand-maintained YAML.

For deterministic local audits, `scripts/run-react-doctor.ps1 -ScoreOnly` runs
the pinned React Doctor CLI and derives `Score 100/100` from a zero-diagnostic
JSON report instead of depending on the external React Doctor score API.

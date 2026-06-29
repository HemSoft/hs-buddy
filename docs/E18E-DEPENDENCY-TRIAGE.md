# e18e Dependency Triage

`bun run e18e` is a direct-dependency gate. It must fail for package metadata
errors or new duplicate warnings rooted in this package, but it should not block
on broad transitive duplication that this app cannot safely flatten directly.

## Current direct exceptions

These root packages intentionally remain different from some transitive
versions reported by e18e:

- `@types/node`: the app targets Node 22, so the root type package stays on the
  Node 22 line even though Electron and other tooling bring Node 24 types.
- `esbuild`: the app keeps a root `esbuild` for Vite/react-scan peer coverage,
  while Convex currently pins its own older `esbuild` release.
- `typescript`: the app uses TypeScript 6, while `eslint-plugin-sonarjs` still
  carries a TypeScript 5 transitive dependency.
- `vscode-jsonrpc`: the app uses v9 directly, while `@github/copilot-sdk`
  currently carries v8 transitively.

## Current transitive-only warning families

The remaining duplicate warnings are owned by upstream toolchains such as
Electron, Vite/Rolldown, ESLint, Lighthouse, markdown tooling, and test tooling.
They should be reduced through safe upstream package updates, not root-level
overrides that can create incompatible package trees.

## Maintenance rule

When e18e reports a new duplicate warning containing `root@`, either update the
direct dependency to eliminate it or add a short justification above. Do not
silence package metadata errors.

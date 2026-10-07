# GPUI Rewrite Plan — Phase 1: Dashboard

**Status**: Phases 0–3 implemented; Phase 4 CI workflow added, packaging pending
**Created**: 2026-10-07
**Updated**: 2026-10-07
**Scope of this phase**: a native Rust app that opens a frameless window and
renders the main dashboard page (today's `WelcomePanel`) with live data.

## Why

Buddy today is Electron 44 + React 19 with a Node main process and a Convex
backend. The rewrite moves the desktop shell to Rust on
[GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) (Zed's
GPU-first UI framework) using
[GPUI Kit / gpui-component](https://github.com/longbridge/gpui-component) for
styled widgets. Expected wins: one native binary per platform, much lower
memory than Chromium, 120 fps rendering, and no preload/IPC boundary.

> Note on the CodexBar reference: steipete's CodexBar release notes through
> v0.72.0 (2026-10-04) still describe a Swift app. steipete does maintain a
> fork of gpui-kit, so the direction is the same, but there is no published
> CodexBar GPUI codebase to copy structure from. This plan stands on its own.

## Guiding constraints

- **Electron stays until parity.** The Rust app is a parallel track. Nothing in
  `src/`, `electron/`, or `convex/` is deleted in this phase.
- **Convex remains the backend.** The official `convex` Rust crate (0.10.x)
  supports queries, mutations, and live subscriptions as a `futures::Stream`.
- **Reuse the existing config file.** Electron-store writes
  `~/.config/hs-buddy/config.json` (Linux), `%APPDATA%\hs-buddy\config.json`,
  `~/Library/Application Support/hs-buddy/config.json`. The Rust app reads the
  same file with `serde` so both apps agree on theme, accounts, dashboard card
  visibility, and the finance watchlist during the transition.
- **Pin exact versions.** gpui-kit pins `gpui-pre = "=0.3.8"` (weekly Zed
  snapshots with API churn). We pin `gpui-kit = "=0.7.1"` and bump deliberately.
- **Simplicity over complexity** (see GOAL-AND-GUIDING-PRINCIPLES). Port logic,
  not React structure. Each dashboard card is one Rust module with a plain data
  struct, a fetcher, and a render function.

## Target stack

| Concern | Choice | Notes |
| --- | --- | --- |
| UI framework | `gpui-kit = "=0.7.1"` | Re-exports gpui, gpui-base, gpui-component, default assets |
| Async runtime | GPUI executor for UI, Tokio runtime on a dedicated thread for I/O | `convex` and `reqwest` require Tokio; bridge with channels |
| HTTP | `reqwest` (rustls) | Open-Meteo, Nominatim, Google Pollen, Yahoo Finance |
| Backend | `convex = "0.10"` | `buddyStats:get`, `repoBookmarks:list` subscriptions |
| GitHub | shell out to `gh api` via `tokio::process` | Mirrors `electron/ipc/githubHandlers.ts`; no token handling in-app |
| Config | `serde_json` over electron-store's `config.json` | Read-only at first, then read-write |
| Secrets | `keyring` crate | Replaces Electron `safeStorage` for the remembered weather location |
| Icons | Lucide SVGs via gpui-component `Icon` | Same icon set as today |
| Errors | `thiserror` + `anyhow` | |

## Repository layout

```text
rust/
  Cargo.toml              # workspace, [workspace.dependencies] with exact pins
  rust-toolchain.toml     # pin stable channel
  crates/
    buddy-core/           # no UI: config, models, providers, parsers, tests
      src/config.rs       # AppConfig mirror of src/types/config.ts
      src/providers/      # finance.rs, weather.rs, pollen.rs, copilot_usage.rs, convex.rs
      src/parsers/        # ports of billingParsers.ts, quotaUtils.ts, financeCalc.ts
    buddy-app/            # GPUI binary
      src/main.rs
      src/shell/          # title_bar.rs, activity_bar.rs, tab_bar.rs, status_bar.rs
      src/theme.rs        # CSS variables -> gpui-component Theme
      src/dashboard/      # mod.rs, header.rs, primitives.rs, cards/{command_center,workspace_pulse,weather,finance}.rs
      src/runtime.rs      # Tokio thread + channel bridge
```

A separate `rust/` directory keeps knip, e18e, ESLint, and the bundle-size
gates untouched. CI gains one `rust` job (fmt, clippy, test, build).

## Phases

### Phase 0 — Environment (half a day)

This machine currently has no `cargo`, and the Linux GPUI build prerequisites
are missing. Install and verify before writing app code.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt install -y build-essential cmake clang pkg-config mold \
  libxkbcommon-dev libxkbcommon-x11-dev libwayland-dev libvulkan-dev \
  libxcb1-dev libxcb-xkb-dev libfontconfig1-dev libasound2-dev \
  libssl-dev libdbus-1-dev vulkan-tools
vulkaninfo --summary   # GPUI on Linux renders through Vulkan
```

Headless verification (no desktop session) works with `Xvfb` plus the Mesa
`llvmpipe` Vulkan driver; screenshots via `xwd | convert`. `libdbus-1-dev` is
for the `keyring` crate's Secret Service backend.

Exit criterion: `cargo run -p hello_world` from a gpui-component checkout opens
a window on this box. If Vulkan is unavailable, evaluate gpui-kit's
`gpui-fast` (wgpu) feature before continuing.

### Phase 1 — Workspace and app shell (1–2 days)

1. Create the `rust/` workspace and both crates.
2. `buddy-core::config`: `AppConfig` struct mirroring `src/types/config.ts`
   with serde defaults matching `defaultConfig`. Unit-test against a fixture
   copied from a real `config.json`.
3. `buddy-app::theme`: build a gpui-component `Theme` from the CSS variables in
   `src/index.css` (dark and light), then overlay the user's `ui.accentColor`,
   `ui.bgPrimary`, `ui.bgSecondary`, `ui.fontColor`, `ui.statusBarBg`,
   `ui.statusBarFg`, `ui.fontFamily`. Port `lightenColor` for hover/heading.
4. Frameless window with gpui-component's `TitleBar`: app icon, title, the
   File/Edit/View/Help menus as a popover menu (frameless rule from AGENTS.md
   carries over), window controls.
5. Static `ActivityBar` with the eleven sections from `ActivityBar.tsx`, only
   the dashboard reachable. `TabBar` with a single pinned Dashboard tab.
   `StatusBar` rendering account name and a static clock.
6. Window geometry persistence to `ui.displayBounds` (read first, write later).

Exit criterion: shell renders with the user's saved theme; no data yet.

### Phase 2 — Dashboard layout with fixture data (2 days)

Port `WelcomePanel.tsx` and `src/components/dashboard/*` one to one:

| React | Rust |
| --- | --- |
| `SectionHeading` | `primitives::section_heading(kicker, title, caption)` |
| `StatCard` | `primitives::stat_card(icon, value, label, subtitle, accent)` |
| `CardHeader` (collapse) | `primitives::card_header(expanded, on_toggle)` |
| `CardActionBar` | `primitives::card_action_bar(refresh, interval, labels)` |
| `WelcomeHeader` + uptime badge + `DashboardConfigDropdown` | `header.rs` (uptime ticks via `cx.spawn` 1 s timer) |
| `dashboard-grid` (2 columns, span 2) | `v_flex` of rows; span-2 cards take a full row, span-1 cards pair up |
| `QuickActionsBar`, `WelcomeFooter` | `dashboard/mod.rs` |

Cards: Command Center (span 2), Workspace Pulse, Weather, Finance. Each card
takes a plain struct and renders; data is hard-coded fixtures in this phase.
Card visibility and the Customize popover read/write `ui.dashboardCards`.
Collapse state per card lives in app state (today it is `localStorage`).

Exit criterion: side-by-side screenshot matches the Electron dashboard at
1200 px width in both themes.

### Phase 3 — Live data, easiest first (3–5 days)

Each provider is a `buddy-core` function returning `Result<T, ProviderError>`,
run on the Tokio thread, result delivered to the GPUI entity via channel, then
`cx.notify()`.

1. **Finance.** Port `financeCalc.ts` (`normalizeSymbol`, `isValidSymbol`,
   `buildYahooFinanceUrl`, `parseChartResponse`). Watchlist from
   `finance.watchlist`. Auto-refresh default 15 min.
2. **Weather.** Port `useWeather.ts`: Open-Meteo forecast URL, WMO code to
   description and icon table, Nominatim reverse/forward geocoding, default
   location Morrisville NC. Saved location via `keyring` (Electron's
   `safeStorage` ciphertext is not portable, so the first run falls back to the
   default and asks the user to search again). 30 min auto-refresh.
3. **Pollen.** Port `pollenHandlers.ts`: Google Pollen `forecast:lookup`, key
   from `ui.pollenApiKey`, species grouping by TREE/GRASS/WEED.
4. **Workspace Pulse.** `convex` client subscribed to `buddyStats:get` and
   `repoBookmarks:list`. Derived values (`totalPrsViewed`, success rate,
   member-since) ported from `WelcomePanel.tsx`. Convex URL from
   `VITE_CONVEX_URL` or the hard-coded default in `electron/config.ts`.
   Read-only in this phase: no session start/end mutations yet, so the uptime
   badge shows stored uptime plus local session time.
5. **Command Center.** Port `billingParsers.ts` and `quotaUtils.ts`
   (`computeProjection`, `computeBudgetProjection`, `synthesizeQuotaData`,
   `OVERAGE_COST_PER_CREDIT`), then the org billing fetch from
   `githubHandlers.ts` via `gh api /orgs/{org}/settings/billing/usage` with the
   user→org fallback. Accounts from `github.accounts`, skipping
   `usageProvider == "codex"`. Dedupe by org as the hook does.

Exit criterion: all four cards show the same numbers as the Electron app on
the same machine.

### Phase 4 — Quality gates and packaging (1 day)

- `rust/` CI job: `cargo fmt --check`, `cargo clippy --all-targets -D warnings`,
  `cargo test`, `cargo build --release` on ubuntu/windows/macos runners.
- Unit tests for every ported parser (billing, quota, finance, WMO codes,
  pollen) using the same fixtures the Vitest suites use.
- `cargo-deny` for licenses and advisories, parallel to Dependabot.
- Release artifacts: single binary per platform, no installer yet.

## Async model (so every card works the same way)

```text
UI thread (GPUI)                      Tokio thread
----------------                      ------------
DashboardView holds Entity<CardState>
  on refresh -> send Request over mpsc  --->  provider::fetch(...).await
  cx.spawn(async move {                 <---  reply over oneshot
      let data = rx.await;
      this.update(cx, |s, cx| { s.data = data; cx.notify(); })
  })
```

One `Runtime` struct owns the Tokio handle and the `convex::ConvexClient`.
Convex subscriptions are long-lived streams forwarded into GPUI with the same
channel pattern.

## Out of scope for this phase

Convex writes, Copilot SDK, terminal (`node-pty`), in-app browser webview,
PR views, automation workers, Ralph, Crew, Tempo, Todoist, OpenTelemetry to
Aspire, settings UI. Each gets its own plan once the shell is proven.

## Decisions (confirmed 2026-10-07)

1. **Location of Rust code**: `rust/` inside this repo.
2. **Config ownership**: shared `config.json` during the transition. The native
   app looks for `Buddy/`, then `hs-buddy/`, then `@hemsoft/buddy/` under the
   platform config root, and `BUDDY_CONFIG_PATH` overrides all of them.
3. **GitHub access**: shell out to `gh` (`gh auth token --user`, `gh api`).
4. **Weather location secret**: `keyring` crate (Keychain, Credential Manager,
   Secret Service). A failed keychain write keeps the location for the session.
5. **Vulkan on the Linux dev box**: the AMD RADV driver exists but the render
   node is group-restricted for this shell, so verification ran on `llvmpipe`.

## Implementation notes

- "Use My Location" has no native equivalent of the browser geolocation API;
  the native app approximates from the public IP (`ipapi.co`) and then reverse
  geocodes with Nominatim, matching the Electron naming.
- Convex numbers export as JSON floats; `BuddyStats::from_json` rounds them.
- The dashboard view is read-only against Convex (no session start/end
  mutations yet), so the uptime badge shows stored uptime plus the Convex
  `lastSessionStart` delta when present, else the local session.
- Fonts: Inter and Cascadia Code are applied only when installed; otherwise
  the system font is used. Bundling both as assets is a follow-up.
- **Open item: Convex deployment URL.** The default
  `https://balanced-trout-451.convex.cloud` from `electron/config.ts` answers
  like a nonexistent deployment (HTTP 404 on `/api/query`, WebSocket closed on
  connect), and no `.env.local` exists on the Linux dev box. Set
  `BUDDY_CONVEX_URL` (or `VITE_CONVEX_URL`) to the real deployment; the
  Workspace Pulse card shows the connection status until data arrives.
  Diagnostic: `cargo test -p buddy-core convex_live -- --ignored --nocapture`.
- Verified live on 2026-10-07: Open-Meteo weather and forecast, Yahoo quotes
  for the default watchlist, `gh`-based Copilot path (no accounts configured
  on this machine, so the card shows its empty state).

## Risks

- **GPUI API churn.** gpui-kit tracks weekly Zed snapshots. Mitigation: exact
  pins, upgrade on a branch, read the gpui-component changelog each bump.
- **Linux rendering.** GPUI needs Vulkan (or the wgpu feature). Verify first.
- **Yahoo and Google endpoints are unofficial or keyed.** Same exposure as the
  Electron app today; parsers stay tolerant and cards degrade to error text.
- **Two apps writing one config file.** Phase 1–2 are read-only except
  `ui.dashboardCards`; electron-store watches the file and reloads.

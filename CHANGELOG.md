# Changelog

All notable changes to the FSB product (Chrome extension + showcase dashboard) are documented in this file. Entries are organized by FSB milestone. The extension version is `0.9.91`; milestone versions such as `v0.11.0` and `v0.12.0` are the meaningful release units.

The `fsb-mcp-server` npm package keeps its own semver changelog in [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).

## [Unreleased]

Nothing yet.

## v0.9.91 — Version Metadata Alignment — 2026-07-14

The extension, showcase, skill, documentation, and store metadata align at `0.9.91`. The independently versioned `fsb-mcp-server` advances to `0.11.0` for the `mcp:task-status` terminal task-outcome contract; see [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md) for its package-specific release notes and compatibility requirements.

## v0.9.90 — Native Capability Catalog, Trigger Watchers, Control Panel Redesign & Onboarding — 2026-07-06

FSB v0.9.90 is the first stable release since v0.9.72. It turns FSB from a browser-driving extension into a **native capability platform**: a verified first-party API catalog that agents can invoke directly, reactive DOM **trigger watchers**, real **file uploads**, a fully **redesigned control panel**, and a **first-run onboarding** flow. Under the hood it folds in three milestone units shipped on the automation branch: v0.10.0 (Autopilot via Lattice), v0.11.0 (Trigger Watchers), and v0.12.0 (PhantomStream package migration), plus the v1.1.0 T1 execution milestone. MCP server moves to v0.10.0.

Versions: **Extension 0.9.90** · **fsb-mcp-server 0.10.0** · compared against **v0.9.72**.

<img width="1480" height="698" alt="Screenshot 2026-07-04 at 16 28 33" src="https://github.com/user-attachments/assets/b49e3ec3-eb96-4ebc-adf4-2749e511c90a" />

### Native Capability Catalog (direct first-party API execution)

FSB can now call verified first-party APIs directly instead of only driving the page, exposed through two MCP tools that keep the surface tiny:

- **`search_capabilities`** ranks up to 5 matching capabilities with a readiness label, and **`invoke_capability`** runs one. Both live on the MCP runtime surface but stay out of the per-app tool registry, so there is no tool proliferation.
- **~150 new first-party service handlers** across the catalog: AWS, Azure, Stripe, Coinbase, Notion, Slack, ClickUp, Asana, Retool, Confluence, GitLab, Bitbucket, Netlify, Vercel, Jira, Linear, Twitch, Shopify, and many more.
- Of **2,314 catalog descriptors**, **1,874 are T1-ready** (directly invocable, handler- or recipe-backed) and **564 remain guarded fail-closed** pending live write-UAT. A CI gate (`validate:extension`) fails the build if any descriptor is marked T1-ready without handler/recipe proof and passing tests.
- **Readiness honesty:** unverified first-party writes (e.g. GitHub issue creation, Slack without a token) fail closed with `RECIPE_DOM_FALLBACK_PENDING` so agents continue through DOM automation instead of falsely reporting success.

### Trigger Watchers (reactive DOM monitoring)

A new MCP tool family lets an agent watch one element and be notified when a condition is met, with no server-side polling:

- **`trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`.** Arm a selector plus a condition (`changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, or compound AND/OR).
- **Two modes:** `live-observe` (in-page mutation observer, no reload) and `refresh-poll` (background reload, coalesced per tab).
- **Blocking or detached:** blocks up to 120s with 30s progress heartbeats, or returns a `trigger_id` immediately with `detached: true`; a 240s safety ceiling auto-detaches.
- Watches survive MV3 service-worker eviction and persist across navigation; a configurable `fsbTriggerCap` (default 8, range 1 to 64) bounds concurrency. Local and notify-only, with no server monitoring or external push.

### upload_file

- **`upload_file(selector, file_path, tab_id?)`** drives real `<input type=file>` elements and styled dropzones, with absolute-path validation and a sensitive-path denylist. It joins the action-tool contract (carries the `visual_reason` / `client` field bundle).

### Control Panel redesign

The control panel was restyled end to end for a more compact, modern feel:

- **Icon-rail sidebar** (80px) with hover-reveal pill labels, permanently docked, replacing the old 252px text sidebar and mobile hamburger.
- **Stepper controls** (+/− with inline validation) replace sliders/number inputs for Max Iterations, element limits, and the concurrency caps.
- **Agent Concurrency Cap** and a new **Trigger Concurrency Cap** (each 1 to 64, "Reset to recommended," live "N of 8 active" counter).
- **Theme** segmented control (System / Dark / Light) replaces the header moon toggle.
- **Searchable model picker** (type-to-filter combobox) replaces the plain `<select>`.
- **Consolidated Memory** section (formerly "FSB Intelligence"): the 3D knowledge-graph viewer gained a broader category set and a link to the community **Site Maps** page.
- Settings are grouped under labeled subsections (Appearance, Execution & Limits, Automation Behavior, Privacy & Developer); new Poppins / Space Mono typography.

<img width="1488" height="877" alt="Screenshot 2026-07-04 at 16 30 48" src="https://github.com/user-attachments/assets/35ce56cb-9109-45fb-82e7-48dd34c69113" />
<img width="1489" height="876" alt="Screenshot 2026-07-04 at 16 31 32" src="https://github.com/user-attachments/assets/e5bfa087-c4ca-4c2c-98e7-99883e074d9c" />

### Consent & Audit

- New **Consent & Audit** section: a global **Default for New Sites** posture (Off / Ask / Auto) plus **Per-Origin Consent** overrides listing every site FSB has acted on, each with its own Off/Ask/Auto control and sensitivity/blocked badges.

### First-run onboarding

A brand-new guided setup on first install:

- **Welcome → Pick your path → path-specific setup → Pin FSB → Done.**
- **Agent (MCP) path:** copyable install command with a client picker (Claude Code, Cursor, VS Code, Windsurf, and more) and a link to set up OpenClaw.
- **In-browser (BYOK) path:** provider picker (xAI Grok, Anthropic, OpenAI, Google Gemini, OpenRouter, LM Studio) and API-key entry with format validation.
- Dark/light-aware design with a step-progress bar; every step is skippable.

<img width="1488" height="880" alt="Screenshot 2026-07-04 at 16 32 27" src="https://github.com/user-attachments/assets/b6a022ee-9cdb-48ae-bf3b-2f5d8ca6256e" />
<img width="1492" height="884" alt="Screenshot 2026-07-04 at 16 32 40" src="https://github.com/user-attachments/assets/b2bbca77-c12b-4827-90f0-35e83b886506" />
<img width="1490" height="879" alt="Screenshot 2026-07-04 at 16 32 53" src="https://github.com/user-attachments/assets/43f3d905-f837-4409-95b0-9d327e604cb0" />

### Autopilot (Lattice) & PhantomStream

- **Autopilot on the Lattice SDK (v0.10.0):** the agent runtime, providers, and MV3 survivability run on the public Lattice SDK, loaded in the service worker with secret redaction in serialization.
- **PhantomStream package migration (v0.12.0):** dashboard DOM live-preview delegates generic capture/renderer/protocol/relay/compression/sanitizer to the pinned `@full-self-browsing/phantom-stream` package, with 0.2.1 reference-mode media mirroring for progressive video/audio. No user-facing dashboard change.

### Showcase website

- **New pages**: Lattice, PhantomStream, Prometheus, and Sitemaps, plus an interactive **knowledge-graph viewer**.
- **Redesigned /stats page** with a 3D globe region visualization, and a new **/legal** governance page documenting the consent model and audit-log posture (routes split into prerender vs client render-modes).
- **/privacy region disclosure**, IP-geo aggregation with no-IP-leak hardening, and full i18n (en/es/de/ja/zh-CN/zh-TW) with the SEO/hreflang and bundle-budget CI gates.

<img width="1488" height="885" alt="Screenshot 2026-07-04 at 16 34 10" src="https://github.com/user-attachments/assets/106b1a8c-de47-4eaf-a36a-8297f6b51d85" />

### Repo / infrastructure

- Large `graphify-out` knowledge-graph outputs (`graph.json`, `manifest.json`) are now tracked via **Git LFS** to stay under GitHub's file-size limits.

### Platform & reliability

- **MCP restricted-tab fix:** read tools gate on the caller's resolved target tab, not Chrome's OS-active tab, preventing cross-tab false blocks.
- **Service-worker eviction recovery** matches all bridge-disconnect strings.
- **KeyboardEmulator self-healing** debugger attach; six cross-subsystem runtime correctness fixes (catalog / trigger / audit / MCP).
- **CI on Node 20:** browser-oriented plugin slices no longer crash the importer/gate under CI's Node 20 (`WebSocket` stub); large graphify outputs moved to Git LFS; i18n catalog regenerated to match templates. All four CI jobs (extension, mcp, showcase, all-green) pass.

### Upgrade notes

- **MCP reverse-DNS rename.** The server's reverse-DNS name changed from `io.github.lakshmanturlapati/fsb-mcp-server` to `io.github.fullselfbrowsing/fsb-mcp-server` (GitHub org transfer). The **npm package name `fsb-mcp-server` is unchanged**, so `npx -y fsb-mcp-server` keeps working. Clients that pin the reverse-DNS key in their MCP config must update it.
- **No other breaking changes.** All new handlers and MCP tools are additive.

### Install

- **Extension:** load the packaged `fsb-extension-v0.9.90.zip` unpacked via `chrome://extensions` (Developer mode → Load unpacked), or update from the Chrome Web Store once it rolls.
- **MCP server:**
  ```bash
  npx -y fsb-mcp-server@0.10.0
  # or
  npm i -g fsb-mcp-server@0.10.0
  ```

### Verification

- CI green on `automation` (extension · mcp · showcase · all-green).
- `npm run validate:extension`, full `npm test`, and the Angular showcase build all pass locally, including under a simulated Node 20 runtime.

### Fixed

- **`list_triggers` status filter accepts the full persisted set.** The optional `status` enum now allows `armed`, `needs_attention`, `blocked`, `fired`, `timed_out`, and `stopped`; `needs_attention` and `timed_out` were previously rejected at the schema gate. Kept in parity between the extension and MCP tool definitions. (`1d23c56c`)
- **Background-tab automation errors route to their owning tab only.** A session failing in a background tab now clears that tab's per-tab running state without disturbing the active tab's UI, matching the `automationComplete` routing contract. (`ace4528b`)

## v0.12.0 — PhantomStream Package Migration — 2026-06-17

Migrates FSB's dashboard DOM live-preview from FSB-owned generic stream engines to the pinned, published `@full-self-browsing/phantom-stream@0.1.0` package.

### Added / Changed

- **PhantomStream powers generic DOM mirroring.** The extension, server relay, and the static and Angular dashboards delegate generic capture (snapshot/mutation/session/scroll), renderer assembly, protocol envelopes, relay classification, compression, stale-frame detection, and sanitizer behavior to PhantomStream-backed seams. The package is pinned by exact version and `package-lock` integrity.
- **FSB keeps its product-specific adapters.** Capture maps to FSB background actions with overlay/dialog/scroll side channels and readiness pings (`content/dom-stream.js`); a shared `window.FSBPhantomStreamViewer` wrapper serves both dashboards; the WebSocket bridge preserves FSB task/status traffic, hash-key rooms, tab ownership, and debugger-contention reporting while accepting PhantomStream stream/control and remote-control frames.
- **No user-facing change.** MCP tool schemas, dashboard task/status WebSocket traffic, pairing, auth, model/provider behavior, and the dashboard's visual design are unchanged. The migration is internal.
- **Deterministic parity coverage.** Legacy `data-fsb-nid` stamping was removed in favor of differential parity tests; PhantomStream package, protocol, capture, renderer, relay, security, dashboard, and recovery paths are gated by the root `npm test` suite.

### Deferred (user-gated)

- Live-browser UAT for dashboard preview fidelity, navigation/reconnect recovery, restricted tabs, large pages, security masking, and remote-control usability remains `human_needed` (automated protocol and source-contract tests pass).

## v0.11.0 — Trigger Tool (Reactive DOM Monitoring) — 2026-06-17

Adds reactive DOM monitoring: an agent arms a watch on one element and is notified when a condition is met, without server-side polling.

### Added

- **Trigger tool family.** `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` arm and manage one-element watches in the caller's owned tab. Watches survive MV3 service-worker eviction and persist across tab navigation.
- **Two watch modes.** `live-observe` uses an in-page mutation observer with pulse feedback and no reload; `refresh-poll` reloads the owned tab in the background and coalesces same-tab due watches into a single reload.
- **Rich conditions.** `changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, and compound AND/OR; numeric and percent conditions use hysteresis to avoid repeated fires on the same edge. Text, number, and attribute extraction is supported.
- **Blocking or detached.** `trigger` blocks up to 120s by default with 30s progress heartbeats; `detached:true` returns immediately with a `trigger_id` to poll later. A 240s safety ceiling auto-detaches.
- **Concurrency cap.** A configurable `fsbTriggerCap` (default 8, range 1–64) limits active watches; armed and attention states (`needs_attention`, `blocked`) count toward the cap, terminal states (`fired`, `timed_out`, `stopped`) do not.
- **Local, session-bound, notify-only.** Triggers run in the open browser with no server-side monitoring and no desktop/email/SMS/Slack push or auto-act workflows; the caller decides any follow-up.

### Deferred (user-gated)

- Live-browser composed trigger UAT (multiple interacting watches on real pages) and publish/tag/release actions.

## v0.10.0 — Autopilot via Lattice SDK — 2026-06-15

Shipped 2026-06-15: FSB's agent runtime, providers, and MV3 survivability moved onto the public Lattice SDK. See the `v0.10.0` git tag for detail; MCP-specific history is in [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).

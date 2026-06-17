# PhantomStream Package Research

**Date:** 2026-06-17
**Scope:** v0.12.0 milestone intake for replacing FSB's in-house DOM stream/dashboard preview implementation with the extracted PhantomStream package.

## Upstream Facts

- Repository: https://github.com/fullselfbrowsing/PhantomStream
- Package name declared in upstream `package.json`: `@fullselfbrowsing/phantom-stream`
- Declared version in upstream `package.json`: `0.1.0`
- Declared module type: ESM
- Declared exports in upstream `package.json`: `./protocol`, `./capture`, `./renderer`
- Upstream README describes additional intended surfaces: relay, WebSocket transport, Playwright/CDP adapter, demos, reference parity tests, and security docs.
- npm registry check on 2026-06-17 returned `E404 Not Found` for `@fullselfbrowsing/phantom-stream`, despite README install guidance.

## Integration Implication

This milestone must start with a package-intake gate before replacing production code:

1. Prefer consuming a published npm package with exact version, lockfile integrity, and provenance recorded.
2. If the package is not published, block implementation until publication or an explicit decision authorizes a temporary GitHub/tarball pin.
3. Do not replace FSB's working in-house stream until capture, renderer, relay/transport, side channels, remote control, and security behavior are parity-tested against the current implementation.

## Existing FSB Surfaces To Replace

- Capture/content: `extension/content/dom-stream.js`
- Extension routing/transport glue: `extension/ws/ws-client.js`, `extension/background.js`
- Relay: `showcase/server/src/ws/handler.js`
- Static dashboard viewer: `showcase/js/dashboard.js`, `showcase/css/dashboard.css`, `showcase/dashboard.html`
- Angular dashboard viewer: `showcase/angular/src/app/pages/dashboard/dashboard-page.component.*`
- Tests: dashboard stream readiness/pending-intent/runtime-state, DOM stream perf, server backpressure, remote-control handlers, and Angular parity/source-contract tests.

## Key Risks

- Upstream package surface is not yet registry-installable as of 2026-06-17.
- Upstream package metadata currently exports only protocol/capture/renderer, while README describes relay/transport/adapters. The migration must verify actual exports before planning relay/transport replacement.
- FSB has two dashboard implementations. Static and Angular viewers must stay behaviorally aligned or one must be declared non-authoritative.
- The current FSB stream mutates the live page with `data-fsb-nid`; upstream security docs claim clone-only sanitization and privacy masking. Any behavior difference needs explicit acceptance.
- Browser UAT remains mandatory: DOM streaming quality is not fully proven by Node tests alone.

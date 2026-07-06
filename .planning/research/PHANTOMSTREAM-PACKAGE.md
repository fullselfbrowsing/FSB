# PhantomStream Package Research

**Date:** 2026-06-17
**Scope:** v0.12.0 milestone intake for replacing FSB's in-house DOM stream/dashboard preview implementation with the extracted PhantomStream package.

## Upstream Facts

- Repository: https://github.com/fullselfbrowsing/PhantomStream
- Package name declared in upstream `package.json`: `@full-self-browsing/phantom-stream`
- Declared version in upstream `package.json`: `0.1.0`
- Declared module type: ESM
- Declared exports in upstream `package.json`: `.`, `./protocol`, `./capture`, `./adapters/extension`, `./adapters/bookmarklet`, `./adapters/playwright`, `./renderer`, `./relay`, and `./transport/websocket`.
- Upstream README describes relay, WebSocket transport, Playwright/CDP adapter, demos, reference parity tests, and security docs.
- npm registry check on 2026-06-17 returned `E404 Not Found` for the old unhyphenated scope `@fullselfbrowsing/phantom-stream`.
- npm registry check on 2026-06-17 confirmed `@full-self-browsing/phantom-stream@0.1.0` is published with integrity `sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g==` and tarball `https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.1.0.tgz`.

## Integration Implication

This milestone must start with a package-intake gate before replacing production code:

1. Prefer consuming a published npm package with exact version, lockfile integrity, and provenance recorded.
2. Use the published `@full-self-browsing/phantom-stream@0.1.0` package unless a later smoke test proves it cannot satisfy FSB's import/runtime constraints.
3. Do not replace FSB's working in-house stream until capture, renderer, relay/transport, side channels, remote control, and security behavior are parity-tested against the current implementation.

## Existing FSB Surfaces To Replace

- Capture/content: `extension/content/dom-stream.js`
- Extension routing/transport glue: `extension/ws/ws-client.js`, `extension/background.js`
- Relay: `showcase/server/src/ws/handler.js`
- Static dashboard viewer: `showcase/js/dashboard.js`, `showcase/css/dashboard.css`, `showcase/dashboard.html`
- Angular dashboard viewer: `showcase/angular/src/app/pages/dashboard/dashboard-page.component.*`
- Tests: dashboard stream readiness/pending-intent/runtime-state, DOM stream perf, server backpressure, remote-control handlers, and Angular parity/source-contract tests.

## Key Risks

- The roadmap and older research named the wrong package scope (`@fullselfbrowsing/phantom-stream`); migration code and docs must consistently use `@full-self-browsing/phantom-stream`.
- The migration must verify actual exports in code before planning relay/transport replacement, even though the published package metadata lists the expected surfaces.
- FSB has two dashboard implementations. Static and Angular viewers must stay behaviorally aligned or one must be declared non-authoritative.
- The current FSB stream mutates the live page with `data-fsb-nid`; upstream security docs claim clone-only sanitization and privacy masking. Any behavior difference needs explicit acceptance.
- Browser UAT remains mandatory: DOM streaming quality is not fully proven by Node tests alone.

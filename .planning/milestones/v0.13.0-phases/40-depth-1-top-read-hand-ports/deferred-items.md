# Phase 40 — Deferred / Out-of-Scope Items

Logged during execution per the executor scope boundary. NOT fixed here.

## Build side-effects (out of scope)

- **`showcase/angular/public/sitemap.xml` + `showcase/angular/public/llms-full.txt`**:
  running `node scripts/package-extension.mjs` rewrites these marketing-site artifacts
  with today's `lastmod` date (2026-06-25 -> 2026-06-26). Unrelated to the DEPTH-01
  hand-ports. Left UNSTAGED across all Phase-40 commits (the extension build, not the
  gitlab/slack/notion port, touches them). If these date bumps are desired they can be
  committed separately by whoever owns the showcase site; they are not part of this phase.

---
phase: 54
slug: permission-scoped-drive-corpus-boundary
artifact: human-uat
evidence_scope: metadata-only
status: human_needed
live_approved: false
authorized_live_drive_run: false
created: 2026-07-20
updated: 2026-07-20
---

# Phase 54 — Authorized Live Drive UAT Ledger

This is a metadata-only ledger. Deterministic fixtures and local real-Chrome tests are automated evidence only; they never set `live_approved: true` and do not substitute for an authorized live Drive run.

Do not record folder, source, or account identifiers; filenames or display names; source bodies or snippets; tokens; raw provider errors; or other content. A live run may record only the scenario key, date, build/browser metadata, closed expected/observed state token, pass/fail/human-needed status, and a redacted issue reference.

## Authorized-Live Scenarios

| Key | Scenario | Expected metadata-only observation | Status |
|---|---|---|---|
| LIVE-01 | Explicit root enrollment from the exact current Drive folder | Enrollment is offered only for the exact folder context; revalidation either activates the corpus or stays closed. | `human_needed` |
| LIVE-02 | Direct-child vendor scope, nested physical descendants, and a root-file source | Physical ancestry assigns the intended scope without widening membership. | `human_needed` |
| LIVE-03 | Shortcut exclusion | A shortcut never admits or traverses an external target. | `human_needed` |
| LIVE-04 | Shared-drive pagination and accessible shared descendants | Complete bounded pagination plus verified physical ancestry is required; incomplete proof stays closed. | `human_needed` |
| LIVE-05 | Rename/move and move-in/move-out transitions | Rename preserves stable membership/content identity; movement changes membership only after fresh ancestry proof. | `human_needed` |
| LIVE-06 | Trash/delete/denial/opaque 404 transitions | Authoritative removal may become `missing`; denial or ambiguous not-found remains `inaccessible` and leaks no prior metadata. | `human_needed` |
| LIVE-07 | Account switch/identity unavailable | Prior influence withdraws before replacement; unavailable identity is neutral and fail-quiet. | `human_needed` |
| LIVE-08 | Change token recovery, invalidation, and browser/worker restart | Recovery converges from the closed checkpoint without exposing stale influence. | `human_needed` |
| LIVE-09 | Six states: `ready`, `pending`, `unreadable`, `download-blocked`, `inaccessible`, `missing` | Only the closed state token and generic safe copy appear; each transition withdraws unsafe prior projection first. | `human_needed` |
| LIVE-10 | Source-body/log/storage redaction | Source bodies remain operation-local; diagnostics and persisted storage remain metadata-only and redacted. | `human_needed` |

## Approval Boundary

- `live_approved` remains `false` because no authorized live Drive scenario was performed in this plan.
- Every row remains `human_needed` until an authorized person performs it and records only the allowed metadata.
- Local Chrome storage isolation, deterministic Drive fixtures, and fake-account/reconciliation tests belong in `54-VALIDATION.md`; they cannot change this ledger's approval state.
- Phase 59 remains the milestone-level owner for live/adversarial release acceptance.

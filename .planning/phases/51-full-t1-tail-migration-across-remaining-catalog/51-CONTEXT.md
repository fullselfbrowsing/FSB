# Phase 51 Context: Full T1 Tail Migration Across Remaining Catalog

## Trigger

The milestone was reopened after the user rejected the narrower "next batch" framing and asked to make the remaining **2,264** catalog-tail descriptors T1 as part of the current milestone.

## Baseline

Source of truth: `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`.

| Metric | Count |
|--------|------:|
| Total descriptors | 2,314 |
| T1-ready executable descriptors | 45 |
| T1 guarded fail-closed writes | 5 |
| Catalog tail not direct API-ready | 2,264 |
| Discovery-pending tail rows | 2,070 |
| Blocked tail rows | 194 |
| App stems with at least one direct T1/guarded row | 9 |

## Operating Rule

"All 2,264 T1" cannot mean marking rows ready by metadata. A row becomes T1 only with executable handler/recipe proof through the existing gates. Denied rows remain blocked unless denylist/product/legal policy changes. Write and destructive rows remain guarded fail-closed until live mutation-body UAT evidence exists.

## Phase 51 Scope

- Build and maintain a generated worklist for every current tail descriptor.
- Convert low-risk same-origin reads first.
- Add bridge families only where their architecture is proven with negative controls.
- Activate writes/destructive actions only through the Phase 49 evidence process.
- Keep readiness/status surfaces honest throughout the migration.

## Non-Negotiables

- Do not add one MCP tool per app.
- Do not ship OpenTabs runtime/plugin code.
- Do not bypass origin pins, consent, audit, signature checks, denylist, or no-secret logging.
- Do not mark a descriptor T1-ready unless the existing readiness and port-contract gates can prove it.

# 39-06 Remaining-Real-App Manifest (the completeness CHECKLIST)

**Phase:** 39-breadth-c-commerce-travel-misc-most-sensitive · **Plan:** 06 · **Generated:** 2026-06-25

## What this is

This is the **derived** remaining-real-app checklist for the FINAL breadth sub-batch. It is the
computed DIFF of the FULL vendored OpenTabs surface vs the already-imported set, NOT a guess. After
Plan 39-06 vendors + imports every row marked **VENDORED+IMPORTED**, `enumerateBatchApps()` over the
vendored snapshot covers **every real OpenTabs app** (every vendored dir except the e2e/prescript
fixture dirs + the DENY-01 / money-movement denied set).

**39-07's coverage-report `realAppCount` check verifies the emitted catalog against every
VENDORED+IMPORTED row below.** A real app appearing here with no disposition is a coverage hole that
BLOCKS the plan; a VENDORED+IMPORTED row with no emitted `opentabs__<stem>__*` descriptor FAILS 39-07.

## How it was derived (read-only enumeration, reproducible)

```
remaining = { every dir under vendor/opentabs-snapshot/plugins/* }            # the full vendored surface
          MINUS { e2e / prescript / *-test fixture dirs }                     # (none vendored)
          MINUS { the DENY-01 / money-movement deniedOrigins apps }          # (none vendored)
          MINUS { every app already imported by Phases 37 / 38 / 39-02..05 } # cross-ref opentabs__<stem>__*.json
```

- Full vendored surface (`ls vendor/opentabs-snapshot/plugins`): **53 dirs**.
- Fixture dirs (`e2e` / `prescript` / `*-test`): **0** (none vendored).
- Denied / money-movement apps with a vendored dir: **0** (paypal/venmo/cashapp/wise/western-union are
  denied in `service-denylist.json` `deniedOrigins` and are **NOT vendored** — see "Excluded" below).
- Already-imported dirs (have an `opentabs__<stem>__*.json` descriptor): **47**.
- **Remaining = 53 − 0 − 0 − 47 = 6** → the 6 rows below, ALL **VENDORED+IMPORTED by THIS plan**.

## The remaining-real-app checklist (zero unaccounted rows)

| # | App (dir) | Host (service) | Stem (slug) | Tier | Payment op(s) | Disposition |
|---|-----------|----------------|-------------|------|---------------|-------------|
| 1 | shopify | `*.shopify.com` (+ `*.myshopify.com` storefront) | `shopify` | SENSITIVE (payment) | `create_order` (PAYMENT_OP_NAMES) | **VENDORED+IMPORTED** (39-06) |
| 2 | craigslist | `www.craigslist.org` (apex `*.craigslist.org` screened) | `craigslist` | SENSITIVE (marketplace) | none (`post_listing` is a WRITE but NOT a payment op) | **VENDORED+IMPORTED** (39-06) |
| 3 | dominos | `www.dominos.com` | `dominos` | SENSITIVE (payment) | `place_order` (PAYMENT_VERBS `place` + PAYMENT_OP_NAMES) | **VENDORED+IMPORTED** (39-06) |
| 4 | chipotle | `www.chipotle.com` | `chipotle` | SENSITIVE (payment) | `place_order` (PAYMENT_VERBS `place` + PAYMENT_OP_NAMES) | **VENDORED+IMPORTED** (39-06) |
| 5 | zillow | `www.zillow.com` | `zillow` | SAFE (read-only) | none (search/get/get_home_value — all reads) | **VENDORED+IMPORTED** (39-06) |
| 6 | grafana | `grafana.com` | `grafana` | SAFE (read-only) | none (list/get/query — all reads) | **VENDORED+IMPORTED** (39-06) |

**Unaccounted rows: 0.** Every remaining real app is vendored + imported by this plan.

### Per-row screening (classified BEFORE vendoring — the merge-time `classifyGate` has zero unclassified origins)

- **shopify** — `*.shopify.com` was already SENSITIVE (39-01); 39-06 ADDS `*.myshopify.com` (the
  canonical Shopify storefront domain where checkout/`create_order` charges — `*.shopify.com` does
  NOT suffix-match `shop.myshopify.com`). `create_order` is DOM-only on a sensitive origin → the
  payment-op CI guard PASSES.
- **craigslist** — was SENSITIVE on `www.craigslist.org` (39-01); 39-06 WIDENS the denylist host to
  the apex-suffix `*.craigslist.org` so the bare apex `craigslist.org` is ALSO screened (a classifieds
  marketplace — posting/contacting a listing is transact-adjacent). `post_listing` is a WRITE but NOT
  a payment op (the guard does not key on it); craigslist's sensitivity posture-B gates the write
  regardless. `delete_listing` is DESTRUCTIVE.
- **dominos / chipotle** — `www.dominos.com` / `www.chipotle.com` were SENSITIVE (39-01). `place_order`
  is the payment op (`place` ∈ PAYMENT_VERBS AND `place_order` ∈ PAYMENT_OP_NAMES) DOM-only on a
  sensitive origin → the payment-op CI guard PASSES.
- **zillow / grafana** — left UNCLASSIFIED (SAFE): every vendored op is a read (search/get/list/query —
  NO payment verb), the 39-01-widened heuristic's SPECIFIC tokens (checkout/cart/place-order/charge)
  do NOT false-trip them. Each vendored host (`www.zillow.com` / `grafana.com`) is added to
  `verify-catalog-crosscheck.mjs` `READ_ONLY_SAFE_SERVICES` (the 38 MED-02 guard) so a FUTURE write op
  for either FAILS the build.

## Excluded-with-reason (subtracted from the diff — recorded for auditability)

| Excluded set | Reason | Vendored? |
|--------------|--------|-----------|
| paypal / venmo / cashapp / wise / western-union | DENY-01 / money-movement — pure direct money movement, no benign read surface; in `deniedOrigins`, never imported (even DOM-only) | NO (not vendored) |
| robinhood / fidelity / carta (brokerage) | DENY-01 denied set (Phase 35) | NO (not vendored) |
| netflix / spotify / twitch / steam / youtube-music / tinder / onlyfans | DENY-01 ToS-hostile media/social denied set | NO (not vendored) |
| e2e / prescript / `*-test` plugin dirs | OpenTabs CI fixtures — the importer's `FIXTURE_DIR_RE` skips them | n/a (none vendored) |
| github / slack / notion | EXISTING head/REGISTRY origins — breadth adds DATA behind the SAME 2 tools, never clobbers a head descriptor (`EXISTING_HEAD_SERVICES`) | n/a (head, not breadth-DATA) |

## Scope note: apps NOT in the vendored surface (out of scope for this diff)

`docker-hub` and `amplitude` appear only as **illustrative examples in ARCHITECTURE.md's Phase-37
prose** (the "+ …" tail of the dev/productivity batch list); they were never vendored under
`vendor/opentabs-snapshot/plugins/`. This manifest is the DIFF of the **actual vendored surface** vs
the imported set (the importer auto-enumerates vendored dirs), so a never-vendored app is not a
coverage hole for THIS milestone's real-app set — adding it would be a future vendoring decision, not
a 39-06 omission. The vendored surface (53 dirs) is 100% imported after this plan; there is no real
app the importer can reach that is unaccounted.

---

*Derived by 39-06 Task 1a from a read-only enumeration of `vendor/opentabs-snapshot/plugins/*`
cross-referenced against the emitted `catalog/descriptors/opentabs__*.json` service stems. The
completeness contract 39-07's coverage report verifies against every VENDORED+IMPORTED row.*

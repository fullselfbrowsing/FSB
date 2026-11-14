# Skopeo: deferred wiring and known gaps (PR #153 review)

Recorded 2026-11-14 after the PR #153 review fixes landed on `Jev` (commits
9aee64485 through 76f3377b8). These items were confirmed in the review but left
out of that patch pass, because each needs a design decision rather than a
local fix.

## 1. Graph builds have no production caller (review #2)

`FsbSkopeoGraphEngine.create()` is wired into the truth engine in
`extension/background.js` (~1442). Nothing in the extension calls the facade's
`buildSource`, `updateSource` or `replaceCandidateRelations`; only the engine
itself and `tests/skopeo-graph-runtime.test.js` do. `snapshotExactSet` needs a
current fragment for every visible source, so truth recompute always gets a
closed snapshot and returns `snapshot-stale`. The folder and reading HUD, cited
Ask and alerts therefore never get current truth in production.
55-VERIFICATION.md marks this path as WIRED.

Open questions before wiring:
- **Trigger.** What starts a build: corpus enrollment, reconciler content
  changes (`action: 'content'`), HUD open, or an explicit user action? Updates
  should follow the reconciler's per-source decisions.
- **Cost and consent.** Each source build drives up to nine provider calls
  through `replaceSource` (`skopeo-graph-engine.js` ~627). That spends the
  user's own API key, so it needs a budget, rate limits and a visible consent
  point.
- **Transport bug.** `fsbGraphCorpusTransport().readContent`
  (`background.js` ~961) calls `currentCorpusFacadeEntry` and
  `createSkopeoCorpusKernel`, which exist only inside the controller IIFE. Its
  first real call would throw a ReferenceError.
- **Latent truth-store issues** that only appear once builds run:
  - `withdrawFamiliesForSourcesInternal` (`skopeo-truth-store.js` ~2276)
    rejects every withdrawal with `dependency-mismatch` after one half-finished
    recompute.
  - A staged-but-unpublished snapshot also blocks withdrawal (~2320).
  - Overlay invalidation allows 32 affected sources while the graph store can
    send 63 (~2511).
- **Latent graph-store issues:**
  - `recover()` spends a step per control key and fails every boot past 128
    sources (`skopeo-graph-store.js` ~2321).
  - Pages split by item count can exceed the 256 KiB value limit (~1268).
  - Publishing candidate relations never purges the query cache (~1690).
  - `lexicalTerm` can split a surrogate pair (`skopeo-graph-extractor.js` ~560).

## 2. Lineage cannot be accepted across sources (review #19)

`registryBase` (`skopeo-truth-engine.js` ~456) issues document and clause
handles only for records in the current source. An accepted lineage edge always
targets a document in another source (an amendment in S2 amending a base in
S1), so the model can only name a same-source target and the adjudicator
abstains with `input-not-exact`. The registry has to issue target handles for
the relation endpoints in other sources, and the adjudicator's endpoint check
(~1074) has to be revisited with it.
`tests/skopeo-lineage-adjudicator.test.js:534` builds handles from all sources,
which hides this.

## 3. Amendment-extended expiry reads as expired (review #20)

`stateByDocument` (`skopeo-lineage-adjudicator.js` ~1297-1306) collects
expiration facts per document, including facts on clauses an executed amendment
has replaced. Example: a base expiring 2025-01-01, plus an executed amendment
moving it to 2028-01-01. That family resolves as expired, historical and
non-governing, with no overlays. The temporal state should apply the same
overlay filter `candidateIsApplicable` already applies at the fact level.

Two smaller adjudicator issues surfaced alongside this:
- A family with zero citations makes the whole partition abstain (~2408).
- The truth schema accepts candidates that the adjudicator later rejects by
  abstaining the whole set instead of dropping the one candidate.

## 4. Folders with more than 32 sources cannot publish (review #13)

`publishStagedWithAuthority` (`skopeo-drive-reconciler.js` ~1249) certifies
every active source in one `runWithCertifiedSources` call. The shared authority
caps that at `MAX_CORPUS_OPERATION_SOURCES = 32` (`background.js` ~2085), so a
folder with 33 or more files fails `closed`. The reconciler itself allows 4096,
and 57-RESEARCH.md expects larger inventories, with an over-cap HUD state.

Raising the cap is not enough. Each source costs up to three ancestry proofs at
up to 256 requests each, inside one 30-second operation deadline. Options:
- chunked certification with a set-level proof;
- a separate publish authority with its own limits;
- certifying only changed sources against the previous published proof.

The HUD-side caps (32 in the truth engine, the lineage adjudicator and
`visibleHudManifest`) are a separate decision.

## 5. Smaller items left as they are

- **Vendor folder labels** with leading or trailing spaces close the folder
  HUD. The folder `askScopes` label (`background.js` ~5139) is not trimmed,
  but the schema requires trimmed text.
- **`recover()` in the corpus store** purges any unpublished operation as
  `orphaned-staging`, including a re-sync another Drive tab is staging at that
  moment (`skopeo-corpus-store.js` ~1793). Stores are shared, while kernels
  are per tab.
- **A cancelled `purgeSource`** rolls the source back to ready and active
  after some participants already deleted their data (~659).
- **A failed reconcile run** can leave a stale in-memory content identity, and
  later runs in that tab then return `closed` (`skopeo-drive-reconciler.js`
  ~918).
- **`diagnostics-ring-buffer.js`** uses the same "store, else sendMessage"
  fallback as the automation logger did. Entries appended inside the worker
  before the trusted boot stay only in the in-memory ring. No specific
  pre-boot append was found, so this was not changed.
- **`reconcileSource`** still stages a withheld record for an uncertified id
  with no prior record. It is only scheduled by the authority for sources it
  already holds, so the outside-change filter was applied to the two
  change-feed paths only.

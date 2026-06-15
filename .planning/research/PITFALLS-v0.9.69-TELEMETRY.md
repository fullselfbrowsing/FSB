# Pitfalls Research -- v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix

**Domain:** Privacy-preserving telemetry from MV3 Chrome extension to Express + better-sqlite3 ingestion, plus diagnosis of a regressed WS DOM-streaming pipeline.
**Researched:** 2026-05-14
**Confidence:** HIGH on policy/regulatory claims (cited primary sources). MEDIUM on streaming-bug diagnosis (code-reading without runtime repro; specific failure modes identified by tracing the handshake but not exercised). HIGH on MV3 SW and SQLite patterns (Chromium docs + better-sqlite3 official docs).

**Scope:** Pitfalls specific to *adding* an anonymous telemetry pipeline + fixing the dashboard DOM stream. Generic browser-automation, AI prompting, and MCP host install pitfalls (already covered in `.planning/research/PITFALLS-PREV-MILESTONES.md`) are NOT duplicated here.

**Source files inspected:**
- `extension/manifest.json` (MV3 permissions; no `host_permissions` for the telemetry endpoint declared yet)
- `extension/background.js:1753-1775` (SW keepalive), `:6105-6189` (DOM stream forwarding), `:12908-13012` (alarm + lifecycle), `:13015-13060` (`onInstalled` / `onStartup`)
- `extension/ws/ws-client.js:845-899` (`_sendStateSnapshot`/`ext:page-ready` emit), `:901-1055` (`_resolveStreamCandidate` + `_handleDashboardStreamStart`), `:1061-1119` (`_handleMessage` switch), `:1356-1420` (`_forwardToContentScript` with reinject-retry)
- `extension/content/dom-stream.js:967-1073` (content-script message router + `domStreamReady` ping)
- `showcase/server/src/ws/handler.js:1-283` (full relay -- room-keyed, message-type-agnostic; relay drops only when no matching role is in the room)
- `store-assets/chrome-web-store/listing-copy.md:1-80` (no privacy practices section, no privacy policy URL, no data-collection disclosure)
- `.planning/PROJECT.md` v0.9.69 milestone goal block + v0.9.45rc1 carry-forward streaming work

---

## Severity Legend

- **BLOCKER** -- ship-stopper. Causes delisting, GDPR/CCPA exposure, data loss, or core feature broken. Must be addressed in-milestone.
- **MAJOR** -- regression, abuse vector, or systemic privacy leak risk. Must be addressed in-milestone, can be addressed in late phase.
- **MINOR** -- footgun, ergonomic, or cleanup. Document, gate via code review, fix opportunistically.

---

## Section 1: Chrome Web Store Policy Gotchas (BLOCKER class)

### Primary sources (verify against current text at submission time)

- Chrome Web Store User Data Policy & "personal or sensitive user data" definition: <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>
- Limited Use Policy: <https://developer.chrome.com/docs/webstore/program-policies/limited-use>
- Privacy practices disclosures in CWS Developer Dashboard: required for every publish/update (see User Data Policy above).

### 1.1 (BLOCKER) -- Listing currently makes ZERO data-collection disclosure

**Status today:** `store-assets/chrome-web-store/listing-copy.md` describes only local-only operation: *"FSB asks for broad browser permissions because it needs to read and act on the pages you choose to automate. Model requests are sent to the provider you configure."*

**What goes wrong:** Once v0.9.69 ships, the extension will also send telemetry to an FSB-controlled server (`full-selfbrowsing.com`). This is "transfer of user data" under the Limited Use Policy. Publishing the v0.9.69 build without updating the Privacy practices section in the dashboard AND the listing copy is a direct policy violation -- Google's reviewers can (and do) reject updates or delist for material mismatch between declared and actual behavior.

**What Google's policy classifies as "personally identifiable information":**

Quoting the User Data FAQ:

> "Personally identifiable information (including a person's name, address, telephone number, email address, and username. It also includes any type of identification number, such as a government issued number, driver's license number, or account number) ..."

The exact category "any type of identification number" is broad and reviewers have historically applied it to per-install UUIDs when those UUIDs **persist** and **can be correlated across visits**. A per-install UUIDv4 stored in `chrome.storage.local` and sent on every beat IS a persistent identifier even though it carries no name/email -- treat it as a regulated "identification number" for declaration purposes, not as exempt.

**Prevention:**

1. Update the Developer Dashboard *Privacy practices* tab BEFORE publishing v0.9.69:
   - Tick "Personally identifiable information" (the UUID).
   - Tick "Web history" only if you log URLs -- this milestone forbids URL logging, so do NOT tick it.
   - Provide a Privacy Policy URL hosted under `full-selfbrowsing.com/privacy` covering the telemetry payload, retention, opt-out mechanism, and Limited Use compliance.
   - Tick "Limited Use" certification.
2. Add a "Data collection" section to `store-assets/chrome-web-store/listing-copy.md` covering: UUID-per-install (not PII like name/email), MCP client label, model name, token counts, active-agent count, hashed IP (server-side), opt-out toggle in control panel.
3. Block release tagging on a checklist item: `verify-store-listing.mjs` parity script that diffs declared categories vs telemetry payload fields.

**Detection:**

- CI gate -- new script `scripts/verify-store-listing.mjs` that reads listing-copy.md + an explicit telemetry-payload schema file (`extension/telemetry/payload-schema.json`) and fails if listed payload != schema fields.
- Manual UAT -- screenshot the dashboard *Privacy practices* page during release; archive in `.planning/milestones/v0.9.69-RELEASE-EVIDENCE.md`.

**Phase assignment:** Pre-collector phase (whichever stands up the schema) + final release-prep phase.

---

### 1.2 (BLOCKER) -- Limited Use Policy compliance statement

Quoting the Limited Use Policy: developers must provide *"an affirmative statement that your use of the data complies with the Limited Use restrictions ... disclosed on a website belonging to your extension"* with the canonical wording about Google APIs (FSB doesn't use Google APIs for telemetry, so the canonical sentence needs adjustment but the affirmation requirement still applies for any user data transfer).

**Prevention:** Add to `full-selfbrowsing.com/privacy` an explicit section:
- "FSB only collects: per-install UUID, MCP client name, model name, token counts (rounded), active-agent count, hashed IP. It never collects: URLs, page content, prompts, AI responses, clipboard contents, form values, names, emails, or any other PII."
- "Use of the collected data is limited to: aggregate usage statistics displayed on /stats and internal product-health monitoring."
- "Data is not sold, not shared with third parties, and not used for advertising or credit assessment."

**Detection:** Link-check CI gate -- `/privacy` page must contain a stable HTML anchor `#telemetry-disclosure` that the listing-copy.md `Homepage URL` field references.

---

### 1.3 (MAJOR) -- Specific real-world delisting antipatterns to avoid

Public delistings and policy-enforcement actions over 2024-2026 share patterns. Avoid every one of these:

| Antipattern | Real-world outcome | Mitigation in v0.9.69 |
|---|---|---|
| Telemetry beats start firing BEFORE user has dismissed the first-run banner | Reviewers flag as "deceptive consent" -- the user hasn't accepted yet | Banner gates `telemetryEnabled = true`; collector reads the flag every batch; never send before flag is `true` AND `consentDecisionAt` timestamp is set in storage |
| Opt-out toggle hidden 3+ clicks deep in settings | Treated as "dark pattern" -- counted against listing | Top-level toggle in control panel "MCP" or "Privacy" tab, visible without scroll on default control-panel viewport |
| Privacy policy URL 404s or 301s to homepage | Hard-rejection during review | Server-side test: `tests/showcase-privacy-page.test.js` HEAD-requests `/privacy` and asserts 200 + literal "FSB Telemetry" string present |
| Telemetry payload contains URL, query string, page title, or any DOM contents | Hard-removal under data-minimization policy | Schema-validation gate (see 5.2 below). Strict allowlist enforced server-side AND client-side |
| Logging includes IP address in plaintext on disk | Hard-removal under "sensitive data" + cross-border data transfer concerns | Server hashes IP with daily salt BEFORE any write to SQLite; no Express access-log persisted in the same DB; if using `morgan`/access logs at the HTTP layer, redact `req.ip` on telemetry routes |
| Extension auto-fires telemetry on install before any user interaction | "Collection prior to consent" -- escalates to delisting if a regulator complains | First beat fires only after first task completion (or, more conservatively, after first banner dismissal) |
| Bundle minified/obfuscated code that hides the telemetry call site | Reviewers cannot audit -- soft-reject + re-review delay | No minification; `extension/telemetry/collector.js` remains readable; CI gate forbids `terser`/`uglify` on this file path |
| Different beat payload to different installs (e.g. A/B feature gates) without disclosure | "Undisclosed data collection" delisting | Single payload schema, single endpoint, no per-install variants in v0.9.69 |
| Sending telemetry from incognito sessions | Reviewers + users treat as severe trust break | Detect `chrome.extension.inIncognitoContext` (and per-tab `incognito: true` from `chrome.tabs.get`) and DO NOT log incognito events -- drop on the client before queueing |
| No way for a user to wipe collected data | GDPR Article 17 problem (right to erasure) + reviewer flag | Add "Wipe my telemetry data" button in control panel that POSTs `{uuid}` to a `/api/telemetry/forget` endpoint that deletes all rows keyed on that UUID; respond 204 even on miss to avoid enumeration |

---

## Section 2: GDPR / CCPA Exposure (BLOCKER class)

### 2.1 (BLOCKER) -- A persistent UUID stored client-side IS personal data under GDPR

**Source:** GDPR Article 4(1) <https://gdpr-info.eu/art-4-gdpr/>:

> *"'personal data' means any information relating to an identified or identifiable natural person ('data subject'); an identifiable natural person is one who can be identified, directly or indirectly, in particular by reference to an identifier such as a name, an identification number, location data, an online identifier or to one or more factors specific to ..."*

And GDPR Recital 30 <https://gdpr-info.eu/recitals/no-30/>:

> *"Natural persons may be associated with online identifiers provided by their devices, applications, tools and protocols, such as internet protocol addresses, cookie identifiers or other identifiers such as radio frequency identification tags. This may leave traces which, in particular when combined with unique identifiers and other information received by the servers, may be used to create profiles of the natural persons and identify them."*

**The line:** Anonymous in colloquial terms is NOT anonymous in GDPR terms unless re-identification is *"reasonably likely"* impossible. A persistent UUID linked to behavior (tokens, MCP client, model) IS an online identifier and IS personal data under the regulation. The fact that FSB never sees a name does not exempt it.

**What this means concretely:**

- The UUIDv4 is "personal data" -- a privacy policy is mandatory, not optional.
- Hashing IP server-side reduces the surface but does NOT make the UUID itself non-personal. Both are processed.
- Opt-out-by-default is acceptable in the US under CCPA (where opt-out is the standard for "sale/share"). In the EU/UK under GDPR + ePrivacy (Article 5(3) of the ePrivacy Directive <https://en.wikipedia.org/wiki/EPrivacy_Directive>), the safer posture is **opt-IN** for anything not strictly necessary to the user-requested service. Telemetry is NOT strictly necessary.

**Prevention -- region-gating recommendation:**

The milestone goal lists "Opt-out toggle + first-run privacy banner" (opt-out by default). This is the right posture for US users and a defensible posture globally **only if** the first-run banner is genuinely prominent and dismissal counts as informed action. To be conservative:

1. Parse `Accept-Language` server-side at the telemetry endpoint (it's already parsed by the i18n middleware for `/`). If the requesting locale primary tag is in a hardcoded EU/UK list (`de`, `fr`, `it`, `es`, `pt`, `nl`, `pl`, `sv`, `da`, `fi`, `el`, `hu`, `cs`, `ro`, `bg`, `hr`, `sk`, `sl`, `et`, `lv`, `lt`, `mt`, `ga`, `en-GB`), the FIRST beat that arrives WITHOUT a `consentDecisionAt` timestamp gets rejected with `412 Precondition Required` -- forcing the extension to surface the banner before retrying.
2. The extension's banner copy MUST be translated for those locales (carry-forward i18n note below in Section 9).
3. Make the toggle binary `on`/`off`, not a granular per-field consent matrix -- granularity sounds privacy-friendly but expands the regulator-disclosed surface and confuses users.

**Decision:** keep opt-out-by-default for the v0.9.69 MVP, but build in `consentDecisionAt` as a required precondition on the server side. This lets us tighten to opt-in later (per-locale, behind a feature flag) without a schema migration.

### 2.2 (BLOCKER) -- Privacy Policy URL is mandatory and must cover specific items

**Required content (verify each):**

- Identity and contact of the controller (FSB project + maintainer email).
- What categories of data are collected (UUID, tokens, MCP client, model, agent count, hashed IP).
- What is NOT collected (URLs, prompts, page content, names, emails, clipboard, form data).
- Legal basis for processing (legitimate interest in product health under GDPR Article 6(1)(f) is defensible if you also offer easy opt-out and never use the data for ads).
- Retention period (rolling window; recommend 90-day retention for raw events, indefinite for aggregates; document this).
- Right to access/erasure/portability/objection + how to exercise them (the `/api/telemetry/forget` button discussed in 1.3 + an email).
- Cross-border transfer disclosure (Fly.io regions hosting the server).
- DPO contact if applicable (small project usually exempt).
- Cookie/storage disclosure (the UUID is stored via `chrome.storage.local`, not a cookie, but still a "tracker" under ePrivacy logic -- mention it).

**Detection:** Snapshot the live `/privacy` page during release prep; archive as evidence.

### 2.3 (MAJOR) -- CCPA "Do Not Sell or Share My Personal Information"

Source: <https://oag.ca.gov/privacy/ccpa>. CCPA defines personal information broadly to include identifiers and "could reasonably be linked." A UUID-per-install plus model usage qualifies. FSB doesn't sell data, but the "share" prong covers sharing for advertising -- so explicit non-sharing posture must be stated.

**Concretely:**

- Add to `/privacy`: "FSB does not sell, share, or rent personal information to third parties. There is no Do Not Sell / Do Not Share link because FSB does not sell or share."
- Don't add Google Analytics, Plausible-on-third-party-domain, Sentry, LogRocket, or any third-party analytics to `/stats` rendering or the telemetry server. Self-hosted only.
- California Opt-Me-Out Act (AB 566) takes effect 2027-01-01 requiring browsers to ship a built-in opt-out signal. FSB should respect the GPC (Global Privacy Control) `Sec-GPC: 1` HTTP header on the telemetry endpoint if it arrives -- silently drop the event with 204 to be future-safe.

---

## Section 3: Fingerprinting Risks Despite UUID + Hashed IP (MAJOR class)

### 3.1 (MAJOR) -- Correlation deanonymization via low-prevalence combinations

**Failure mode:** The payload `(uuid, hashed_ip, mcp_client, model, tokens, ts)` looks anonymous in isolation. In practice, low-prevalence combinations are uniquely identifying:

- "Codex client + GPT-5 model + 47k tokens at 14:23:01 UTC" -- if there are only 3 Codex users globally in that minute, the (model, token-bucket, minute) triple is a quasi-identifier and links to the UUID.
- Hashed IP rotates daily but within a day, any UUID's hashed_ip is stable, so an observer of a single day's table can correlate distinct sessions of the same install across MCP clients.
- Subsequent days: the UUID + the rough geographic footprint encoded in hashed_ip rotation patterns is enough to track an install across weeks even though the hash changes.

**Prevention -- defense-in-depth reduction techniques:**

| Technique | Where applied | Effect |
|---|---|---|
| Round timestamps to nearest 60s before write | Server-side in the `/api/telemetry/*` route after IP-hashing | Reduces timing-side-channel; tokens-per-minute granularity is sufficient for aggregate display |
| Bucket token counts (e.g. round to nearest 1k, cap at 1M) | Client-side in collector OR server-side at insert | Reduces unique values; aggregate stats don't need exact counts |
| Drop low-cardinality cells in aggregate queries (k-anonymity threshold) | Server-side at `/stats` aggregation | "Most popular MCP" only shows entries with >= 5 distinct UUIDs; cells below threshold are bucketed as "Other" |
| Hash IP with a per-DAY salt (not per-hour, not static) | Server-side at ingress | Daily window prevents long-term tracking; not so short that legitimate same-install events split across rows |
| Do NOT log User-Agent, Accept-Language, or any other HTTP header into the telemetry table | Server-side telemetry route handler | Eliminates passive browser fingerprint |
| Strip request bodies from any error/access logs that touch this endpoint | Express `morgan` config | Prevents accidental payload echo |

**Specific k-anonymity threshold recommendation:** k=5 for any cell exposed on `/stats`. Source: standard k-anonymity practice (<https://en.wikipedia.org/wiki/K-anonymity>); 5 is the common minimum for public dashboards (lower than the k=10 used for medical data, higher than k=2 which is trivial to break).

**Detection:**
- Server-side aggregation SQL must `HAVING COUNT(DISTINCT install_uuid) >= 5` on any GROUP BY query before exposing to `/stats`.
- A `tests/telemetry-k-anonymity.test.js` test that seeds 4 distinct UUIDs all using a unique MCP client, runs the aggregation, and asserts that the unique client does NOT appear in `/stats` output.

**Phase assignment:** Aggregate-computation phase; review with k-anonymity test in the verification block.

### 3.2 (MAJOR) -- Active-agent count is a behavioral fingerprint

A user who routinely runs 16 concurrent agents (cap is configurable up to 64 per v0.9.60) is rare. The combination of `(active_agent_count, mcp_client, hour_of_day)` can pin individual users.

**Prevention:** Bucket `active_agent_count` into ranges before send: `{0, 1, 2-4, 5-8, 9-16, 17-32, 33+}`. Display the same buckets on `/stats`.

### 3.3 (MINOR) -- Install date fingerprint

The first time a UUID appears in the table is its install date. If install date is exposed on `/stats` as "users joined this week," combined with later activity it narrows the cohort.

**Prevention:** Round `install_date` to week granularity in any query that joins to activity tables; never expose exact install-date per UUID.

---

## Section 4: MV3 Service-Worker Eviction + Telemetry Queue (BLOCKER class)

### 4.1 (BLOCKER) -- In-memory queue is lost on SW termination

**Source:** Chrome SW lifecycle docs <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle>. Standard SW idle timeout is 30s; even with `keepAliveInterval` (FSB has one at `extension/background.js:1755-1775`, ping every 20s), the worker terminates when no active session is running (`stopKeepAlive()` is called at `:1855-1864`).

**Failure mode in FSB context specifically:**

The existing `background.js` already disables `keepAliveInterval` when no `running` sessions exist. Telemetry must not depend on it. If the collector stages events in a top-level `let pendingEvents = []` array, every SW restart loses those events.

**Prevention -- canonical pattern:**

```js
// extension/telemetry/collector.js -- pseudo-code

const QUEUE_KEY = 'fsb_telemetry_queue_v1';

async function enqueue(event) {
  // 1. Read existing queue from chrome.storage.local
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
  // 2. Append + cap (defensive against runaway growth)
  queue.push(event);
  if (queue.length > 500) queue.splice(0, queue.length - 500); // drop oldest
  // 3. Write back atomically
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

async function flush() {
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
  if (!queue.length) return;
  // CRITICAL: snapshot + clear in same storage transaction to avoid double-send
  const snapshot = queue.slice();
  await chrome.storage.local.set({ [QUEUE_KEY]: [] });
  try {
    const res = await fetch(`${SERVER}/api/telemetry/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: snapshot })
    });
    if (!res.ok && res.status >= 500) {
      // server-side failure -- re-queue for next flush
      await reenqueue(snapshot);
    }
    // 4xx (other than 412 consent-required): drop silently (validation failed)
  } catch (netErr) {
    // network failure -- re-queue
    await reenqueue(snapshot);
  }
}

async function reenqueue(events) {
  const { [QUEUE_KEY]: current = [] } = await chrome.storage.local.get(QUEUE_KEY);
  await chrome.storage.local.set({ [QUEUE_KEY]: [...events, ...current].slice(0, 500) });
}
```

**Critical correctness properties:**

1. The queue lives in `chrome.storage.local`, not in a SW global. Surviving SW death is the table-stakes property.
2. `flush()` snapshots-and-clears atomically: read queue, write empty queue, then attempt send. If the SW dies mid-flush (after snapshot, before send), the events are LOST. This is acceptable for telemetry (data loss is preferable to double-send to avoid skew). If you want better-than-this, write the snapshot to a separate `IN_FLIGHT_KEY` first, attempt send, then clear `IN_FLIGHT_KEY` on success or re-merge on failure -- but this adds complexity and the simple variant is acceptable for v0.9.69.
3. `chrome.storage.local.set` is async; concurrent `enqueue()` calls during a flush can interleave. Defense: use a top-level Promise chain to serialize:

```js
let queueLock = Promise.resolve();
function withQueueLock(fn) {
  const next = queueLock.then(fn).catch(e => console.warn('[FSB TELEMETRY]', e));
  queueLock = next.then(() => {}, () => {});
  return next;
}
// callers: withQueueLock(() => enqueue(event)); withQueueLock(() => flush());
```

The lock lives in SW memory; if the SW restarts mid-flush, the next wake re-reads storage which is the source of truth -- so the lock is for in-session correctness only, never for crash recovery.

### 4.2 (BLOCKER) -- Reliable flush triggers

**Question posed:** `chrome.alarms` vs `chrome.runtime.onStartup` vs storage event for restart triggers -- which is reliable?

**Answer:**

| Trigger | Reliability | When to use |
|---|---|---|
| `chrome.alarms.create('fsb-telemetry-flush', { periodInMinutes: 5 })` | HIGH -- persists across SW eviction, wakes the SW | Primary periodic flush. Mirror the existing pattern at `background.js:6130` for `fsb-domstream-watchdog` |
| `chrome.runtime.onStartup` | MEDIUM -- fires only on browser session start, not after eviction recovery | Use for cleanup of stale `IN_FLIGHT_KEY` if you use that pattern; do NOT use as primary flush trigger |
| `chrome.runtime.onInstalled` | LOW -- fires once on install/update | Use to write initial UUID + consent state; do not piggyback flushes here |
| `chrome.runtime.onSuspend` | UNRELIABLE -- best-effort, can be skipped on forced eviction, gives < ~30s to finish | Do NOT rely on this for flushing. Documented as "may not run" |
| `chrome.storage.onChanged` for queue size threshold | LOW for SW persistence -- fires only in pages/listeners that are alive | Useful in-session to trigger early flush when queue > N, not for restart triggers |
| Reactively flushing on each event | HIGH bandwidth, no benefit | Don't -- defeats batching |

**Recommended trigger combo:**

```js
// On install / extension load
chrome.alarms.create('fsb-telemetry-flush', { periodInMinutes: 5 });

// Alarm handler -- add to existing listener at background.js:12909
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'fsb-telemetry-flush') {
    if (await isTelemetryEnabled()) {
      await withQueueLock(() => flush());
    }
    return;
  }
  // ... existing handlers
});

// Optional: opportunistic flush when queue gets large
async function enqueueWithMaybeFlush(event) {
  await enqueue(event);
  const { fsb_telemetry_queue_v1: q = [] } = await chrome.storage.local.get('fsb_telemetry_queue_v1');
  if (q.length >= 50) {
    // Don't await -- fire and forget
    withQueueLock(() => flush());
  }
}
```

### 4.3 (BLOCKER) -- Common SW-lifecycle bugs to gate against

| Bug | Symptom | Detection |
|---|---|---|
| Queue stored in SW memory only | Events appear during one SW lifetime then vanish | Test: simulate SW eviction via `chrome.runtime.reload()` between enqueue and flush; assert events preserved |
| Double-send after eviction (flush sent then SW died before clearing queue) | Same event_id appears in DB twice | Mitigation: every event carries a client-minted `event_id` (UUIDv4); server uses `INSERT OR IGNORE INTO events(event_id, ...)` with UNIQUE constraint on `event_id` |
| Missing events around install / first-run / banner-dismissal window | Telemetry never starts after fresh install because the alarm isn't created until first SW restart | Create the alarm in `chrome.runtime.onInstalled` AND in the SW top-level (`chrome.alarms.create` is idempotent) |
| Missing events around browser shutdown | `onSuspend` doesn't fire reliably | Accept the loss; document; consider a small "send on visibility change" path in the options page IF the user happens to be in the control panel |
| Telemetry payload accidentally captures circular references / large objects | `JSON.stringify` throws inside `enqueue` | Validate every event against a Zod-style schema BEFORE enqueue; on validation failure, log to ring buffer and drop (do NOT throw to caller -- telemetry must never crash the host code path) |
| Alarms cleared by extension reload | After `chrome.runtime.reload()` (dev workflow) the alarm vanishes | Re-arm alarms in `chrome.runtime.onInstalled` (FSB already does this for MCP -- mirror at `background.js:13044` for telemetry) |

**Phase assignment:** Collector phase + ingest phase (event_id constraint).

---

## Section 5: Public Ingestion Endpoint Abuse (BLOCKER class)

### 5.1 (BLOCKER) -- Unauthenticated POST endpoint is a DDoS / fill-disk target

The endpoint is by design unauthenticated (anonymous telemetry). Without active mitigations a single bad actor can:
- Fire 100k POSTs/sec with garbage payloads to fill disk (SQLite at WAL mode tolerates fast writes but disk is finite).
- Submit one giant `events[]` array with 1M entries.
- Replay valid-looking events from a captured beat to skew aggregates.

**Prevention stack (apply ALL):**

| Layer | Mitigation | Implementation |
|---|---|---|
| Express middleware | `express.json({ limit: '32kb' })` on the telemetry router | Caps body parse; oversized = 413 |
| Express middleware | `express-rate-limit` keyed on `req.ip` (the raw IP, NOT the hash -- you need the hash for storage, but the rate limit uses pre-hash IP for accurate accounting); 60 req/min/IP | <https://www.npmjs.com/package/express-rate-limit>; ensure `trust proxy` is correctly configured for Fly.io |
| Express middleware | Schema strict-validation -- reject events with unknown fields, wrong types, oversized strings (cap MCP client name at 64 chars, model at 128 chars). Use `zod` or hand-rolled validator. | Drop on validation failure with 400; don't even log to ring buffer if rate limit already covering |
| App layer | Batch size cap: `events.length <= 50` per POST; reject 413 above that | Prevents one giant beat |
| App layer | Schema-level allowlist: ONLY accept these fields per event: `event_id, install_uuid, ts, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type`. Reject any payload with extra fields | Closes "exfiltration via payload" vector |
| App layer | Drop on overflow: if a per-IP burst exceeds rate limit, respond 429 and DO NOT write anything | Standard `express-rate-limit` default |
| App layer | Heartbeat / write-rate alarm: if global writes/min exceeds N (set N to 10x normal baseline once you have a baseline), log + alert | Defensive against distributed flood |
| App layer | Reject events with `ts` more than 5 minutes in the future OR more than 7 days in the past | Limits replay window |
| App layer | Reject events from incognito-flagged installs (the extension promised not to send these; if server sees `incognito: true`, it's likely a spoofer) | Defense in depth |

### 5.2 (MAJOR) -- Replay attack handling

**Failure mode:** Attacker captures a valid beat and replays it 1000x. With opaque `event_id` and `ts`, server can't easily distinguish.

**Mitigation:** Server-side dedupe via `INSERT OR IGNORE INTO events(event_id, ...)` where `event_id` has a `UNIQUE` constraint. Replays of identical `event_id` are silently dropped at the SQL layer.

For events with the same content but freshly minted `event_id` (so dedupe doesn't fire), the rate limit + 5-minute timestamp tolerance window bound the damage.

A nonce field is NOT needed for v0.9.69; `event_id` + UNIQUE constraint covers it. Adding a server-issued nonce would require a handshake step that defeats the fire-and-forget batched-POST simplicity.

### 5.3 (MAJOR) -- Disk fill via storage exhaustion

**Failure mode:** Sustained 10k writes/sec for 24h on a flooded server fills the Fly.io volume. SQLite keeps inserting; eventually `disk full` error mid-transaction.

**Prevention:**
- Set a daily INSERT budget per (hashed_ip, install_uuid) at the application layer: drop after N events/day per UUID (recommend N=1000 -- normal usage is <100/day).
- Periodic VACUUM and retention: cron-like setInterval at 24h delete rows older than 90 days (raw events) and re-aggregate.
- Monitor disk usage: a simple `df -k` check inside `/api/health` and alert/refuse new writes at 90% disk.

**Phase assignment:** Telemetry ingestion phase.

---

## Section 6: SQLite Write Throughput (better-sqlite3) (MAJOR class)

### 6.1 (MAJOR) -- Correct pragma setup is non-negotiable

**Sources:**
- better-sqlite3 performance docs: <https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md>
- SQLite WAL mode: <https://www.sqlite.org/wal.html>
- Phiresky's tuning post: <https://phiresky.github.io/blog/2020/sqlite-performance-tuning/>

**Canonical pragma setup for the telemetry DB on startup:**

```js
const db = new Database('telemetry.db');
db.pragma('journal_mode = WAL');         // concurrent reader + writer
db.pragma('synchronous = NORMAL');       // corruption-safe in WAL; ~10x faster than FULL
db.pragma('busy_timeout = 5000');        // wait 5s on lock contention before erroring
db.pragma('cache_size = -64000');        // 64MB page cache (negative = KB)
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 30000000000');    // 30GB mmap if 64-bit; ignored if too large
```

**Footguns:**

| Pragma | Mistake | Fix |
|---|---|---|
| `journal_mode` | Default is `delete` -- single-writer, blocks readers | Set `WAL` once at startup; persists in DB header |
| `synchronous` | Default in some better-sqlite3 builds is FULL; FULL forces fsync on every commit | Set `NORMAL` -- corruption-safe in WAL mode per <https://www.sqlite.org/wal.html#performance_considerations> |
| `busy_timeout` | Default 0 -- contended write throws `SQLITE_BUSY` immediately | Set to 5000ms (5s) |

### 6.2 (MAJOR) -- Batched inserts via prepared statement + transaction

```js
const insert = db.prepare(`
  INSERT OR IGNORE INTO events
    (event_id, install_uuid, ts, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type, hashed_ip)
  VALUES
    (@event_id, @install_uuid, @ts, @mcp_client, @model, @tokens_in, @tokens_out, @active_agent_count, @event_type, @hashed_ip)
`);

const insertMany = db.transaction((events) => {
  for (const e of events) insert.run(e);
});

// In the POST handler:
insertMany(validatedEvents);
```

**Why:** Each `insert.run()` is a single round-trip; wrapping N inserts in one `transaction()` cuts WAL commits from N to 1. For a 50-event batch this is ~10x speedup.

**Bugs to avoid:**

| Bug | Symptom |
|---|---|
| Building INSERT strings via template literals instead of prepared statements | SQL injection (yes, even with anonymous data -- the `mcp_client` field could carry `'); DROP TABLE`); ~3x slower |
| Calling `db.exec()` instead of prepared statement | No parameter binding, no plan cache reuse |
| Forgetting `OR IGNORE` on the event_id UNIQUE constraint | Replays throw SQLITE_CONSTRAINT; 500 instead of silent drop |
| Not running PRAGMAs (especially WAL) on every process start | Reset to default? No -- WAL persists; but the *connection* pragmas (`busy_timeout`, `cache_size`) are per-connection. Set on every new Database() |
| Long-running open transactions during a query | Blocks writers behind the WAL writer | Keep transactions tiny; complete before next batch arrives |
| Growing DB file forever | Disk fill | Daily retention cron: `DELETE FROM events WHERE ts < ?`; periodic `VACUUM` (note: VACUUM rewrites entire DB -- run during low-traffic window) |

### 6.3 (MAJOR) -- Concurrent reader during write

`/stats` requests need to query the DB while writes are happening. WAL mode lets a single writer and unlimited concurrent readers proceed. better-sqlite3 is single-threaded per Database instance but Node's worker can multiplex.

**Concrete pattern:** ONE Database instance shared between the telemetry write path and the /stats read path; reads do not block writes in WAL mode. Do NOT open multiple Database instances on the same file -- that increases lock contention and gives no benefit.

### 6.4 (MAJOR) -- Index recommendations for /stats aggregates

The aggregate queries listed in `PROJECT.md`:
- Total tokens (lifetime) -- `SELECT SUM(tokens_in + tokens_out) FROM events;` -- requires no index; full scan acceptable if cached.
- Active users right now -- `SELECT COUNT(DISTINCT install_uuid) FROM events WHERE ts > ? ;` -- needs `INDEX (ts)`.
- Most popular MCP -- `SELECT mcp_client, COUNT(DISTINCT install_uuid) FROM events GROUP BY mcp_client HAVING COUNT(DISTINCT install_uuid) >= 5 ORDER BY 2 DESC LIMIT 10;` -- needs `INDEX (mcp_client, install_uuid)`.
- Most popular model -- similar; needs `INDEX (model, install_uuid)`.
- Avg agents per user -- needs `INDEX (install_uuid, active_agent_count)` or pre-aggregated `user_rollup` table (recommended -- see 7.1).

**Migration script:** versioned, idempotent. Apply on server start; gate via `PRAGMA user_version`.

---

## Section 7: Aggregate Computation Pitfalls (MAJOR class)

### 7.1 (MAJOR) -- O(n) full-table scan on every /stats poll

**Failure mode:** With visibility-aware 5-minute polling (per PROJECT.md, "reusing the existing 5-min visibility-aware polling primitive"), if 1000 dashboard viewers are open and the server runs a full COUNT(DISTINCT install_uuid) on a 10M-row events table, p99 latency spikes and SQLite gets hot.

**Prevention -- rolling counter pattern:**

1. Maintain a `daily_rollup` table: `(date, mcp_client, model, distinct_users, total_tokens, total_events, ...)`.
2. On every insert to `events`, also UPSERT into `daily_rollup` for today's date (within the same transaction). Use SQL: `INSERT INTO daily_rollup ... ON CONFLICT(date, mcp_client) DO UPDATE SET ...`.
3. `/stats` queries the rollup, NOT the raw `events` table -- bounded row count, fast scan.
4. For "active users right now," maintain a separate `recent_active` table that the daily retention job prunes (events older than 30 minutes).

**Cost:** double-write per event. Acceptable; SQLite WAL handles it. With prepared statements + the same transaction the rollup UPSERT adds ~20% to insert latency, not double.

### 7.2 (MAJOR) -- Cache invalidation + thundering herd

**Failure mode:** When the 5-min poll fires across all open `/stats` viewers (visibility-aware means they all wake when their tab becomes visible), they request `/stats` simultaneously. Without server-side caching, the same aggregate query runs N times.

**Prevention:**

- Server-side LRU cache (e.g. `lru-cache` package) with 5-min TTL keyed on the route+params.
- Jitter: add random `0..30s` to client poll interval to avoid global synchronization.
- Stale-while-revalidate: serve cached response immediately even if expired; trigger background refresh.

**Implementation:**

```js
const cache = new Map(); // simple Map is fine for low-cardinality keys
const TTL_MS = 5 * 60 * 1000;

async function getStats() {
  const key = 'stats:v1';
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < TTL_MS) return cached.value;
  const value = await computeStats(); // expensive
  cache.set(key, { ts: now, value });
  return value;
}
```

For multi-instance Fly.io deployment (if applicable), this in-memory cache is per-instance. Acceptable jitter; do not introduce Redis just for this.

### 7.3 (MINOR) -- "Active users right now" definition drift

What does "right now" mean? Last 5 min? 15 min? 1 hour? Without a contract, the number jumps as the definition evolves.

**Prevention:** Document a hard contract -- e.g. "Active users right now = distinct UUIDs with at least one event in the last 15 minutes." Store this as a constant in shared config (`showcase/server/src/telemetry/config.js` or similar) and unit-test the query.

---

## Section 8: DOM-Streaming WS Bugs -- Architectural Diagnosis (BLOCKER class)

### 8.1 (BLOCKER) -- Diagnosis of current breakage

**Code-reading observation (NOT verified by runtime test):** The streaming handshake `dash:dom-stream-start` -> `ext:page-ready` -> stream-begin chain has at least three latent failure modes I can identify from the source:

#### Failure mode A: race between `dash:dom-stream-start` arrival and content-script readiness

**Trace:**

1. Dashboard sends `dash:dom-stream-start` (`ws-client.js:1081`).
2. `_handleDashboardStreamStart` (`ws-client.js:1029-1055`) calls `_resolveStreamCandidate()` which checks `chrome.tabs.get(preferredTabId)` and tests `_isStreamableTab(tab)` -- this checks the TAB URL but NOT whether the content script is actually injected and the `dom-stream.js` module has run its IIFE.
3. If candidate is `ready: true`, the code calls `_forwardToContentScript('domStreamStart', payload)` (`ws-client.js:1054`).
4. `_forwardToContentScript` (`ws-client.js:1356-1420`) calls `chrome.tabs.sendMessage(tabId, { action: 'domStreamStart', ...payload }, { frameId: 0 })`.
5. If the content script is NOT yet injected (e.g., the tab just navigated, or it's a tab that never had FSB content scripts), `sendMessage` rejects.
6. The reinject branch runs `chrome.scripting.executeScript({ ... files: [...content scripts...] })` and waits 300ms before retrying.

**The bug:** The 300ms delay (`ws-client.js:1406`) is a heuristic, not a synchronization. `dom-stream.js`'s IIFE that registers the `chrome.runtime.onMessage` listener (`dom-stream.js:971`) may not have run if any earlier-listed content script (e.g. `content/init.js` or `content/utils.js`) is slow to parse. The retry `sendMessage` at line 1407 fires; if the listener still isn't registered, the second send also fails with no further retry. From that point on, the dashboard sees `streamStatus: 'ready'` from `_resolveStreamCandidate` but no DOM data ever arrives.

**The smoking-gun symptom:** Console shows `[FSB WS] Content script not ready on tab N -- injecting and retrying domStreamStart` followed by `[FSB WS] Failed to inject content script` OR no further log -- and the dashboard stalls on "Waiting for page ready" indefinitely.

**Fix:**
- Replace the 300ms `setTimeout` with a readiness ping: after `executeScript`, poll `chrome.tabs.sendMessage(tabId, { action: 'pingDomStream' }, { frameId: 0 })` until it succeeds (with a 5s overall timeout). `dom-stream.js` needs to add a `case 'pingDomStream': sendResponse({ ready: true });` branch in its message listener.
- Alternatively, have `dom-stream.js` send `chrome.runtime.sendMessage({ action: 'domStreamReady' })` on module load (which it ALREADY DOES at `dom-stream.js:1065`!) and have `background.js` handle that signal by re-checking the pending stream-start intent and forwarding `domStreamStart` then.

#### Failure mode B: `domStreamReady` ping is sent but nothing in background.js handles it

**Trace:** `dom-stream.js:1063-1070` clearly intends to signal readiness:

```js
// Signal background.js that this page has a DOM stream module ready
// This triggers the ext:page-ready -> dash:dom-stream-start auto-start chain
try {
  chrome.runtime.sendMessage({ action: 'domStreamReady' }).catch(...);
} catch (e) { /* ignore */ }
```

But searching `background.js`'s message router (`grep -n "domStreamReady"`) shows the action IS handled at `background.js:6179-6184` -- it just forwards `ext:dom-ready` to the relay. There is NO branch that re-arms the pending `dash:dom-stream-start` if one came in BEFORE the content script was ready.

**The bug:** If the dashboard sends `dash:dom-stream-start` while the streamable tab is mid-navigation (content script not yet injected after the page load), `_handleDashboardStreamStart` either (1) returns early with `not-ready` if the URL hasn't loaded enough for `_isStreamableTab` to pass, or (2) attempts the reinject path. In case 1, the `dash:dom-stream-start` is lost -- the user must click "start streaming" again on the dashboard to retry. There is no automatic retry on the `domStreamReady` ping.

**Fix:** Track a pending intent flag (`_pendingStreamStart = true`) when `_handleDashboardStreamStart` returns `not-ready`. When `domStreamReady` arrives, check the flag and call `_handleDashboardStreamStart(lastPayload)` again. Clear the flag on success or when the user explicitly stops.

#### Failure mode C: `_resolveStreamCandidate` uses `_streamingTabId` but `_streamingTabId` is stale after navigation

**Trace:** `_streamingTabId` (`ws-client.js:23-24, 882, 1048`) is set to the candidate's tab id when streaming starts. After the user navigates the streaming tab to a new URL:
- The tab ID is unchanged.
- The content script is reloaded (because it's a new page).
- `_isStreamableTab` may now return true (new URL is streamable).
- But the **content-script** `streaming` flag (`dom-stream.js:996, 1005`) is reset to `false` because the old content script was destroyed.
- The next `dash:dom-stream-start` will call `_forwardToContentScript('domStreamStart', payload)` -- which DOES re-inject if `sendMessage` fails... but if the new page's content scripts loaded normally, `sendMessage` succeeds, and `dom-stream.js:973` correctly starts a new stream session.

Actually this path looks correct. The issue is when there is NO new `dash:dom-stream-start` from the dashboard after navigation. The dashboard auto-restart logic (which I haven't inspected in the dashboard code) needs to detect navigation in the streamed tab and re-send `dash:dom-stream-start`. If it relies on `ext:dom-ready` messages from the new page to know to restart, but those messages are dropped somewhere along the relay (or the dashboard ignores them), the stream stalls.

**Fix to verify in the dashboard side:** confirm the dashboard listens for `ext:dom-ready` and re-issues `dash:dom-stream-start` automatically. If it relies on `ext:page-ready` only, that signal is sent from the EXTENSION at `ws-client.js:883` from `_sendStateSnapshot` (which fires on `dash:request-status` and the connection-snapshot path) -- not on every page navigation. This gap is the most likely architectural source of "streaming is broken" after the user navigates.

### 8.2 (BLOCKER) -- Common WS DOM-stream failure modes to gate

| Failure mode | Symptom | Mitigation |
|---|---|---|
| Dropped frames after SW eviction | Dashboard preview freezes mid-task | The content script keeps streaming via its watchdog; SW comes back via `chrome.alarms` `fsb-domstream-watchdog` (`background.js:12937-12945`). Verify the alarm-fired branch actually does something other than `console.log` -- right now it only logs. Recommend: on watchdog fire, request a fresh `ext:snapshot` from the active streaming tab if `_streamingActive` is true |
| Pair-handshake race | Streaming starts before dashboard subscribes; events dropped at relay | Server-side `handler.js:159-173` already notifies dashboards of `ext:status` on connect. The race is the OPPOSITE: extension may not know dashboard arrived. The fix is that the relay should ALSO emit `dash:online` to the extension side when a dashboard joins -- relevant `handler.js:166-173` notifies dashboards of `ext:status` but does NOT notify extensions of `dash:status` |
| Backpressure not honored | Extension floods relay; server `ws.send` calls succeed silently; dashboard tab freezes parsing huge messages | Server `handler.js:74-80` doesn't check `ws.bufferedAmount`. Add: skip send if `client.bufferedAmount > 16MB` and increment a `backpressure-dropped` counter |
| Binary vs text frame mismatch | Decompression branch silently fails | The `_lz: true` envelope path is text-only (base64). Verify the WS client never sends a Buffer/ArrayBuffer; always JSON.stringify |
| CSP blocking the embed on `/stats` Easter-egg page | Iframe preview from streaming dashboard blocked by `frame-ancestors` | If `/stats` is going to embed a preview iframe of the dashboard, the showcase server must serve `Content-Security-Policy: frame-ancestors 'self'` on the embedded route. For v0.9.69 `/stats` only shows aggregates, NOT a preview iframe -- so this is moot for this milestone. Document it as out of scope |
| Iframe sandbox restrictions | If the dashboard embeds the streamed DOM in a sandboxed iframe, JS in the cloned DOM cannot execute -- but FSB never wants the clone to execute JS, so this is intentional. Confirm the sandbox attr is `sandbox="allow-same-origin"` (NOT `allow-scripts`) | -- |
| CORS / WSS cert issues | Extension cannot connect because of mixed-content or expired cert | Make `WS_URL` configurable in `extension/config.js`; default `wss://full-selfbrowsing.com/ws`; CI gate: `tests/ws-tls.test.js` openssl s_client check on prod cert expiry |

### 8.3 (MAJOR) -- Recent FSB phases that may have regressed streaming

From MILESTONES.md greps:

| Phase | What it touched | Regression risk |
|---|---|---|
| Phase 211 (v0.9.45rc1) | Stream reliability hardening, `_lz` decompression, two-tier watchdog | HIGH -- changed the on-wire envelope and the watchdog wiring |
| Phase 217 (v0.9.47) | Moved `background.js`, `ws/`, content scripts under `extension/` -- mechanical reorg | LOW -- mechanical only, but path-aware tests need to be re-checked |
| Phase 164 (v0.9.25) | Dashboard reliability rebaseline: preview rejects stale DOM stream updates and resnapshots on divergence; remote control bounded coordinates; taskRunId binding across reconnect | MEDIUM -- introduced "reject stale update" logic which could be over-rejecting after navigation |
| Phase 162.3 (v0.9.24) | Overlay lifecycle reliability: canonical overlay replay, heartbeats, dashboard resync | MEDIUM -- changed resync triggers |
| Phase 254-260 (v0.9.62) | Implicit visual-session contract, sliding-window timeout, SW eviction replay | LOW for streaming, but the alarm-prefix routing (`background.js:12916-12925`) is adjacent and worth re-reading |
| Phase 209-212 (v0.9.45rc1) | Remote control handlers (CDP click/key/scroll), QR pairing, agent sunset | MEDIUM -- 209's `ext:remote-control-state` and 210's pairing both share the same WS transport; agent-sunset commented out paths could have orphaned a `dash:agent-run-now` listener that the dashboard still calls (search dashboard code for that string) |

**Recommended diagnostic checklist for the final dashboard-streaming phase:**

1. Open dashboard + extension; verify `[WS]` connection logs show both extension and dashboard joining the same room.
2. Send `dash:dom-stream-start` from dashboard; verify in server console: `[WS] dashboard->extension room=... type=dash:dom-stream-start delivered=1 dropped=0`.
3. Verify in extension SW console: `[FSB WS] Received: dash:dom-stream-start` and subsequent `[FSB WS]` snapshot send.
4. Verify content script receives `domStreamStart`: add a `[DOM Stream] Start requested` log check (it's already at `dom-stream.js:974`).
5. Verify `ext:dom-snapshot` reaches relay then dashboard: server console `extension->dashboard ... type=ext:dom-snapshot delivered=1`.
6. If step 4 fails: the message router in `dom-stream.js` isn't running -- likely failure mode A or B above.
7. If step 5 fails delivered=0: relay has no dashboard in the room (room key mismatch / pairing hash drift).
8. If step 5 succeeds but dashboard doesn't render: client-side stream-state handling in `showcase/angular/src/app/pages/dashboard/**` (out of scope for this research; flag for the streaming-fix phase).

**Wire-format patterns to look for in `console.log` output (without running code):**

- `[WS] dashboard->extension room=XXXX type=dash:dom-stream-start delivered=0 dropped=0` -- extension not in room (pairing problem).
- `[WS] dashboard->extension room=XXXX type=dash:dom-stream-start delivered=1 dropped=0` then NO `[FSB WS] Received` line -- extension WS dropped the frame (parse error?). Check `handler.js:179-186` malformed-json branch and the extension-side parse path.
- `[FSB WS] Content script not ready on tab N -- injecting and retrying domStreamStart` then `[FSB WS] Failed to inject content script on tab N` -- restricted page (chrome://), or content script execution denied. Match against `_isStreamableTab` allowlist.
- `[FSB DOM] watchdog alarm fired (SW safety net)` AND no subsequent activity -- the watchdog fires but doesn't recover. This is the bug in `background.js:12942-12945` where the alarm handler only logs.

---

## Section 9: i18n Leakage (MINOR class)

### 9.1 (MINOR) -- Control panel "MCP" tab new strings

The v0.9.69 milestone adds: MCP request log rows, cost + token tracking strings, opt-out toggle label, first-run privacy banner copy.

**Decision recommendation:** Control panel surface is already deferred from i18n per v0.9.63 closeout (`lint:i18n --ignore-pattern src/app/pages/dashboard/**` carry-forward). FSB control panel is in `extension/ui/control_panel.html` -- NOT inside `showcase/angular/` so the i18n pipeline doesn't currently cover it. **Defer all new control-panel strings to v0.9.65 i18n** (which is also already deferred from v0.9.63 close).

**Caveat:** If region-gating per Section 2.1 is implemented (forcing EU users to see the banner before telemetry starts), the banner copy MUST exist in all 6 supported locales (en/es/de/ja/zh-CN/zh-TW) OR the EU users get an untranslated banner = poor UX + arguably non-compliant under GDPR (consent must be informed, which means in a language the user understands). Two paths:

1. **Conservative path:** translate the banner copy only (small surface: 1 paragraph + 1 button label + 1 toggle label), hand-fill the XLIFF entries in the extension, document a 1-off i18n mini-system in `extension/i18n.js` that reads `chrome.i18n.getUILanguage()` -- the standard Chrome extension i18n. No build-time XLIFF; use `_locales/<lang>/messages.json` per Chrome docs.
2. **Aggressive path:** defer the banner translation; ship English-only; accept that EU first-run UX is degraded.

Recommend path 1 for the privacy banner specifically (Section 2.1 region-gate would otherwise force users into untranslated UX); defer all other new control-panel strings.

### 9.2 (MINOR) -- `/stats` page strings

`/stats` is part of `showcase/angular` -- IS covered by the i18n pipeline. The new "FSB Telemetry" toggle group + aggregate labels need `i18n` markers and translations. Cost: ~20-30 new trans-units.

**Decision:** translate now -- `/stats` is public, fully part of the marketing surface, and `i18nMissingTranslation: error` will fail the build if strings are added without translations. Either AI-fill the 5 non-en locales (matching the v0.9.63 pattern) or wrap the whole telemetry block in a single feature flag that only renders for `en` locale until translations land. Recommend AI-fill in the same phase that ships `/stats`.

---

## Section 10: Cross-Cutting Privacy-Disaster Antipatterns (BLOCKER class -- code review gate)

These are specific code paths that, if shipped, would constitute a privacy disaster. Each must be explicitly checked in PR review for v0.9.69.

### 10.1 -- The 10-item code-review checklist

**1. Telemetry collector must NEVER touch `request.task`, `session.task`, `session.userMessage`, `conversationHistory`, `aiResponse`, or any field carrying user-typed text.**

- File path: `extension/telemetry/collector.js` (new file).
- Variable allowlist: `event_id, install_uuid, ts, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type`. NOTHING ELSE.
- Code review must grep the collector for `task`, `prompt`, `message`, `content`, `userMessage`, `messages` -- ZERO matches in source.

**2. Telemetry must NEVER capture URLs.**

- Code review grep targets in `extension/telemetry/`: `url`, `tab.url`, `window.location`, `document.URL`, `referrer`, `document.referrer`.
- ZERO matches allowed.

**3. Telemetry must NEVER capture clipboard contents.**

- The extension HAS `clipboardWrite` permission per `manifest.json:17`.
- Code review grep in `extension/telemetry/`: `clipboard`, `navigator.clipboard`, `chrome.clipboardWrite`, `execCommand('paste')`.
- ZERO matches allowed.

**4. Telemetry must NEVER capture form values or DOM payloads.**

- The DOM-stream module (`extension/content/dom-stream.js`) sends full DOM trees over WS to the dashboard via ROOM-keyed pairing. This is FINE because the dashboard is the SAME user.
- The telemetry collector must be in a SEPARATE module that has no access to DOM tree data. Specifically: `collector.js` must not `import` anything from `content/dom-stream.js`, `dom-snapshot.js`, or any selector/DOM module.
- Code review grep in `extension/telemetry/`: `serializeDOM`, `domSnapshot`, `formData`, `input.value`, `.value`, `getElementsBy`.
- ZERO matches allowed.

**5. Server must NEVER write plaintext IP to any disk-backed log, table, or file.**

- File path: `showcase/server/src/telemetry/route.js` (new), `showcase/server/server.js`, any `morgan` config.
- Code review grep: `req.ip`, `req.connection.remoteAddress`, `req.headers['x-forwarded-for']` -- if any of these appear, they MUST be wrapped in the hash function immediately and the raw value not retained beyond function scope.
- Reject any access-log middleware that touches `/api/telemetry/*` and writes IP to disk.

**6. Server must NEVER log the request body of `/api/telemetry/*` to disk.**

- Code review: ensure no `console.log(req.body)`, no `fs.appendFile` in the route handler, no `winston`/`pino` logger that captures body on this route.
- Allowed: in-memory ring buffer for diagnostics (similar to extension's `fsb_diagnostics_ring`) -- but only event metadata (count, type), NEVER content.

**7. Daily IP salt rotation must use crypto-strong random + persist across process restarts.**

- File path: `showcase/server/src/telemetry/salt.js` (new).
- Salt must be stored encrypted-at-rest OR in a separate DB table not exposed via any endpoint.
- Rotation cron: at UTC midnight, generate new salt; KEEP yesterday's salt for ~25 hours to handle clock-drift events with `ts` in the prior day.
- Salt MUST be at least 32 bytes from `crypto.randomBytes(32)`.

**8. UUID generation must be `crypto.randomUUID()` (uniform random), NOT timestamp-based.**

- File path: `extension/telemetry/install-uuid.js` (new).
- Code review: `crypto.randomUUID()` only. Reject `Math.random`, `Date.now()`, any hash-of-something pattern.
- UUID must be stored in `chrome.storage.local`, NOT `chrome.storage.sync` (sync would propagate across user's Chrome accounts and create cross-device linkability).

**9. Opt-out toggle must immediately stop ALL telemetry, including flushing the in-memory queue.**

- File path: `extension/telemetry/collector.js` or `extension/ui/options.js`.
- When user flips toggle to off: (a) immediately set `telemetryEnabled = false` in storage, (b) clear the queue (`chrome.storage.local.set({ fsb_telemetry_queue_v1: [] })`), (c) cancel the flush alarm (`chrome.alarms.clear('fsb-telemetry-flush')`).
- DO NOT send a final "user opted out" event. That itself is a tracking event.

**10. The "wipe my data" button (Section 1.3) must work without requiring re-auth and must respond to OPTIONS preflight without revealing whether the UUID exists.**

- File path: `showcase/server/src/telemetry/forget.js` (new).
- Always return 204 No Content regardless of whether the UUID had any rows.
- Use `DELETE FROM events WHERE install_uuid = ?` + `DELETE FROM daily_rollup` aggregates indexed by UUID -- but the aggregate rollup may not be UUID-indexed if we use the 7.1 pattern. Decision: rollups are best-effort -- they're aggregate, k-anonymized, and don't contain the UUID. Document that "wipe" deletes raw events but cannot retroactively de-influence aggregates (they reflected the user's data at the time, but the aggregate row itself has no UUID).

### 10.2 -- Additional disaster patterns to gate

**11. Don't add any 3rd-party CDN script to `/stats`.** No Google Fonts (FOIT + IP leak), no Cloudflare Insights, no Plausible-on-cdn, no Sentry browser SDK. Self-host everything.

**12. Don't read `chrome.identity.getProfileUserInfo` -- ever.** This is the user's Chrome account email. If FSB ever calls this (it doesn't today per a quick scan but worth gating), the entire "anonymous" claim collapses.

**13. Don't broadcast the telemetry payload over the existing `fsbWebSocket` relay.** That relay is room-keyed to the dashboard pairing -- if telemetry data accidentally goes through it, it's exposed to whoever shares the user's dashboard hash. Use a SEPARATE HTTPS POST endpoint; never `fsbWebSocket.send('ext:telemetry-event', ...)`.

**14. Don't include the FSB version string in the telemetry payload if it carries pre-release suffixes like `0.9.69-pr-foo`.** Pre-release versions are uniquely identifying for the developer running them. If you need version analytics, send only `MAJOR.MINOR.PATCH` (regex-stripped at client before send).

**15. Don't log MCP-client raw strings without canonicalization.** A custom client name "MyCustomMCPClient_v3_for_user_lakshman" goes straight to /stats public dashboard. Server-side: only accept MCP client values from an allowlist (Claude, ClaudeCode, Codex, Cursor, OpenClaw, Continue, Windsurf, VSCode, Other). Reject and 400 on anything else.

---

## Section 11: Phase-Specific Risk Allocation

Suggested mapping of pitfalls to milestone phases (per build-order in PROJECT.md: extension logging -> pricing -> collector -> ingest -> aggregates -> stats page -> streaming fix):

| Phase | Pitfalls to gate |
|---|---|
| MCP request logging in extension control panel | 9.1 (control panel i18n decision) -- decide & document |
| API pricing module | Minor: pricing-source provenance gate (each entry must cite a URL + date); no telemetry implications |
| Anonymous telemetry collector (extension) | 4.1 (storage-backed queue), 4.2 (alarm flush trigger), 4.3 (event_id UUID), 10.1 item 1-4 (payload allowlist), 10.1 item 8 (UUID source), 10.1 item 9 (opt-out semantics), 1.1 (listing copy update started here) |
| Telemetry ingestion (showcase server) | 5.1 (rate limit + size cap + schema validation), 5.2 (event_id UNIQUE constraint), 5.3 (disk fill mitigation), 6.1 (pragma setup), 6.2 (prepared statement + transaction), 10.1 item 5-7 (IP hashing + salt), 10.1 item 10 (forget endpoint) |
| Aggregation queries | 6.4 (index recommendations), 7.1 (rolling counter), 7.2 (caching + jitter), 7.3 (active-users definition), 3.1 (k-anonymity threshold k=5), 3.2 (active-agent bucketing), 3.3 (install-date weekly rounding) |
| /stats page | 9.2 ( /stats i18n -- AI-fill at ship time), 1.2 (privacy policy URL deployment), 2.2 (privacy policy content), 1.3 (delisting antipatterns -- final listing review), 2.1 (region-gate decision + EU acceptance) |
| Showcase dashboard streaming fix | 8.1 (failure modes A, B, C diagnosis -- pick the actual one with a runtime smoke), 8.2 (WS bug gates), 8.3 (regression-source phase review) |

**Release prep (not a coding phase but a gate):**
- 1.1 (CWS Privacy Practices declaration update)
- 1.2 (Limited Use disclosure on /privacy)
- 1.3 (full delisting-antipattern checklist)
- 2.2 (privacy policy URL coverage)
- 2.3 (CCPA non-sale statement)
- All of Section 10 (code-review checklist applied to every PR)

---

## Section 12: Detection / CI Gates Summary

| Gate | What it checks | Where |
|---|---|---|
| `scripts/verify-store-listing.mjs` | listing-copy.md data-collection section matches telemetry payload schema | New script; run in `ci / all-green` |
| `tests/telemetry-payload-schema.test.js` | Collector cannot stringify an event with extra fields; payload field allowlist locked | Root tests |
| `tests/telemetry-k-anonymity.test.js` | Aggregate queries suppress cells with <5 distinct UUIDs | showcase/server tests |
| `tests/telemetry-queue-persistence.test.js` | Queue survives simulated SW restart between enqueue and flush | extension tests |
| `tests/telemetry-event-id-uniqueness.test.js` | Replayed event_id is silently dropped at SQL layer | showcase/server tests |
| `tests/telemetry-rate-limit.test.js` | Burst of 100 POSTs/sec from one IP yields 429 after threshold | showcase/server tests |
| `tests/telemetry-no-pii-leak.test.js` | grep collector source for forbidden tokens (url, prompt, task, clipboard, formData, .value) | Static check |
| `tests/showcase-privacy-page.test.js` | `/privacy` returns 200 + contains literal disclosure strings | showcase/server tests |
| `tests/showcase-stats-cache.test.js` | Two parallel /stats requests share one underlying aggregate query | showcase/server tests |
| `tests/ws-dom-stream-handshake.test.js` | `dash:dom-stream-start` -> content-script -> snapshot loop completes < 2s on a fresh tab | integration test |

---

## Confidence Calibration

| Claim | Source | Confidence |
|---|---|---|
| CWS PII definition includes "any type of identification number" | Quoted verbatim from User Data FAQ (URL above) | HIGH |
| CWS Limited Use requires affirmative statement on extension website | Quoted verbatim from Limited Use Policy | HIGH |
| GDPR Article 4(1) includes "online identifier" in personal data definition | Quoted from gdpr-info.eu Art. 4 | HIGH |
| GDPR Recital 30 confirms UUIDs / cookies / IPs are online identifiers | Quoted from gdpr-info.eu Recital 30 | HIGH |
| ePrivacy Directive Article 5(3) sets opt-IN default for non-essential storage | Wikipedia summary + cross-referenced common practice | MEDIUM (recommend independent verification before EU rollout) |
| CCPA classifies UUIDs as personal information | oag.ca.gov definition is "could reasonably be linked"; UUID + behavior qualifies | HIGH (general); MEDIUM (whether opt-out posture is sufficient -- depends on whether FSB qualifies as a "business" under CCPA's revenue/user thresholds) |
| k=5 is a reasonable threshold for public dashboards | Common practice in published aggregate datasets; not a regulatory requirement | MEDIUM |
| better-sqlite3 WAL + NORMAL synchronous is corruption-safe | better-sqlite3 docs + SQLite docs <https://www.sqlite.org/wal.html#performance_considerations> | HIGH |
| chrome.alarms persists across SW eviction; storage.local queue is canonical pattern | Chrome dev docs + community pattern; FSB itself uses this pattern at background.js:12914 | HIGH |
| Streaming failure modes A/B/C diagnosis | Code-reading only, NOT verified at runtime | MEDIUM (these are PLAUSIBLE failure modes consistent with the symptom "streaming is broken"; the actual bug may be one of these, all of these, or a different bug. The streaming-fix phase MUST start with a runtime smoke to confirm which) |
| Phase 211 + 164 + 162.3 are the highest-regression-risk recent touches to streaming | MILESTONES.md grep + commit-message reading | MEDIUM |

---

## Open Questions / Gaps for Phase-Specific Research

- **Dashboard-side stream auto-restart on navigation:** I read the extension half only. The other half lives in `showcase/angular/src/app/pages/dashboard/**` and `showcase/server/`. Verify in the streaming-fix phase whether the dashboard listens for `ext:dom-ready` and re-issues `dash:dom-stream-start` automatically, or whether it depends on `ext:page-ready` which is only sent on `dash:request-status` from `_sendStateSnapshot`.
- **Backpressure measurement:** is `ws.bufferedAmount` ever observed > 0 in production? If yes, the relay needs an explicit backpressure-drop policy; if no, defer.
- **Pricing-table verification:** v0.9.69 hardcodes pricing per MCP client / model. Confirm 2026 Anthropic / OpenAI / xAI / Google prices at the pricing-module phase; document source URLs + retrieval date in the table comment.
- **Fly.io disk volume size:** confirm current allocation; with 90-day retention and worst-case 10k events/day per UUID across N users, project storage needs.
- **Whether existing showcase server has an access log that captures `/api/telemetry/*` POST bodies** (`morgan` is common). Find and audit before adding the route.

Sources:
- [Chrome Web Store User Data Policy & FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store Limited Use Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Chrome extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [GDPR Article 4 (definitions)](https://gdpr-info.eu/art-4-gdpr/)
- [GDPR Recital 30 (online identifiers)](https://gdpr-info.eu/recitals/no-30/)
- [CCPA -- California Attorney General overview](https://oag.ca.gov/privacy/ccpa)
- [ePrivacy Directive (EU Cookie Law)](https://en.wikipedia.org/wiki/EPrivacy_Directive)
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [SQLite WAL mode performance considerations](https://www.sqlite.org/wal.html#performance_considerations)
- [SQLite performance tuning -- phiresky](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/)
- [k-anonymity overview -- Wikipedia](https://en.wikipedia.org/wiki/K-anonymity)
- [express-rate-limit npm package](https://www.npmjs.com/package/express-rate-limit)
- [express-rate-limit troubleshooting proxy issues](https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues)
- [Building MV3 sync engines that survive service workers -- Stack Overflow blog](https://stackoverflow.blog/2026/05/12/building-a-google-drive-sync-engine-that-survives-mv3-service-workers)

# FSB Legal and Governance Posture

This document records FSB's legal/Terms-of-Service posture, its consent model, the
audit-log retention policy, and the service-denylist rationale. It is the
human-readable companion to the runtime controls shipped in Phase 30 (consent
governance, recipe signature verification, the no-secrets audit log, and the
service denylist).

Scope note: this is an engineering governance document, not legal advice. It
describes how FSB is built to behave and the boundaries it enforces.

## Automation Posture

FSB (Full Self-Browsing) is a **supervised, local-first** browser-automation
capability layer. The posture is deliberately conservative:

- **Default-OFF per origin.** No capability runs against a website (origin) until
  the user has explicitly enabled that origin. There is no global "enable all"
  switch. Automatic execution (Auto) is an explicit, per-origin opt-in.
- **Local execution.** Automation runs in the user's own authenticated browser
  session. FSB does not proxy a user's credentials to any server and does not
  replay captured credentials off-device.
- **Respect site Terms of Service.** FSB is a general-purpose automation tool;
  the operator is responsible for using it within the Terms of Service of the
  sites they automate. FSB ships a **service denylist** (below) that renders a
  conservative set of service categories non-enableable, and flags additional
  **sensitive** categories for extra confirmation even under Auto.
- **No code fetched as data.** Recipes are closed-vocabulary JSON data, not code.
  The recipe interpreter is dynamic-code-free, and server-delivered or learned
  recipes (a future capability) must pass cryptographic signature verification
  before they can bind to a credentialed call.

## Consent Model

Consent is enforced at a single dispatch chokepoint (one gate, both front doors),
immediately after the existing ownership gate. The shipped posture is **opt-out
("fully open")**: a global default mode applies to every origin the user has not
explicitly configured, and the user opts individual origins **out**. The global
default ships as **Auto** and is user-configurable (Off / Ask / Auto) under
Advanced Settings -> Consent & Audit -> "Default for New Sites".

| Mode | Behavior |
|------|----------|
| **Auto** (shipped default) | Capability invocations run without per-call prompting, including reads **and** writes, against any non-denylisted origin. |
| **Ask** | Each invocation surfaces a pending request out-of-band (control panel + a badge) for the user to grant; nothing runs until granted. There is no blocking in-page modal mid-invocation. |
| **Off** | Nothing runs against the origin. Capability invocations return a typed consent-required reason. Set an individual origin to Off to opt it out, or set the global default to Off to restore strict opt-in. |

Additional consent rules:

- **Denylist is the one hard block.** A denylisted origin (financial and
  government services -- see the service denylist below) is non-enableable
  regardless of the global default or any per-origin policy. The denylist is
  consulted **first**, before the consent mode.
- **Per-origin opt-out.** Every origin FSB acts on is listed in the control panel
  (sourced from the audit trail) so the user can set it to Off (or Ask) at any
  time. An explicit per-origin policy overrides the global default.
- **Writes are allowed under Auto.** Under the opt-out posture, read-Auto implies
  write-Auto: side-effecting invocations (POST/PUT/PATCH/DELETE) run without a
  separate elevated opt-in. The per-origin mutating flag is retained in storage
  but is not enforced at the invoke gate while the origin is Auto.
- **Sensitive-origin friction remains on discovery only.** Origins classified as
  **sensitive** (banking, primary email, government categories) no longer force
  extra confirmation at the capability **invoke** gate under Auto. The more
  invasive **network-capture discovery** path still requires an explicit
  confirmation for sensitive origins.
- **Reverting to opt-in.** Setting the global default to **Off** restores the
  strict opt-in posture: nothing runs against an origin until the user enables it.

> Security note: under the shipped Auto default, FSB can call any non-denylisted
> site's authenticated web API -- reads and writes -- using the browser's logged-in
> session, without a per-site prompt. This is a deliberate, user-configurable
> posture; the denylist, the per-origin and global opt-out, the active-tab origin
> pin, the fail-closed degradation path, and the append-only audit trail remain in
> force.

## Audit Log

Every capability invocation is recorded in an **append-only, secret-free** audit
log so the operator can review what ran.

### Recorded fields

The audit entry schema is, by construction, free of secrets and request payloads:

`{ timestamp, origin, capability slug, method, side-effect class, consent
decision, outcome, error? }`

### What is never recorded

The audit log **never** stores invocation arguments, request or response bodies,
cookies, tokens, CSRF values, bearer credentials, or any other authentication
material. Auth material never leaves the device and is never persisted. Every
recorded field additionally passes through a shape-only redactor before
persistence (URLs are reduced to their origin; strings to a shape descriptor;
errors to name and message only). A test asserts that no authentication substring
survives in the persisted log.

### Retention

The audit log is a **bounded ring buffer**: the most recent entries are retained
and older entries are trimmed automatically (FIFO). The user has an **export and
clear** control to export the current log and clear it on demand. The log is
secret-free by construction; encryption at rest is therefore unnecessary and is
out of scope. Long-term archival and deeper retention tooling are intentionally
deferred -- the bounded ring plus export/clear is the Phase-30 retention policy.

## Service Denylist

FSB ships a conservative service denylist at
`extension/config/service-denylist.json`, loaded at service-worker startup and
consulted before per-origin consent. It is the single source of truth for whether
an origin is **denied** or **sensitive**.

- **deniedOrigins** -- a conservative category seed (representative banking and
  government host patterns) where automation is categorically prohibited. A
  denylisted origin is rendered non-enableable: the consent gate blocks it even
  if a stored policy says Auto, and the control panel greys it out with the
  documented reason.
- **sensitiveOrigins** -- a conservative seed (banking, primary-email, and
  `*.gov` host patterns) that forces extra confirmation even under Auto but is
  not necessarily hard-denied.

The denylist is a **conservative category seed, not an aggressive broad
blocklist**, and it is **user-extensible**. Host patterns use a
`https://*.<domain>` subdomain-wildcard form (matching the apex and any
subdomain) or an exact origin. A comprehensive, per-service legal review is
ongoing; this seed establishes the mechanism and a safe default.

### Categorization Axes

An origin's classification is decided along **three distinct criteria**. These
axes are independent: an origin can be denied for finance/government reasons OR
for ToS-hostility reasons, and **sensitivity is a separate, softer tier** than
either denial axis. `service-denylist.js classify(origin)` is the single source
of truth that resolves an origin to denied / sensitive / safe.

1. **Finance / government denial.** Categorically-prohibited financial and
   government origins where automation is denied outright (the banking and
   government seed -- e.g. the representative banking host patterns and `*.gov`).
   Automation against these origins is non-enableable regardless of consent mode;
   the denylist is consulted first.

2. **ToS-hostility denial.** Origins denied because automating them violates the
   site's own Terms of Service. This axis is **distinct from finance
   sensitivity** -- the basis is contractual/legal hostility to automation, not
   the handling of money. The roster denied on this axis is:
   - brokerage / trading: **robinhood**, **fidelity**, **carta**
   - ToS-hostile media / social: **netflix**, **spotify**, **twitch**,
     **steam**, **youtube-music**, **tinder**, **onlyfans**

3. **Sensitivity (Ask / mutating-gated).** Allowed-but-sensitive origins
   (payments, budgeting, social, messaging) that are NOT denied. Reads run under
   Auto everywhere; a **write** to a sensitive origin re-enforces the per-origin
   mutating opt-in (posture B / DENY-04) before it is permitted. This is where
   **instagram**, **facebook**, **tiktok**, and **x** sit -- their writes are
   gated, but they are *sensitive, not denied* (reads remain available under
   Auto). Payments (e.g. `dashboard.stripe.com`, coinbase, twilio), budgeting
   (ynab), and messaging-app writes are classified on this axis as well.

The denial axes (1 and 2) make an origin non-enableable; the sensitivity axis (3)
keeps the origin usable but re-applies write-time friction. An import-time
classification gate fails the build if a sensitivity-suspect origin is left
unclassified, so a gap in the classification can never silently read as "allow".

## Recipe Integrity (Signature Verification)

Server-delivered and learned recipes (a future capability) are untrusted data and
must be **signature-verified** before they can bind to a credentialed call.
Verification uses Ed25519 over the RFC-8785 JCS canonical form of the recipe
provenance envelope, performed inside the interpreter after schema validation and
before binding. A tampered or unsigned non-bundled recipe is rejected with a typed
`RECIPE_SIGNATURE_INVALID` reason. Verification fails closed: if the platform
cannot perform Ed25519 verification, a non-bundled recipe is rejected rather than
trusted.

First-party bundled recipes (shipped and reviewed with the extension) are
trusted-by-provenance and exempt from the verify gate, so the bundled capability
head is unaffected. The trusted public key ships in the extension bundle; it is
never fetched remotely. The private signing key is offline.

## Contact

For questions about this posture or FSB's data handling, open an issue on the
project's GitHub repository.

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

- **Opt-out per origin.** The shipped default is Auto for non-denied origins, with
  per-origin Off / Ask / Auto controls. The user can opt any origin out, and can
  set the global default to Off to restore strict opt-in behavior.
- **Local execution.** Automation runs in the user's own authenticated browser
  session. FSB does not proxy a user's credentials to any server and does not
  replay captured credentials off-device.
- **Respect site Terms of Service.** FSB is a general-purpose automation tool;
  the operator is responsible for using it within the Terms of Service of the
  sites they automate. FSB ships a service policy file (below) that currently
  hard-denies Netflix and OnlyFans, and classifies additional sensitive categories
  for mutating-write gating and audit visibility.
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
| **Auto** (shipped default) | Capability invocations run without per-call prompting, including reads **and** writes, against any non-denylisted origin -- except that a **write to a sensitive origin** re-enforces the per-origin mutating opt-in at the invoke gate (posture B / DENY-04; see the Categorization Axes below). Reads, and writes to non-sensitive origins, run freely under Auto. |
| **Ask** | Each invocation surfaces a pending request out-of-band (control panel + a badge) for the user to grant; nothing runs until granted. There is no blocking in-page modal mid-invocation. |
| **Off** | Nothing runs against the origin. Capability invocations return a typed consent-required reason. Set an individual origin to Off to opt it out, or set the global default to Off to restore strict opt-in. |

Additional consent rules:

- **Denylist is the one hard block.** A denylisted origin is non-enableable
  regardless of the global default or any per-origin policy. The current hard
  denylist is intentionally narrow: Netflix and OnlyFans. The denylist is
  consulted **first**, before the consent mode.
- **Per-origin opt-out.** Every origin FSB acts on is listed in the control panel
  (sourced from the audit trail) so the user can set it to Off (or Ask) at any
  time. An explicit per-origin policy overrides the global default.
- **Writes to non-sensitive origins are allowed under Auto.** Under the opt-out
  posture, for a **non-sensitive** origin read-Auto implies write-Auto:
  side-effecting invocations (POST/PUT/PATCH/DELETE) run without a separate
  elevated opt-in, and the per-origin mutating flag is inert at the invoke gate.
  A **write to a sensitive origin is the exception**: it re-enforces the
  per-origin mutating opt-in at the invoke gate (posture B / DENY-04), so the
  mutating flag IS consulted there for sensitive origins (see the Categorization
  Axes section). Reads run under Auto everywhere.
- **Sensitive-origin writes are re-gated at the invoke gate; reads are not.**
  Origins classified as **sensitive** (banking, primary email, government, and
  the payments / budgeting / social / messaging categories below) run **reads**
  under Auto, but a **write** re-enforces the per-origin mutating opt-in at the
  capability **invoke** gate (posture B / DENY-04) before it is permitted. In
  addition, the more invasive **network-capture discovery** path keeps its own,
  broader explicit confirmation for sensitive origins. (Sensitive writes are NOT
  ungated under Auto -- the invoke gate re-applies the mutating opt-in for them.)
- **Reverting to opt-in.** Setting the global default to **Off** restores the
  strict opt-in posture: nothing runs against an origin until the user enables it.

> Security note: under the shipped Auto default, FSB can call a non-denylisted
> site's authenticated web API using the browser's logged-in session, without a
> per-site prompt -- reads everywhere, and writes to non-sensitive origins. A
> write to a **sensitive** origin is re-gated at the invoke gate (it re-enforces
> the per-origin mutating opt-in; posture B / DENY-04). This is a deliberate,
> user-configurable posture; the denylist, the per-origin and global opt-out, the
> sensitive-write re-gate, the active-tab origin pin, the fail-closed degradation
> path, and the append-only audit trail remain in force.

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

- **deniedOrigins** -- the hard block list. Current runtime policy intentionally
  narrows this to Netflix and OnlyFans. A denylisted origin is rendered
  non-enableable: the consent gate blocks it even if a stored policy says Auto,
  and the control panel greys it out with the documented reason.
- **sensitiveOrigins** -- allowed-but-governed origins. This includes banking,
  government, primary email, brokerage / trading, payments, money movement,
  social, messaging, media, AI-chat, commerce, travel, and other categories that
  require mutating-write gating and audit visibility but are not hard-denied.

The service policy is conservative without being an aggressive broad blocklist,
and it is **user-extensible**. Host patterns use a `https://*.<domain>`
subdomain-wildcard form (matching the apex and any subdomain) or an exact
origin. A comprehensive, per-service legal review is ongoing; the policy file
establishes the mechanism and the current default posture.

### Categorization Axes

An origin's classification is decided along **three distinct criteria**. These
axes are independent: an origin can be hard-denied, allowed-but-sensitive, or
safe. `service-denylist.js classify(origin)` is the single source of truth that
resolves an origin to denied / sensitive / safe.

1. **Hard denial.** Hard-denied origins are non-enableable regardless of consent
   mode. The current runtime hard-denied roster is intentionally narrow:
   **netflix** and **onlyfans**.

2. **Sensitive governance (Ask / mutating-gated).** Allowed-but-sensitive origins
   are not hard-denied. Reads run under Auto everywhere; a **write** to a
   sensitive origin re-enforces the per-origin mutating opt-in (posture B /
   DENY-04) before it is permitted. This is where banking and government hosts,
   primary email, brokerage / trading (**robinhood**, **fidelity**, **carta**),
   payments and money movement, budgeting, social, messaging, media, and AI-chat
   origins sit. For example, **instagram**, **facebook**, **tiktok**, and **x**
   are sensitive, not denied; their reads remain available under Auto and their
   writes are gated. Payments (e.g. `dashboard.stripe.com`, coinbase, twilio),
   Carta read-only portfolio/account data, budgeting (ynab), and messaging-app
   writes are classified on this axis as well.

   The **comms / social / content** import batch extends this axis. The AI-chat
   apps (**chatgpt**, **claude**) and the microblog / fediverse social apps
   (**bluesky**, **mastodon**, **threads**) are classified **sensitive** -- their
   reads run under Auto, their writes (post / send / publish) re-enforce the
   per-origin mutating opt-in. This is the **conservative default** for the
   category: an unknown social / AI app defaults toward LESS reach, because a
   mis-classification that read as "safe" would make the app writable-under-Auto
   (able to post or message on someone's account). These hosts contain no generic
   category keyword the import-time heuristic flags, so they are classified
   explicitly on this axis rather than relying on the heuristic to catch them.
   The **discord** messaging origin remains sensitive (writes mutating-gated).
   Media and social origins such as **spotify**, **twitch**, **steam**,
   **youtube**, **youtube-music**, and **tinder** are sensitive, not denied; their
   writes are gated and guarded as applicable. **netflix** and **onlyfans** remain
   hard-denied.

   Independent of this axis, every comms / social / content descriptor the batch
   imports is **DOM-only** (the conservative backing default): it is surfaced as a
   discovery-pending hit, never a confident API-invocable hit, and is never
   learn-seeded -- so a ToS-hostile or AI-chat app is never auto-driven through a
   fabricated API call from guessed auth.

3. **Payment / money-movement classification (the commerce / travel / misc
   batch).** The most-sensitive import batch is screened along a payment dimension
   layered onto these three axes, because **a payment-bearing op writable under Auto
   = money moved without consent** (an order placed, a card charged, a paid
   reservation booked). The classification follows the money:
   - **Payment-bearing commerce / travel / paid-booking origins -> sensitive.** Food
     delivery and rideshare (**doordash**, **ubereats**, **uber**, **lyft**,
     **grubhub**, **instacart**, **dominos**, **chipotle**), retail / marketplace
     checkout (**amazon**, **ebay**, **etsy**, **bestbuy**, **costco**, **walmart**,
     **target**, **craigslist**, **shopify**), and travel / transport paid bookings
     (**booking**, **airbnb**, **expedia**, **kayak**, **opentable**) are classified
     **sensitive** -- their reads run under Auto, their writes (place-order /
     checkout / book) re-enforce the per-origin mutating opt-in (posture B). This is
     the **conservative default** for the category: an unknown commerce / payment app
     defaults toward LESS reach (sensitive, never safe-writable). **opentable** is
     sensitive **unconditionally** -- an OpenTable reservation holds a card, so a
     held-card / paid reservation is payment-adjacent even when no "checkout" op is
     present.
   - **Pure money-movement apps -> sensitive.** Standalone peer-to-peer
     money-transfer / wallet apps (**paypal**, **venmo**, **cash app**, **wise**,
     **western union**) are sensitive, not hard-denied. Reads are allowed under
     Auto; mutating actions are gated by the sensitive-origin write path and by
     the payment-op guard.
   - **Read-only commerce browsing -> safe.** Pure-availability or read-only apps
     whose vendored ops are all reads (**calendly** availability links, **yelp** /
     **tripadvisor** business search, **zillow** listings, **grafana** dashboards)
     stay **safe** (unclassified, reads run under Auto). The import-time heuristic's
     payment tokens are deliberately SPECIFIC (checkout / cart / place-order / charge,
     NOT a bare order / book / reserve) so a benign commerce read is not false-tripped;
     a safe commerce origin is added to the read-only-safe invariant set ONLY when its
     emitted ops are verified read-only.

   What makes **money-movement-under-Auto impossible** is the payment-origin gate,
   established for this batch before any payment descriptor lands: (a) payment
   origins are **sensitive** (posture-B gated); (b) an import-time
   **payment-op CI guard** fails the build if any payment-bearing
   op (checkout / pay / place_order / charge / complete_booking / buy_tickets /
   book_flight / request_ride / place_bid / create_order / ...) is ever classified
   on an **ungated origin**. A payment write therefore can only flow on a sensitive
   origin, where the per-origin mutating opt-in re-gates it, or not ship at all.

The hard-denial axis makes an origin non-enableable; the sensitivity axes keep an
origin usable but re-apply write-time friction. An import-time classification
gate fails the build if a sensitivity-suspect origin is left unclassified, so a
gap in the classification can never silently read as "allow".

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

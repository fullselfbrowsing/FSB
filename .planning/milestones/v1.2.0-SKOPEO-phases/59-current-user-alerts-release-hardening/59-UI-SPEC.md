---
phase: 59-current-user-alerts-release-hardening
created: 2026-08-27
status: approved_for_planning
shell: existing-skopeo-shadow-rail
---

# Phase 59 — UI Design Contract

## Experience Boundary

Phase 59 adds one concise local-alert status to the existing folder and reading HUDs, one explicit owner-mapping consequence flow, and one native Chrome system notification. It does not create a notification center, preferences application, persistent badge, host-page decoration, detached contract app, new Shadow root, new lifecycle owner, or team-delivery UI.

The host remains the work surface. The system notification is a reminder with a fresh route back to governing evidence, not a claim that notice was sent or a legal action was completed.

## Existing Visual System

Reuse the Phase 57/58 384px rail, typography, colors, spacing, section cards, native controls, focus boundary, one polite live region, narrow stacking, forced-colors behavior, reduced-motion behavior, collision certificate, and teardown ledger. All Phase 59 host-rendered copy uses literal `textContent` and bounded local enum-to-copy maps.

## Alert Status Placement

### Folder vendor card

Replace the neutral `Notification delivery · Not evaluated` slot with `Local deadline alert` only when a current vendor has alert evidence or a deliverability explanation. Keep it after `Next material date` and before gap details so date and delivery meaning remain adjacent.

### Agreement reading rail

Render `Local deadline alert` inside `Policy and delivery status`, after policy/memo safeguards. Historical or superseded documents may show current-vendor alert status only when the projection clearly identifies it as governing-state-derived; the open historical document never becomes alert authority.

## Closed Status Copy

| State | Primary copy | Required detail |
|---|---|---|
| `scheduled` | `Local alert scheduled` | `For {alert civil date} · 90 days before the governing notice deadline.` |
| `attempted` | `Local alert attempt recorded` | `Chrome did not confirm completion before the worker stopped. Skopeo will not claim delivery.` |
| `delivered` | `Local alert delivered` | `Delivered to this Chrome user on {alert civil date}.` |
| `failed` | `Local alert failed` | Closed recovery reason, never raw API/error text. |
| `missed` | `Local alert missed` | `The 90-day alert date passed before a current delivery could be confirmed.` |
| `not-locally-deliverable` | `Not locally deliverable` | Exact closed reason: owner absent, owner ambiguous, owner not mapped here, current user differs, evidence incomplete, or notification unavailable. |
| `not-evaluated` | Omit alert section | No placeholder when no eligible governing notice deadline exists. |

Never use `Owner notified`, `Notice sent`, `Reminder guaranteed`, `On time` without durable delivered evidence, or language implying email/team delivery.

## Owner Mapping Flow

When one exact current owner relation is visible and current account authority is fresh, show the neutral action `Map me to this owner for local alerts`. The accessible name includes the bounded owner label. The action opens the existing Interstitial confirmation surface:

- eyebrow: `LOCAL ALERT RECIPIENT`;
- title: `Map this owner to me`;
- body: `Local deadline alerts for {owner label} in this enrolled corpus will be delivered only to this Chrome user after fresh evidence checks.`;
- safe action: `Keep current recipient mapping`;
- confirm action: `Map me for local alerts`.

Removal uses:

- title: `Remove my owner mapping`;
- body: `Future local alerts for {owner label} will become not locally deliverable. This does not change the agreement or contact the owner.`;
- safe action: `Keep my owner mapping`;
- confirm action: `Remove my owner mapping`.

Mapping actions are omitted for absent, ambiguous, inaccessible, stale, or undisclosable owner identity. No control accepts a typed email, user name, owner label, Drive ID, or recipient ID.

## Native System Notification

Use one `basic` Chrome notification:

- title: `{vendor} · notice deadline`;
- message: `{exact deadline} · {consequence}`;
- context message: `Owner: {owner} · Governing evidence: {source label}`;
- bundled FSB icon;
- one action where supported: `Open governing evidence`.

The notification contains no raw URL, file ID, account/corpus key, revision, source count, prompt/provider text, inaccessible identity, or unrelated vendor information. Clicking the body or evidence action performs fresh background reauthorization before navigation. Closing/dismissing a delivered notification does not rewrite delivery as failed.

## Accessibility and Interaction

- Status uses a semantic heading plus plain paragraphs/list rows; color is never the sole state indicator.
- Mapping controls are native buttons with visible focus and at least 40px target height.
- Confirmation receives safe-action focus first and remains inside the existing Focused/Interstitial focus boundary.
- Status refresh announces only a new current terminal state once; background alarm delivery never steals host-page focus or raises the HUD automatically.
- At narrow width and 200% zoom, status copy wraps and actions stack; no horizontal scroll or host-control overlap.
- Forced colors preserves borders/focus/status words; reduced motion disables nonessential transition.
- Escape/cancel returns to the prior current rail without changing mapping. Hide/kill/navigation withdraws UI actions but does not erase a legitimately durable schedule.

## Failure and Privacy Contract

- Missing/ambiguous/different owner is explicit but reveals no undisclosed owner identity.
- Permission-negative or inaccessible evidence yields generic closed copy and no hidden source label/count.
- Notification API failure is `Local alert failed · Chrome could not create the local notification. Reopen Skopeo after access is restored.`
- Replayed/stale mapping or evidence actions have no visible side effect; the current rail refreshes or closes.
- A superseded schedule never remains presented as current and its alarm/notification IDs cannot operate on the replacement.

## Browser and Human Review Matrix

Automated browser coverage must include scheduled, delivered, failed, missed, absent/different owner, mapping confirmation/removal, duplicate reconcile, delayed alarm, stale action, narrow, 200% zoom, forced colors, reduced motion, focus restoration, host collision, hide, kill, route replacement, and exact teardown.

Human review remains required for notification usefulness on macOS, VoiceOver phrasing/order, Drive/Docs coexistence, and authorized live evidence navigation. These remain `human_needed` until observed.

## Requirement Traceability

| Requirement | UI evidence |
|---|---|
| ALERT-01 | Scheduled/delivered copy states exact 90-day governing-notice relationship. |
| ALERT-02 | Explicit not-locally-deliverable reasons and no false owner-notified claim. |
| ALERT-03 | Native notification includes vendor, deadline, consequence, owner, and evidence. |
| ALERT-04 | Superseded/stale/failed states and fresh navigation authorization. |
| ALERT-05 | Persistent closed lifecycle states visible in the current HUD. |
| VERIFY-03 | Existing lifecycle/geometry/accessibility/teardown contract extended. |
| VERIFY-04 | Live notification/Drive/Docs/PDF observations remain human evidence. |
| VERIFY-05 | Hostile text, stale/replayed action, duplicate notification, and cross-vendor negatives. |

# Chrome Web Store Privacy Practices — Evidence

**Purpose:** in-repo source-of-truth documenting which checkboxes must be ticked on the Chrome Web Store Developer Dashboard Privacy Practices tab when v0.9.69 of FSB is published, with the justification for each choice and the verbatim Limited Use compliance statement. This file is referenced by the CI guard `scripts/verify-store-listing.mjs` and is the artifact the human publisher uses at publish time.

## Checkbox decisions

| Field on CWS Developer Dashboard                        | Action      | Justification |
| ------------------------------------------------------- | ----------- | ------------- |
| **Personally identifiable information**                 | **TICK**    | FSB generates a per-install UUID (`fsbInstallUuid`) which under the Chrome Web Store User Data FAQ counts as a regulated identification number even though it is never tied to a natural-person identity. We declare it transparently. |
| **Health information**                                  | DO NOT TICK | FSB never touches health data. |
| **Financial and payment information**                   | DO NOT TICK | FSB keeps no card data. Card details are read from the user's own 1Password by FSB's local server only to fill a checkout form, passed to the extension over the paired loopback connection, and never stored by FSB, sent to FSB-operated infrastructure, or shown to the model provider. |
| **Authentication information**                          | DO NOT TICK | API keys stored in the extension are encrypted locally with AES-GCM and are never transmitted to FSB-operated infrastructure — they are sent only as authorization headers to the model provider the user configured. They are not part of the telemetry surface. Passwords and one-time codes come from the user's own 1Password the same way, only to fill a sign-in form; FSB stores none of them and never sends them to FSB-operated infrastructure or the model provider. |
| **Personal communications**                             | DO NOT TICK | Prompts and instructions are not collected. |
| **Location**                                            | DO NOT TICK | No geolocation is collected. The request IP is hashed with a daily-rotating salt on the server for rate limiting and immediately discarded; plaintext IPs are never stored. |
| **Web history**                                         | DO NOT TICK | FSB never collects page URLs, hostnames, or any browsing history beyond ephemeral in-memory state needed to perform the current automation step. The telemetry pipeline carries zero URL data. |
| **User activity**                                       | DO NOT TICK | Mouse-movement and keystroke patterns are never sent off-device. Per-session token counts are aggregate numerical totals only, not behavioral activity logs. |
| **Website content**                                     | DO NOT TICK | Page DOM, screenshots, page content, and AI responses are never sent off-device. |
| **Privacy Policy URL**                                  | SET to `https://full-selfbrowsing.com/privacy#telemetry-disclosure` | Anchor on the FSB website privacy page describing the telemetry surface in full. |
| **Limited Use certification**                           | **TICK**    | See Limited Use compliance statement below. The verbatim CWS-compliant phrasing is also rendered on the published privacy page (i18n IDs `@@PRIVACY_TELEMETRY_LIMITED_USE_*`). |

## Limited Use compliance statement (verbatim)

> "FSB's anonymous usage telemetry is used only to compute aggregate usage statistics displayed publicly at full-selfbrowsing.com/stats. The data is never sold, never shared with third parties, never used for advertising, and never used to train any machine-learning models. This commitment satisfies the Chrome Web Store's Limited Use requirement."

This exact phrasing appears in three places:
1. The published privacy page at `https://full-selfbrowsing.com/privacy#telemetry-disclosure` (i18n trans-unit `@@PRIVACY_TELEMETRY_LIMITED_USE_TEXT`).
2. The CWS listing-copy.md "Data Collection" section.
3. This evidence file (above).

No paraphrasing or word-by-word substitution of the "never sold / shared / used for advertising / used to train ML models" clause is permitted.

## Screenshots to capture at publish time

The human publisher should capture the following screenshots from the live CWS Developer Dashboard Privacy Practices tab once the form is filled but BEFORE submitting, and store them next to this file:

- `screenshots/privacy-01-data-types.png` — full "Single Purpose" / "What user data does your extension handle?" section showing the "Personally identifiable information" box ticked and all other Personal Data boxes unticked.
- `screenshots/privacy-02-data-use.png` — the "How will the collected data be used?" radio buttons showing only telemetry-aggregation-related uses ticked.
- `screenshots/privacy-03-policy-url.png` — the Privacy Policy URL field populated with `https://full-selfbrowsing.com/privacy#telemetry-disclosure`.
- `screenshots/privacy-04-limited-use.png` — the Limited Use certification checkbox in the ticked state.
- `screenshots/privacy-05-final-summary.png` — the final review/confirmation screen before submitting.

These screenshots provide an audit trail; the in-repo source-of-truth for what they should depict is the table above.

## Workflow at publish time

1. Open the Chrome Web Store Developer Dashboard for the FSB item.
2. Navigate to the Privacy Practices tab.
3. Tick **Personally identifiable information** under "What user data does your extension handle?".
4. Provide the Privacy Policy URL: `https://full-selfbrowsing.com/privacy#telemetry-disclosure`.
5. Tick the **Limited Use** certification.
6. Save the Privacy Practices tab.
7. Capture the five screenshots listed above and commit them into `store-assets/chrome-web-store/screenshots/`.
8. Submit the listing.

## Cross-references

- Privacy policy section: `showcase/angular/src/app/pages/privacy/privacy-page.component.html` (anchor `#telemetry-disclosure`).
- CWS listing copy: `store-assets/chrome-web-store/listing-copy.md` (section "Data Collection").
- Backend opt-out + erasure endpoints: Phase 273 (`POST /api/telemetry/forget`, `Sec-GPC` header support).
- Extension toggle (kill switch): Phase 269 (Control Panel → Advanced Settings → "Send anonymous usage data").
- /stats publication: Phase 274 (`fsbtelemetry` service + showcase /stats page).
- CI guard for this document: `scripts/verify-store-listing.mjs`.

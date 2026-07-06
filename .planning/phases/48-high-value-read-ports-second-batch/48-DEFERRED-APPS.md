# Phase 48 Deferred App Notes

Phase 48 did not activate Pattern-D, GAPI, token-scraping, or unreviewed mutation paths. Deferred apps are intentionally classified by blocker type rather than treated as ready.

## Denied / ToS-Sensitive

The regenerated readiness matrix has 194 blocked descriptors. Apps with all descriptors blocked include:

| App | Descriptors | Reason |
|-----|------------:|--------|
| `carta` | 20 | denied / sensitive finance data |
| `fidelity` | 13 | denied / sensitive finance data |
| `netflix` | 18 | ToS-sensitive consumer content account |
| `onlyfans` | 21 | denied / sensitive adult content |
| `robinhood` | 23 | denied / sensitive finance/trading data |
| `spotify` | 21 | ToS-sensitive consumer media account |
| `steam` | 15 | ToS-sensitive consumer account |
| `tinder` | 16 | denied / sensitive dating account |
| `twitch` | 14 | ToS-sensitive consumer content account |
| `youtube` | 18 | ToS-sensitive consumer content account |
| `ytmusic` | 15 | ToS-sensitive consumer media account |

## Cross-Origin Unsafe

Pattern-D candidates remain disabled by Phase 47 because their authenticated APIs are separate-origin, per-org, or token-bound. Representative apps:

- `airtable`
- `asana`
- `aws`
- `azure`
- `clickup`
- `confluence`
- `datadog`
- `jira`
- `linear`
- `posthog`
- `salesforce`
- `sentry`
- `shopify`
- `zendesk`

## Auth Unavailable / Token Bridge Needed

These apps were inspected but not promoted because the runtime requires page globals, local storage, CSRF headers, Basic Auth tokens, or a not-yet-approved bridge:

| App | Reason |
|-----|--------|
| `cloudflare` | page bootstrap token required |
| `meticulous` | GraphQL/session bridge needs review |
| `retool` | XSRF cookie/header path needs review |
| `stripe` | page/session API key path is sensitive and needs review |
| `supabase` | bearer-token API on separate origin |
| `twilio` | Account SID/Auth Token path on separate origin |

## GAPI Bridge Needed

Google Workspace apps remain discovery-pending until a GAPI consent/page bridge is designed and approved:

- `gmail`
- `gdrive`
- `gdocs`
- `gsheets`
- `gcalendar`

## Live-UAT Missing

The new Vercel and extended CircleCI reads are unit/gate verified but not live-credential UAT verified in this phase. They should be smoke-tested from a logged-in tab before marking human UAT complete.

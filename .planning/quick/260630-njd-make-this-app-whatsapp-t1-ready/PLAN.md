---
quick_id: 260630-njd
slug: make-this-app-whatsapp-t1-ready
status: complete
---

# Make This App WhatsApp T1-ready

## Scope

Promote the WhatsApp catalog stem from DOM/discovery-only to explicit T1 accounting:

- Non-mutating WhatsApp read descriptors resolve through a reviewed same-origin T1a handler pinned to `https://web.whatsapp.com`.
- The handler uses a constrained page-read primitive for WhatsApp Web's in-memory module store rather than fabricating nonexistent REST endpoints.
- WhatsApp write/destructive descriptors are registered as guarded fail-closed rows until live mutation-body UAT exists.
- Search readiness, readiness reports, origin/cap gates, and focused handler tests recognize the WhatsApp surface.

## Implementation

1. Add a fixed WhatsApp page-read primitive to the capability fetch/router context.
2. Add `catalog/handlers/whatsapp.js` and sync it to `extension/catalog/handlers/whatsapp.js`.
3. Wire the handler into the head manifest/imports and update T1 readiness/search/port/allowlist/origin gates.
4. Correct WhatsApp descriptor side-effect classes for mutation-like operations and regenerate the extension catalog snapshot plus readiness report.
5. Run focused gates covering handler behavior, guarded fail-closed rows, head manifest, readiness, and the port contract.

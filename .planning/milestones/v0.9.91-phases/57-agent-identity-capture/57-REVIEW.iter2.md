---
phase: 57-agent-identity-capture
reviewed: 2026-07-12T13:56:59Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - extension/background.js
  - extension/ui/onboarding.js
  - extension/utils/agent-registry.js
  - extension/utils/mcp-agent-providers.js
  - extension/utils/mcp-client-aliases.js
  - extension/ws/mcp-bridge-client.js
  - extension/ws/mcp-tool-dispatcher.js
  - mcp/src/agent-scope.ts
  - mcp/src/client-inventory.ts
  - mcp/src/index.ts
  - mcp/src/runtime.ts
  - mcp/src/types.ts
  - package.json
  - tests/agent-scope.test.js
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/mcp-agent-providers-storage.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-client-identity-integration.test.js
  - tests/mcp-client-identity.test.js
  - tests/mcp-client-inventory.test.js
  - tests/mcp-client-merged-view.test.js
  - tests/mcp-version-parity.test.js
  - tests/onboarding-agent-provider-clicks.test.js
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-07-12T13:56:59Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

The Phase 57 identity, inventory, storage, bridge, onboarding, and merged-query changes were reviewed at standard depth. The additive wire handling and failure isolation are generally sound, but the durable connected map does not honor the canonical-key contract. A second issue allows specially named evidence keys to trigger JavaScript's `__proto__` setter and disappear from storage. Both defects are localized to `mcp-agent-providers.js` and should be fixed before Phase 58 relies on this data as its provider-selection ground truth.

## Warnings

### WR-01: Connected aliases are persisted under raw names and can surface stale evidence

**File:** `extension/utils/mcp-agent-providers.js:92-101,198-201`
**Issue:** `recordConnected()` keys durable records with only lowercase/whitespace normalization (`claudecode`, `anthropicclaude`, and `claude`), even though all three names resolve to the canonical `claude-code` id. A client that reconnects under a valid name variant therefore creates multiple durable rows instead of updating one row. `getMergedClients()` later maps those rows onto one canonical output slot in lexicographic key order, so the last key wins regardless of `lastSeenAt`; an older connection can overwrite newer evidence. This violates the Phase 57 canonical-key and reconnect-update contracts and can feed stale status/version data into Phase 58.
**Fix:** Resolve known names through `FsbMcpClientAliases.resolveMcpClientAlias()` before writing and use the canonical id as the durable key. Prefix unmapped identities with a safe raw namespace. When reading existing data, coalesce legacy raw-name keys by canonical id and retain the record with the greatest finite `lastSeenAt`. Add a regression that connects the same client under two aliases with different timestamps and asserts one durable canonical row containing the newest record.

### WR-02: Untrusted evidence keys can invoke the `__proto__` setter and be dropped

**File:** `extension/utils/mcp-agent-providers.js:97-102,108-126`
**Issue:** Both connected names and installed platform ids are assigned as dynamic properties on ordinary `{}` maps. A JSON-supplied platform id or normalized client name equal to `__proto__` invokes the inherited setter instead of creating an enumerable own property. The subsequent normalize/clone/write pass drops that evidence, and the intermediate map's prototype is unexpectedly changed. For connected identities this also breaks the requirement that novel client names remain visible.
**Fix:** Store dynamic evidence in null-prototype maps (`Object.create(null)`) with clone helpers that preserve enumerable own entries, or write keys with `Object.defineProperty`. Canonicalizing known names and prefixing unknown names (for example, `raw:<normalized>`) further prevents special-property collisions. Add `__proto__` regression cases for connected and installed input and assert the records survive as own enumerable entries without altering map prototypes.

---

_Reviewed: 2026-07-12T13:56:59Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

---
status: complete
updated: 2026-06-15
---

# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## phase-11-sidepanel-reopen-empty — Sidepanel reopen renders empty chat (boot hydrate path missing)
- **Date:** 2026-06-08
- **Error patterns:** sidepanel reopen empty chat, conversationId bound but messages dont render, per-tab envelope, no auto-restore on boot, dead scaffolding recoverLatestThreadTerminalOutcome, undeclared historySessionId activeConversationId lastRenderedTerminalSessionId, persistSidepanelThreadState never defined, fsbSessionLogs fsbSessionIndex commands completionMessage
- **Root cause:** Pre-existing UX gap surfaced by Phase 11's per-tab conversation envelope. Sidepanel boot path never wired a chat-restoration call after initTabConversationStore. A scaffolding function (recoverLatestThreadTerminalOutcome) existed but was never invoked AND referenced four module-scope symbols (historySessionId, activeConversationId, lastRenderedTerminalSessionId, persistSidepanelThreadState) that were never declared / defined. RESOLVED Open Question #3 in 11-RESEARCH.md assumed "the existing post-migration boot path already restores the chat surface" but no such path existed.
- **Fix:** (a) Declare the missing module-scope thread state vars + add no-op persistSidepanelThreadState stub. (b) Add hydrateChatFromConversationId(convId) helper that reads fsbSessionLogs + fsbSessionIndex, filters by conversationId, sorts ascending by startTime, replays session.commands[] as user messages and session.completionMessage as ai completion. (c) Wire into DOMContentLoaded after initTabConversationStore -- welcome suppressed when hydrate count > 0. (d) Wire into swapToTabConversation for tabs with bound convId. (e) Update RESOLVED #1 + #3 in 11-RESEARCH.md inline.
- **Files changed:** extension/ui/sidepanel.js, .planning/phases/11-tab-aware-side-panel-surface/11-RESEARCH.md
---

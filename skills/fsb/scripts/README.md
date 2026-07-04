# scripts/ -- placeholder

Status: scaffolded by Phase 248. Script files are filled in Phase 249.

Phase 249 adds three Node `.mjs` scripts: doctor.mjs (wraps `npx -y fsb-mcp-server doctor`), print-stdio.mjs (sources canonical OpenClaw stdio block from `mcp/src/install.ts` `getSetupSections()`), install-host.mjs (detect-list-confirm flow over `npx -y fsb-mcp-server install --list`).

No `.sh` / `.cmd` siblings; cross-platform Node only. ASCII only; no emojis. See repo CLAUDE.md.

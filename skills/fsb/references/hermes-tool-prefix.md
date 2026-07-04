# FSB on Hermes -- tool naming

Hermes auto-prefixes imported MCP tools with the server's name. The FSB MCP server registers as `fsb` (see `~/.hermes/config.yaml` `mcp_servers.fsb`), so every FSB tool surfaces inside Hermes as `mcp_fsb_<tool>`. The prefix is applied by Hermes at import time; the FSB MCP server itself still exports the bare tool names (`click`, `read_page`, etc.), so cross-references in this skill and in the v0.9.62 contract continue to use the bare names.

## Examples

| FSB tool | Hermes-side name |
| --- | --- |
| click | mcp_fsb_click |
| type_text | mcp_fsb_type_text |
| read_page | mcp_fsb_read_page |
| get_dom_snapshot | mcp_fsb_get_dom_snapshot |
| execute_js | mcp_fsb_execute_js |

## Scope

- This is a Hermes-side naming convention; the FSB MCP server still exports the bare names.
- The v0.9.62 field bundle (`visual_reason`, `client`, optional `is_final`) is unchanged. See `references/visual-session-lifecycle.md` and `references/v0.9.62-contract-mirror.md`.
- Pass `client: "Hermes"` on action calls. The label was added to the v0.9.36 shared allowlist in FSB v0.9.69 (PR #49), so action calls accept normally and do not reject with `BADGE_NOT_ALLOWED`.

## See also

- `references/visual-session-lifecycle.md` -- v0.9.62 implicit contract: field bundle, sliding window, typed-error recovery.
- `references/v0.9.62-contract-mirror.md` -- mirror of the canonical 36 action / 15 read-only / 3 typed-error names.
- `references/tool-decision-tree.md` -- read-only-first decision tree (the `## On Hermes` subsection links back here).

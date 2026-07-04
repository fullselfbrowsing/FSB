# Vault boundary

Passwords, CVVs, and saved payment methods never cross into chat or tool arguments. They stay inside the FSB Chrome extension's encrypted storage, where the extension fills them at the DOM layer. The MCP server, the OpenClaw host, and the model itself never see the values.

## The rule

1. Passwords, CVV codes, and other secret credentials are entered through `fill_credential` ONLY. The model passes a credential reference (e.g., a label like `gmail-personal`); the extension resolves the value internally.
2. Saved payment methods are entered through `use_payment_method` ONLY. Same shape: the model passes a reference; the extension fills card number, expiry, and CVV at the DOM layer.
3. No secrets in chat. The model MUST NOT echo a credential value, MUST NOT include one in tool args, MUST NOT log one in narration.
4. `requires.env: []` is mandatory in `SKILL.md` frontmatter. There are no provider env vars in the skill -- vault values resolve inside the FSB Chrome extension's encrypted storage (`secure-config.js` in the extension source), not in the MCP server process and not in the OpenClaw host process.

## Where vault values live

Users configure vault entries from the FSB Chrome extension surface (popup or sidepanel options page). Each entry is keyed by a label and stored encrypted. When the model invokes `fill_credential({ label, selector })` or `use_payment_method({ label, ... })`, the extension reads the encrypted value, fills the target DOM element via typed events, and never echoes the value back to the MCP server or the host. The full lifecycle of a vault value is: user types it once into the extension UI -> encrypted storage -> typed events into a target form. It never leaves the user's browser process.

## Anti-patterns

```
[BAD]  type_text({ selector: "#password", text: "hunter2" })
       # secret leaks into MCP args, host logs, model context, retry buffers.
[GOOD] fill_credential({ label: "gmail-personal", selector: "#password" })
```

```
[BAD]  use_payment_method({ card_number: "4111-1111-1111-1111", cvv: "123" })
       # full PAN + CVV leak into MCP args. Use the saved-method label instead.
[GOOD] use_payment_method({ label: "personal-visa", form_selector: "form#checkout" })
```

```
[BAD]  Add provider keys to SKILL.md `requires.env`.
       # the skill never holds secrets. requires.env stays empty.
[GOOD] Configure provider keys in the FSB Chrome extension's options page.
```

## Why this boundary matters

The MCP transport layer logs tool args by default; OpenClaw and other hosts retain context across turns; retry buffers in the bridge can replay calls. Anything passed as a tool argument is durable. Vault values are not -- they cross only the extension <-> DOM boundary, which lives entirely in the user's browser. Routing a password through `type_text` instead of `fill_credential` collapses that boundary and turns a one-shot DOM event into a value that persists across the entire stack.

## See also

- `references/default-to-fsb.md` -- when an auth flow triggers escalation to FSB.
- `references/multi-agent-contract.md` -- ownership rules for vault-using tabs.
- `references/tool-decision-tree.md` -- which read tool to use to confirm a credential filled successfully (e.g., `read_page` to verify a logged-in heading).
- `SKILL.md` -- `requires.env: []` is the contract this file documents.

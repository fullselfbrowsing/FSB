# Vault boundary

FSB has no password vault of its own. Logins and credit cards come from the user's 1Password account, limited to the 1Password vaults the user allowed FSB to read. Passwords, one-time codes, card numbers, and CVVs never cross into chat, tool arguments, or tool results. The model only ever sees ids, titles, site domains, usernames, and card brand plus last 4 digits.

## The rule

1. Logins are entered through `fill_credential` ONLY. The model passes nothing secret: FSB picks the 1Password login whose saved website matches the tab's real URL. If several logins match, the call fails and returns the candidates (id, title, username); call again with `credential_id` set to one of those ids, or to an id from `list_credentials`.
2. One-time (TOTP) codes use the same tool. When the page shows a two-factor code field and the 1Password item has a one-time password, `fill_credential` fills the current code. Call it again on the code page after submitting the password.
3. Credit cards are entered through `use_payment_method` ONLY, with a `payment_method_id` from `list_payment_methods`. FSB asks the user to approve the card (brand, last 4, merchant site from the tab URL) before it reads the card from 1Password and fills it. It never submits the payment.
4. No secrets in chat. The model MUST NOT echo a credential value, MUST NOT include one in tool args, MUST NOT log one in narration.
5. `requires.env: []` is mandatory in `SKILL.md` frontmatter. The skill holds no secrets and no provider env vars. 1Password access is configured once in FSB (Passwords settings or `npx fsb-mcp-server onepassword`), not in the agent host.

## Where values live and how they move

1. The user keeps logins and cards in 1Password and allows FSB to read specific vaults (a vault used only by FSB is safest).
2. The FSB local server (fsb-mcp-server) signs in to 1Password through the 1Password desktop app, which asks the user to approve FSB, or with a 1Password service account the user set up.
3. For a fill, the FSB extension takes the site from the agent's tab URL and asks the local server for a matching item over the paired, loopback-only bridge.
4. The extension types the values into the page. The tool result reports which fields were filled, never the values.

The values are never returned to the MCP client, the agent host, or the model.

## Anti-patterns

```
[BAD]  type_text({ selector: "#password", text: "hunter2" })
       # secret leaks into MCP args, host logs, model context, retry buffers.
[GOOD] fill_credential({})
       # FSB picks the 1Password login saved for this site.
[GOOD] fill_credential({ credential_id: "<id from list_credentials>" })
```

```
[BAD]  use_payment_method({ card_number: "4111-1111-1111-1111", cvv: "123" })
       # full PAN + CVV leak into MCP args.
[GOOD] use_payment_method({ payment_method_id: "<id from list_payment_methods>" })
```

```
[BAD]  Ask the user to paste a password or code into chat.
[GOOD] Ask the user to save the login in 1Password, then call fill_credential.
```

```
[BAD]  Add provider keys or 1Password tokens to SKILL.md `requires.env`.
       # the skill never holds secrets. requires.env stays empty.
[GOOD] Connect 1Password in FSB's Passwords settings.
```

## When a fill fails

- No 1Password login is saved for the site: report it and ask the user to add one in 1Password. Do not type credentials yourself.
- 1Password is not connected, or the vault list is empty: ask the user to connect 1Password in FSB's Passwords settings.
- The call timed out on first use: the user may need to approve FSB in the 1Password app. Ask them to check, then retry once.

## Why this boundary matters

The MCP transport layer logs tool args by default; OpenClaw and other hosts retain context across turns; retry buffers in the bridge can replay calls. Anything passed as a tool argument or returned as a tool result is durable. Secrets resolved by FSB are not -- they move from 1Password to the FSB local server to the extension to the page, all on the user's machine. Routing a password through `type_text` instead of `fill_credential` collapses that boundary and turns a one-shot page fill into a value that persists across the entire stack.

## See also

- `references/default-to-fsb.md` -- when an auth flow triggers escalation to FSB.
- `references/multi-agent-contract.md` -- ownership rules for tabs that receive fills.
- `references/tool-decision-tree.md` -- which read tool to use to confirm a credential filled successfully (e.g., `read_page` to verify a logged-in heading).
- `SKILL.md` -- `requires.env: []` is the contract this file documents.

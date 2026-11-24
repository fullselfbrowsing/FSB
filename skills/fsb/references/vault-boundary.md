# Vault boundary

FSB has no password vault of its own. Logins and credit cards come from the user's 1Password account: every vault FSB can see, unless the user limited it to some. Passwords, one-time codes, card numbers, and CVVs never cross into chat, tool arguments, or tool results. The model only ever sees ids, titles, site domains, usernames, and card brand plus last 4 digits.

## The rule

1. Logins are entered through `fill_credential` ONLY. The model passes nothing secret: FSB picks the 1Password login whose saved website matches the tab's real URL. If several logins match, the call fails and returns the candidates (id, title, username); call again with `credential_id` set to one of those ids, or to an id from `list_credentials`.
   - If nothing is saved for the site, FSB asks the user on the page to type a login in an FSB frame the page cannot read, and optionally save it to 1Password. The call waits up to 2 minutes; a success reports `by: "you"` and `savedTo1Password`, never the values. If the user declines, the call fails with `credential_not_provided`.
2. One-time (TOTP) codes use the same tool. When the page shows a two-factor code field and the 1Password item has a one-time password, `fill_credential` fills the current code. Call it again on the code page after submitting the password.
3. Credit cards are entered through `use_payment_method` ONLY, with a `payment_method_id` from `list_payment_methods`. Ask the user in the conversation first, naming the card (title, brand, last 4) and the merchant: FSB shows no prompt of its own over MCP. FSB fills only https pages, and only while the tab stays on the site it was on. It never submits the payment.
4. No secrets in chat. The model MUST NOT echo a credential value, MUST NOT include one in tool args, MUST NOT log one in narration.
5. `requires.env: []` is mandatory in `SKILL.md` frontmatter. The skill holds no secrets and no provider env vars. 1Password is connected once in FSB (the Log in to 1Password button on the Vault page, or `npx fsb-mcp-server onepassword` for headless setups), not in the agent host.

## Where values live and how they move

1. The user keeps logins and cards in 1Password. FSB reads every vault the account can see, except transfer vaults, unless the user limited it to some on the Vault page. New logins the user chooses to save go to their Personal vault unless they picked another save vault.
2. The FSB local server (fsb-mcp-server) signs in to 1Password through the 1Password desktop app after the user presses Log in to 1Password on FSB's Vault page. That needs the app's Settings > Developer > Integrate with 1Password SDKs setting (FSB opens the pane), possibly the account name, and the user's approval in the app. 1Password asks for that approval again after 10 idle minutes, after the app locks, and after the local server restarts. Headless setups use a 1Password service account configured from the terminal instead.
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
[GOOD] Call fill_credential: with nothing saved, FSB asks the user on the page.
[GOOD] Ask the user to save the login in 1Password, then call fill_credential.
```

```
[BAD]  Add provider keys or 1Password tokens to SKILL.md `requires.env`.
       # the skill never holds secrets. requires.env stays empty.
[GOOD] Ask the user to press Log in to 1Password on FSB's Vault page.
```

## When a fill fails

- No 1Password login is saved for the site: `fill_credential` already asks the user on the page. If it still fails with `credential_not_found` (FSB could not show the sheet there), ask the user to add a login in 1Password. Do not type credentials yourself.
- `credential_not_provided`: the user declined or did not answer the on-page sheet. Do not call `fill_credential` again on your own; ask the user how they want to continue.
- 1Password is not connected (`onepassword_not_configured`) or FSB can read no vaults (`onepassword_no_vaults`): ask the user to open FSB's Vault page and press Log in to 1Password. Do not retry until they say it is done.
- `onepassword_auth_failed`: 1Password refused the sign-in, and the result's `reason` says why when FSB can tell.
  - `app_missing`: the 1Password desktop app is not installed. Ask the user to install it, then log in from the Vault page.
  - `integration_off`: the app's Settings > Developer > Integrate with 1Password SDKs setting is off, or the app closed the connection. Ask the user to press Log in to 1Password on the Vault page, which opens that setting. On a managed device, an administrator may have to allow it.
  - `locked`: ask the user to unlock 1Password, then retry once.
  - `declined`: the user declined FSB in 1Password. Do not retry on your own; ask how they want to continue.
  - `unknown` or no reason: tell the user what the error says and ask them to check the Vault page.
- The call timed out (`onepassword_timeout`): 1Password may be waiting for the user to approve FSB. It asks again after 10 idle minutes, after the app locks, and after the local server restarts, so this can happen in the middle of a session. Ask the user to check the 1Password app, then retry once.

## Why this boundary matters

The MCP transport layer logs tool args by default; OpenClaw and other hosts retain context across turns; retry buffers in the bridge can replay calls. Anything passed as a tool argument or returned as a tool result is durable. Secrets resolved by FSB are not -- they move from 1Password to the FSB local server to the extension to the page, all on the user's machine. Routing a password through `type_text` instead of `fill_credential` collapses that boundary and turns a one-shot page fill into a value that persists across the entire stack.

## See also

- `references/default-to-fsb.md` -- when an auth flow triggers escalation to FSB.
- `references/multi-agent-contract.md` -- ownership rules for tabs that receive fills.
- `references/tool-decision-tree.md` -- which read tool to use to confirm a credential filled successfully (e.g., `read_page` to verify a logged-in heading).
- `SKILL.md` -- `requires.env: []` is the contract this file documents.

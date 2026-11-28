# Claude plugin: release and directory submission runbook

The Full Self Browsing plugin for Claude Code and Cowork lives in [`plugins/claude/`](../plugins/claude/README.md). This page is the maintainer runbook: how the plugin gets from this repository to Claude users, what must be true before it is submitted to the Claude plugin directory, and the prepared answers for the submission form. Reviewers never read this file; the directory reads only the plugin repository.

## How the plugin ships

- **Source of truth:** `plugins/claude/` in this repository. `tests/claude-plugin-spec.test.js` runs the directory's offline checks on it (shared with the export script through `scripts/claude-plugin-checks.mjs`).
- **Version:** the plugin's `version`, its launcher pin in `.mcp.json` (`npx -y fsb-mcp-server@<version>`) and the commands in its README all equal the MCP package version. `npm run version:set:mcp -- X.Y.Z` moves them with the rest of the MCP release; `npm run version:check` fails if they drift. The Claude directory refuses `@latest`, so the pin is always exact.
- **Public repository:** [`fullselfbrowsing/fsb-claude-plugin`](https://github.com/fullselfbrowsing/fsb-claude-plugin) holds a copy of the folder at its root, plus a single-plugin `marketplace.json`, so Claude Code users can run `claude plugin marketplace add fullselfbrowsing/fsb-claude-plugin`. This monorepo cannot be the submission source: its root `.gitattributes` uses an LFS filter, which stops directory validation, and it is close to the directory's 10,000-file and 50 MiB limits.
- **Mirror:** `.github/workflows/claude-plugin-mirror.yml` exports the folder with `scripts/export-claude-plugin.mjs` and pushes one commit to the plugin repository each time the plugin version changes, after the pinned server release is on npm. Plugin text changes between MCP releases wait for the next release, because Claude only offers updates when the version changes. Do not commit to the plugin repository directly; the next sync overwrites it.
- **Manual sync:** clone the plugin repository outside this checkout, run `node scripts/export-claude-plugin.mjs <clone>`, then commit and push in the clone. The workflow's **Run workflow** button with **force** does the same from CI.

## One-time setup

1. Deploy key for the mirror (run where `gh` is signed in as an owner):

   ```bash
   ssh-keygen -t ed25519 -N '' -C fsb-claude-plugin-mirror -f /tmp/fsb-plugin-mirror
   gh repo deploy-key add /tmp/fsb-plugin-mirror.pub --repo fullselfbrowsing/fsb-claude-plugin --allow-write --title "FSB monorepo mirror"
   gh secret set CLAUDE_PLUGIN_DEPLOY_KEY --repo fullselfbrowsing/FSB < /tmp/fsb-plugin-mirror
   rm /tmp/fsb-plugin-mirror /tmp/fsb-plugin-mirror.pub
   ```

   Make sure no branch rule on the plugin repository blocks a deploy-key push to `main`.

2. Turn on private vulnerability reporting, which the plugin's `SECURITY.md` points to:

   ```bash
   gh api -X PUT repos/fullselfbrowsing/FSB/private-vulnerability-reporting
   ```

## Gates before submitting

Submit only when every item is done. Each one maps to a directory policy or checklist rule that would otherwise hold or reject the listing.

- [ ] **Tool annotations are published.** Policy 5.E requires `title`, `readOnlyHint` and `destructiveHint` on every tool. They ship in the first MCP release that includes the tool-annotations change; the plugin pin must point at that release or later.
- [ ] **Dependencies are current.** Policy 5.G requires reasonably current dependencies for local servers. The published 0.11.x packages bundle SDK 1.29.0, ws 8.19.0 and other packages with high or critical advisories; the dependency refresh in the 0.9.96 hot patch line (SDK 1.32.2, ws 8.23.0, smol-toml 1.9.1) must be in the pinned release. Before submitting, run `npm audit --omit=dev` in `mcp/` and note every remaining advisory with the reason it does not apply.
- [ ] **The Web Store extension matches the privacy policy.** Extension 0.9.95 always registers with `full-selfbrowsing.com` and keeps a relay socket that carries usage totals, while the privacy page says server sync is off by default. Wait for the release that removes the relay (0.9.99) to be live on the Chrome Web Store, then update the plugin README's network table and state that minimum extension version.
- [ ] **The privacy page names 2Captcha.** FSB autopilot sends CAPTCHA requests to `2captcha.com` when the user saves a 2Captcha key; the privacy page does not mention it. Add it, or keep MCP `run_task` from using it.
- [ ] Recommended: reword the `drag` and `drag_variable_speed` tool descriptions that describe slider CAPTCHAs and evading bot detection, stop serving the slider-CAPTCHA site guide over MCP, and fix the task-outcome tool descriptions that still mention the retired `start_visual_session`. Reviewers read every tool description.
- [ ] `claude plugin validate <plugin-repo-clone> --profile directory` passes on the exported copy.

## Submitting

Submit from the organization that should own the listing long term: the first organization to submit a repository folder holds that listing, and the repository and folder cannot be changed afterwards. Drafts count toward the limit of 10 submissions per 24 hours.

1. Open <https://claude.ai/directory/manage>, choose **Submit new**, then **Plugin bundle**.
2. **Source:** repository `fullselfbrowsing/fsb-claude-plugin`; leave **Plugin path** empty (the plugin is at the root); leave **Branch or tag** empty to follow `main`. Select **Validate** and fix any blocking finding in `plugins/claude/`, then let the mirror push and re-validate.
3. **Listing details** come from `plugin.json` and the README. Change them in `plugins/claude/`, not in the portal.
4. **Data handling** (answer for the pinned release; recheck against the privacy page before submitting):
   - *Reads or stores personal data?* Yes. On request it reads page text, page structure, screenshots and spreadsheet ranges from the user's own signed-in browser and returns them to Claude. Saved-login and saved-card list tools return the site and username, or the card brand, last four digits and cardholder name; passwords, full card numbers and security codes are filled inside the extension and never returned. Locally it stores screenshots under `~/.fsb/screenshots` (deleted after 7 days), a loopback pairing secret, rotating diagnostic logs, redacted session-replay records in the extension (30 days by default, adjustable or off), and FSB memory until the user clears it.
   - *Sends data to services other than declared connectors?* Yes, as disclosed in the README: `npx` downloads the pinned package from the npm registry; the companion extension sends opt-out anonymous telemetry (install ID, MCP client label, model name, token counts, active-agent count; a coarse region derived from the IP, which is then discarded) to `full-selfbrowsing.com`; FSB autopilot sends the task and page summaries to the AI provider the user configures, and CAPTCHA requests to 2Captcha only if the user saves a 2Captcha key; and the browser contacts the sites the user directs it to.
   - *Retention:* local items as above; telemetry raw events 7 days, per-install daily rollups 365 days, global aggregates kept; erasure through the privacy page's forget endpoint.
   - *Intended for people under 18?* No.
5. **Compliance:** confirm a contact email someone monitors, and check all four acknowledgements.
6. **Review and submit:** keep the **GitHub push webhook**; leave first-version publishing to the Anthropic reviewer. Every version is held for a person anyway, because the launcher runs a pinned npm package.

## Findings to expect

- **Runs a pinned npx package** (held, always): expected for a local server distributed through npm. The README's "What this plugin runs, sends and fetches" section and the package source under `mcp/` answer it.
- **Name matches a known brand** (possible hold): "Full Self Browsing" can read as close to "Full Self-Driving". It is the product's own name, used by the Chrome Web Store listing, the website and the npm package.
- **Windows executables in the npm package:** the tarball includes small Windows helper executables built from the bundled C sources. They are used only by an explicit `install --native-host` command on Windows, never by the stdio server the plugin starts.
- **`invoke_capability`** runs site capabilities, including writes, through one tool; it is annotated as destructive so hosts can ask first.
- **`execute_js` description** calls itself the primary interaction tool; the plugin skill tells Claude to prefer the manual tools.

If a version stays held without a clear finding, use **Get help / Contact Anthropic** on the plugin's page in the portal, or email `directory@anthropic.com`.

## After the listing goes live

- Limit the listed surfaces to Claude Code and Cowork, since chat ignores local MCP servers.
- Keep the README's disclosure table current with each extension and MCP release; it must describe the pinned release.

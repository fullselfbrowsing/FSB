# Public-release benchmark gate

The public run uses the unchanged Chrome Web Store extension and its pinned public MCP package. Claude Opus 5.5 (`claude-opus-5-5`, medium effort, through a pinned Claude Code CLI) is both the actor and the judge; see [BROWSER-MANUAL-V2.md](BROWSER-MANUAL-V2.md) for the actor isolation, image delivery and quota policy. It uses `browser-manual-public-v1`:44 discovered browser tools. The public release does not register the two wait tools. Its browser Google search fallback is preserved. `read_page` can click consent UI, so it runs under the foreground lease and consumes the UI-call budget. No patched product source or private ownership/drain protocol is required.

`harness/public-live-gate.mjs` records two separate results:

- Seven compact-reference diagnostics send actual snapshot `eN` selectors through public `click`, `type_text`, `press_enter`, `select_option`, `check_box`, `hover`, and `get_text`. Native failures remain failures even if a later observation sees an effect. Missing actual refs are recorded as unavailable. CSS, text and JavaScript calls never substitute for these diagnostic actions.
- Rig admission requires exact synthetic fixture state through available public UI tools, a frame-grounded canvas click, an explicit native capture, popup/document isolation, a native denied foreign-tab read, actor last-tab protection, byte-identical exported PNGs, settled operations, and verified public guard cleanup. A missing or corrupt native capture on this healthy fixture is a hard failure.

The gate tests1,2,5 and10 independent contexts. A passing level requires every physical state/export check, zero queue expiries, p95 foreground queue at most30seconds, p95 tool roundtrip at most60seconds, and p95 UI lease at most1.5times the serial baseline. Queue-only failures retain their raw evidence and cannot pass. The controller pilots the highest passing level and applies the separately frozen fallback policy.

The pinned attachment identity is the extension ID, version and install instance. A WebSocket reconnect of that same install only holds dispatch (up to 60 seconds) until it is connected again; a different install, version or ID latches the monitor and stops the run.

The adapter opens a private local guard tab before task tabs. Cleanup verifies guard-only scoped inventory, exact task/guard close acknowledgments, and client/local-server shutdown. It never lists tabs after closing the final guard. This proves causal guard continuity; it does not claim access to the public product's private registry. The stock MCP's internal re-registration/retry behavior remains a disclosed limitation. A denied foreign-tab control and root-owned before/after browser observations provide additional isolation evidence.

Live execution requires explicit authorization, a fresh output directory, the public server command, and content-pinned official package/runtime receipts. For example:

```sh
node mind2web/harness/public-live-gate.mjs --run-live --output /absolute/new/gate \
  --fsb-server-cmd '["/absolute/node","/absolute/public/package/build/index.js","stdio"]' \
  --public-pins /absolute/public-pins.json
```

`verifyPublicLocalGateEvidence(summary,{gateDir,serverCommand,publicPins,profilePath})` is read-only. It rehashes source/public pins, raw trees, original PNG/emission receipts, exported trajectories and cleanup evidence; recomputes exact fixture goals and all seven capability statuses from saved operations; and recomputes each timing decision. It returns the compatible `passed_levels` and `highest_passing_level` fields. A controller must hash `summary.json` and bind the verifier result to its frozen receipt before any actor run.

The full pipeline (historical review bundle, Claude image contract, this gate, paired pilot, review pause, 300-task collection, six judge jobs, report) runs with:

```sh
node mind2web/harness/public-benchmark.mjs \
  --extension-dir "/absolute/Chrome/Default/Extensions/<id>/0.9.92_0" \
  --output /absolute/workspace/.context/om2w/public-v1/<fresh-run> --full-run-id <fresh-id> \
  --fsb-server-cmd '["/absolute/node","/absolute/public/package/build/index.js","stdio"]' \
  --public-pins /absolute/public-pins.json
```

Resume with the same command plus `--resume`.

---
phase: 33
doc: human-uat
status: human_needed
created: 2026-06-23
---

# Phase 33 — Human UAT (live media mirroring)

The CI half is green (reconciler branches, the full forward→relay→viewer wiring chain, the rebuilt bundle surface, the full phantom-stream cluster). The scenarios below are irreducibly live: they need a real browser, a real playing media element, and the FSB dashboard open. Non-blocking deferred debt, consistent with the v0.12.0 PhantomStream and v0.9.99 live-UAT posture.

## UAT-33-01 — Progressive media mirrors to the dashboard
**Pre:** FSB extension loaded; dashboard paired and streaming a tab.
1. Navigate the streamed tab to a page with a plain `<video>`/`<audio>` (progressive `.mp4`/`.mp3`, not DRM/HLS) and play it.
2. **Expect:** the dashboard preview shows the same media playing (by reference), roughly position-synced.
3. Pause / seek / change rate on the source; **expect** the mirror to follow within the reconciler's tolerance band (no constant hard-seeking; smooth nudge on small drift).
4. Open the dashboard transport log; **expect** no `phantomstream-media-blocked` / `-unavailable` spam for an ordinary same-origin media element.

## UAT-33-02 — `mediaMode` posture
1. Confirm default `'reference'` plays media in the preview.
2. (Optional) Flip `mediaMode` to `'poster'` in the dashboard viewer init; **expect** a poster image only, no media bytes fetched by the viewer; to `'off'`; **expect** no media surface at all. Confirms the privacy-conservative postures are one flip away.

## UAT-33-03 — Degrade paths
1. Play media the viewer cannot source (e.g., an origin the fail-closed asset policy blocks, or a `blob:`/MSE element with no discoverable manifest while discovery is deferred).
2. **Expect:** a passive `media-unavailable` overlay (degrade-to-poster), the mirror never wedges, and a `phantomstream-media-unavailable` diagnostic is logged with the element nid + reason.

## UAT-33-04 — Stale-frame + recovery hygiene
1. Trigger a resync / fresh snapshot while media is playing.
2. **Expect:** media frames carrying a stale `streamSessionId`/`snapshotId` are rejected (`shouldAcceptPreviewMessage`); playback re-binds to the new stream generation without a stuck element.

## Deferred (separate, off by default)
- Adaptive HLS/DASH (`.m3u8`/`.mpd`) mirroring via the `STREAM.MEDIA_HINT` `chrome.webRequest` discovery path — not enabled in this phase (no `webRequest` permission). Re-open when discovery is turned on.

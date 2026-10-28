# Benchmark methodology

This document accompanies **FSB benchmark — AI-reviewed: 277/300 (92.33%)**. It records how the verdicts were obtained; the presentation change does not change any score or task outcome.

## Task accounting and reviewer

The denominator is the same 300-task Online-Mind2Web dataset, revision `eacad896a84dc5b65e29b0b06e4699ab0544d701`.

- 228 tasks retain a passing majority in both variants of the earlier Claude evaluations.
- 72 tasks had additional FSB execution by the Codex AI assistant and a subsequent saved-evidence review: 49 supported outcomes, six qualified outcomes and 17 unmet goals.
- Supported outcomes receive one credit; qualified and unmet outcomes receive zero. The total is 228 + 49 = 277, with each task counted once.

Codex performed the 72-task review, which was non-blind and conducted by the same assistant that executed those tasks. The other 228 tasks were not independently re-reviewed. This is AI review, not human adjudication of the verdicts. The earlier operational ledger's 55 completed labels include six qualifications withheld from the final score.

## Execution and observations

Benchmark task actions used the pinned public FSB extension 0.9.92 and MCP 0.11.2. The initial actor was Claude Opus 5.5 at medium effort; Codex performed the additional executions. Native macOS screenshots and public rendered DOM supplied observations during those executions. Native setup input was used to reconnect the same extension installation. The user completed Target's human-verification challenge; BoardGameGeek subsequently loaded without a challenge, with no assistant CAPTCHA action recorded.

The additional executions included multiple attempts across sessions, shared browser cookies/cart state and live content changes. They did not maintain the original fixed per-task time/action budget. The IKEA cart already contained the qualifying sofa, so its verdict records the verified end state rather than a newly caused addition. Relative dates retained the documented logical task dates across midnight. These are historical price and availability observations.

The 92.33% result combines these task verdicts; it is not a fresh, uniform 300-task execution by one model or a new six-pass Claude WebJudge evaluation. The conservative saved-evidence review is distinct from upstream WebJudge's rubric, including its valid-empty-result rule. Published entries in the comparison chart may use different evaluation procedures, so numerical placement does not establish an official leaderboard rank.

## Historical measurements and evidence

The original Claude means are 79.00% official and 72.67% strict. After the separate 44-task serial evaluation, the means are 83.33% official and 77.00% strict. These original artifacts, model labels and seals remain unchanged. The official variant includes the actor's final answer; strict hides it. Both use a substitute Claude judge and are uncalibrated, not OSU-verified, and not directly comparable to the o4-mini leaderboard.

The detailed audit checks 850 native image hashes and companion accessibility files, recomputes the original and serial judge totals, and verifies 43 earlier sealed files. Not every image was independently reexamined. Historical cleanup limitations are retained in the detailed evaluation. Capture diagnostics establish missing evidence rather than proving that websites deliberately blocked screenshots or that every underlying task was otherwise complete.

- [Detailed evaluation and qualifications](../../FINAL-REPORT.md)
- [All 300 task verdicts, JSON](../final-review-20261022/per-task-final.json) · [CSV](../final-review-20261022/per-task-final.csv)
- [All 72 AI reassessments, JSON](../final-review-20261022/task-reviews.json) · [CSV](../final-review-20261022/task-reviews.csv)
- [Evidence audit](../final-review-20261022/FINAL-AUDIT.json) · [evaluation seal](../final-review-20261022/FINAL-SEAL.json)
- [Previous publication seal](../final-reviewed-20261022/FINAL-SEAL.json)

## Chart source

Other agents' scores were transcribed from the user-supplied table. The chart inserts FSB's exact 277/300 rate, sorts numerically and displays the highest ten entries. FSB is fourth. Dates distinguish the two ACT-1 entries. The chart does not claim that the other entries were independently verified or that all evaluations used one procedure.

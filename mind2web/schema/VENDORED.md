# Vendored Online-Mind2Web v2 submission files

Source: https://github.com/OSU-NLP-Group/Online-Mind2Web at commit
`f0d805ee0e9e0b3ea70911e45e5264b72968f3dc`, fetched 2026-10-15 from
`https://raw.githubusercontent.com/OSU-NLP-Group/Online-Mind2Web/f0d805ee0e9e0b3ea70911e45e5264b72968f3dc/<path>`.

Files are byte-identical to upstream. The git blob SHA column matches the
GitHub contents API for that commit.

| Local file | Upstream path | git blob SHA | sha256 |
|---|---|---|---|
| `schema_v2.json` | `data/schema_v2/schema_v2.json` | `fc3b109f417e160d2749b6680c9f53406e3a9931` | `c5d141e0a65432d04fbf3e02fab5613513a2fc342bdd8463167c8147bdd7f881` |
| `README.md` | `data/schema_v2/README.md` | `34082735fba5859c3b183834d00334ef786d83e1` | `cacbaf0088299f74f9e69a0e84fa01990a93b196c4d806fee78279a38faa0818` |
| `example_v2.json` | `data/schema_v2/example_v2.json` | `2f51b033a1776dec1e91ccffb4bfcced1e909e30` | `b2e3442d8a28996e6195c66b0af8b4ba7794bb17a306ccba30365a201c18bd10` |
| `example_v2/1b867afecf072cb877ebfa4069263746/result.json` | `data/example/example_v2/1b867afecf072cb877ebfa4069263746/result.json` | `2f51b033a1776dec1e91ccffb4bfcced1e909e30` | `b2e3442d8a28996e6195c66b0af8b4ba7794bb17a306ccba30365a201c18bd10` |
| `example_v2/1b867afecf072cb877ebfa4069263746/trajectory/0000.png` … `0013.png` (14 files) | same path under `data/example/example_v2/…/trajectory/` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` (empty blob) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Not vendored (read only, recorded for reference):

| Upstream path | sha256 |
|---|---|
| `src/run.py` | `c43776619c4a85a86f0c765f6b9d268bd9032324ac121f89e92d92281879fa99` |
| `src/methods/webjudge_online_mind2web.py` | `e3cd499b7c1fc92cbd51d3c4216c95ebab774c2c2cd998c5ad6dad94710780c4` |

## Known upstream inconsistencies

- The README links to `schema.json` and `example.json`; the real files are
  `schema_v2.json` and `example_v2.json`.
- The official example's 14 screenshots are 0-byte files, so it cannot pass
  the image checks in `harness/validate-v2.mjs`.
- README §1 says the terminal TASK_COMPLETE step has no screenshot, but rule 4
  in §6 requires every referenced screenshot to exist, the example ships one,
  and `src/run.py` joins `step["screenshot"]` for every step.
- `src/run.py` reads `input_image_paths` from a v2 `result.json`, but the
  schema has `additionalProperties: false` and does not declare it. Only the
  `WebJudge_general_eval` mode uses it; the Online-Mind2Web mode does not.
- Grammar A is described as `<TARGET> -> <VERB> -> <description> | <STATUS>`,
  but the verb table's own examples for CLICK, TYPE, SCROLL, HOVER, WAIT,
  PRESS_KEY and SELECT use `<VERB> <target> -> <description> | <STATUS>`.
- The verb table marks status as required for NAVIGATE, but the example's
  step 0 NAVIGATE has no suffix and `action_status: null`.
- The README says NAVIGATE destinations belong only in the step's `url`
  field, but `src/run.py` passes only the `action` strings to WebJudge, so a
  URL kept out of the action string never reaches the judge.

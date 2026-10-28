# FSB Online-Mind2Web — final consolidated report

Finalized 2026-10-22T05:49:57.071213+00:00. All 300 automated tasks and all 72 selected manual reviews are accounted for. No evaluation jobs remain pending.

**Final automated result: official mean 83.33%; strict mean 77.00%, after the separately sealed serial recovery.** These remain the Claude Opus 5.5 + public FSB results. The later Codex-run recovery is reported separately and does not overwrite them.

## Automated scores, independently recomputed

| Evaluation | Official mean, 3 passes | Official majority | Strict mean, 3 passes | Strict majority |
|---|---:|---:|---:|---:|
| Original 300-task run | 79.00% | 238/300 (79.33%) | 72.67% | 218/300 (72.67%) |
| After 44-task serial recovery | 83.33% | 251/300 (83.67%) | 77.00% | 231/300 (77.00%) |

Mean and majority are different statistics. Every mean retains all 300 tasks in each pass; missing trajectories and terminal format failures remain zeros. The six original and six recovery judge files were read directly, and every stored per-task verdict and aggregate was checked.

The append-only judge logs also retain 20 historical quota-pause pending records. Each is followed by a completed judgment for the same task. Only the 2,064 terminal task judgments are used, with all 20 superseded records preserved and audited; none remains pending.

| Claude judge pass | Original successes / 300 | Adjusted successes / 300 |
|---|---:|---:|
| claude-official-pass1 | 237 | 250 |
| claude-official-pass2 | 235 | 248 |
| claude-official-pass3 | 239 | 252 |
| claude-strict-pass1 | 222 | 235 |
| claude-strict-pass2 | 217 | 230 |
| claude-strict-pass3 | 215 | 228 |

The serial rerun exported 16 of 44 trajectories; 27 capture failures and one startup/rig failure left 28 without trajectories. Each recovery judge pass passed 13 tasks. The original and rerun reports, provenance and judge outputs remain sealed and unchanged.

## Codex reassessment of the 72 recovered tasks

The earlier operational ledger marked 55 tasks completed, 15 partial and two site-blocked. This final review compared every full goal and finding, checked saved public DOM and accessibility evidence where needed, and reexamined focused screenshots for disputed outcomes. It is a single non-blind review by the same assistant that performed the manual recovery. It does not claim an independent judge or reinspection of all 850 images.

| Reassessed outcome | Tasks | Conservative credit |
|---|---:|---:|
| Supported full goal | 49 | 49 |
| Qualified / incomplete evidence | 6 | 0 |
| Goal not met, including two site-blocked tasks | 17 | 0 |
| Total manually reviewed | 72 | 49 |

The six qualified outcomes below explain why the earlier 55 completed labels are not all counted as confirmed successes. A qualification records uncertainty, not proof that the returned item or answer is wrong.

| Manual task | Qualification withheld from full-success credit |
|---|---|
| 8 | Package, party, breakfast, spa and lowest-price evidence exists for October 22–26. The phrase 'returning on the fourth day from departure' was interpreted as four days later; an inclusive fourth-day interpretation would return October 25. The intended duration is unresolved, so full credit is withheld. |
| 16 | The checker returns eleven possible supports only after an extra savings-below-£16,000 assumption and an interpretation of caring responsibilities. It does not establish support for the entire underspecified scenario. |
| 18 | The quiz and article were reached, but its final radio question retained excessive cravings alone. The requested portion-control and cravings profile was not fully represented. |
| 32 | The actual L facet, lowest-price selection and cart addition are verified. The added variant is 40/16; the saved size guide does not explicitly map that numeric variant to Large, so exact size compliance remains unconfirmed. |
| 48 | A recent dated climate article leads Featured Climate News, but no latest-first sort or date comparison establishes that it is the newest story. |
| 58 | The closed BEPTEC page and constituents identify top gainer AT&S/code ATSv, but the saved display has no calendar date. Attribution to the latest market close remains unconfirmed. |

The separate conservative task-attainment policy gives no full-goal credit when requested information or action remains missing. It is not a reimplementation of upstream `upstream-filter-v1`: for example, a correctly submitted invalid-order lookup may pass upstream’s valid-empty-result rule while still receiving zero here because no order details were obtained. The Target pizza is credited as a verified individual $9.99 vegetarian frozen-cheese-pizza match; the site’s $5–$9.99 bracket is not represented as an exact reproduction of a $5–$10 filter requirement.

## Reviewed-completion composite — diagnostic only

**277/300 = 92.33%** supported or carried forward after recovery: **228** tasks passed a majority of both existing Claude variants, plus **49** supported manual reviews. The other **23** receive zero. The 228 retained tasks were not independently re-reviewed. This is a mixed-actor, reviewed-completion composite, not a revised autonomous Claude score or a leaderboard result.

The 72 reviewed tasks are the union of the 49 corrected official failures and 69 corrected strict failures. They overlap: adding manual successes directly to 251 or 231 would double count some tasks. The composite replaces the whole 72-task union and retains the other 228, so each task is counted exactly once.

| Difficulty | Tasks | Retained Claude tasks | Supported manual reviews | Composite |
|---|---:|---:|---:|---:|
| easy | 80 | 69 | 9 | 78/80 |
| medium | 141 | 112 | 21 | 133/141 |
| hard | 79 | 47 | 19 | 66/79 |

Manual recovery used pinned public FSB 0.9.92 / MCP 0.11.2 for task actions, native macOS Chrome screenshots and public rendered DOM for observations. The user completed Target’s verification; BoardGameGeek later loaded without a challenge. Native setup input was used only to reconnect the same FSB installation. Multiple fresh attempts, changing live content, shared cookies/carts and the absence of the original time/action budget make this a recovery diagnostic rather than a controlled repeat.

The IKEA cart already held the qualifying sofa: that row credits the verified end state, not a new addition caused by the recovery. Relative dates are anchored to the original manual scenario; the Airbnb retry retained October 23–26 across midnight. Original Claude judging occurred earlier and used different absolute expansions of relative dates. Prices and availability are historical observations, not current quotes.

## Remaining unsuccessful tasks — finalized as zero

No CAPTCHA-paused tasks remain. Ryanair terms authorization was not received; its unverified fare is scored zero for this finalized assessment. No booking, purchase, application or terms acceptance was performed to close a score gap. The other stopping conditions are recorded below; they are not all FSB failures.

| Manual task | Unmet requirement / stopping condition |
|---|---|
| 4 | The first groomer's nail-trimming service was found, but detailed service prices were not published. |
| 7 | The $50 trade-in estimate is documented, but no excellent-condition open-box Galaxy S25 Plus price was available. |
| 11 | The specified first Trending puzzle could not be located or passed; a different daily puzzle was not substituted. |
| 13 | CVS-brand review leaders under $15 were found, but gluten-free status was not verified. |
| 17 | No documented recipe meets savory, vegan, high-protein and at most five minutes simultaneously. |
| 20 | The supplied order lookup was submitted correctly but returned Not found; requested order details were not obtained. This is zero in the conservative task-attainment review, not a claim that the upstream empty-result rule must fail it. |
| 22 | A current China cybersecurity forecast was found, but paid numerical data and broader digital-trend coverage remain unavailable. |
| 23 | No qualifying BTS event near New York was available; four upper-level tickets and estimated fees were not displayed. |
| 27 | A next-day standard quote exists, but the same-day quote link hit a browser security warning and the displayed shipping cutoff had passed. Fastest available is unverified. |
| 28 | No Oregon wine meets all requested price, critic-rank and fish-or-dessert pairing constraints; the near match does not have the requested pairings. |
| 38 | No exact 33–49-inch QLED/240 Hz/$1,000–$2,000 match is verified; LED/VA and QD-OLED were not substituted. |
| 42 | The saved sources do not establish an appropriate gluten-free pregnancy weight-loss diet; a generic restrictive menu was not substituted. |
| 43 | The latest listed Chris Paul row is 2025–26 at 3.3 APG, with no 2026–27 row; current-season assists remain unavailable. |
| 45 | The cheapest NYU apartment listings do not verify both Wi-Fi and cleaning in included bills. |
| 53 | The requested five-bottle alcohol cart action was not performed. This is a restriction on the action, not an FSB capture failure. |
| 69 | Cook Day Use Area is nearby, but horseback riding is mentioned for the lake region without verified riding access in the specific park. |
| 70 | The Dublin search was prepared but not submitted because it accepts Website Terms. No fare under US$100 was verified; authorization pending is finalized as zero for this assessment. |

## What the 28 missing screenshot trails establish

Their final capture diagnostics were 23 host-permission refusals, three different-extension URL errors and two out-of-bounds errors. These establish missing evidence, not that every underlying task had been completed. In the conservative review, that subset has **15 supported, three qualified and ten unmet** tasks. Earlier Chrome-interference and power-saving explanations were hypotheses, not proven causes for all 28.

Native screenshots exposed actual renderer crashes behind some “Cannot access contents” messages. Separately, the reconnect check demonstrated a fresh-client startup race: the first inventory read reported an unattached extension, but subsequent reads on the same client succeeded after one second. Neither observation establishes a universal cause.

## Integrity, limits and artifacts

All **850** native PNG records retain matching SHA-256 hashes and companion accessibility files. All **43** previously sealed benchmark file hashes still match. The source inventory additionally hashes the manual findings, journals and evidence. Hashes establish preservation, not correctness of every frame or verdict. Eighteen historical cleanup/retry receipts remain incomplete or errored; this is not a count of tabs still open. Latest Target and BoardGameGeek cleanup succeeded; the manual helper and its temporary keep-awake process were stopped.

The automated actor and judges both use `claude-opus-5-5`, medium effort, with the pinned Online-Mind2Web revision `eacad896a84dc5b65e29b0b06e4699ab0544d701`. “Official” denotes the upstream answer-visible variant, not OSU endorsement. “Strict” hides the actor’s final answer. These substitute-model judgments are uncalibrated, not OSU-verified and not directly comparable to the o4-mini leaderboard.

- [Final scores and methodology](results/final-review-20261022/SCORES.json)
- [All 300 tasks, JSON](results/final-review-20261022/per-task-final.json) · [CSV](results/final-review-20261022/per-task-final.csv)
- [All 72 reassessments, JSON](results/final-review-20261022/task-reviews.json) · [CSV](results/final-review-20261022/task-reviews.csv)
- [Final audit and source hashes](results/final-review-20261022/FINAL-AUDIT.json) · [final seal](results/final-review-20261022/FINAL-SEAL.json)
- [Original sealed Claude report](results/full-public-claude-20261019g/REPORT.md)
- [Sealed serial-recovery Claude report](results/rerun-public-claude-20261020/REPORT.md)
- [Historical manual operations report](../.context/om2w/manual-native-20261021/REPORT.md)

## Manual review ledger

| # | Site | Final review | Basis and evidence |
|---:|---|---|---|
| 1 | phys.org | Supported | Quantum Physics, monthly popularity and the first article's Comments (0) panel are documented. [Finding](../.context/om2w/manual-native-20261021/tasks/7c09c2c7c87cf6bb1138701eb54284ea/finding.json) |
| 2 | us.trip.com | Supported | Popularity order identifies Hong Kong Disneyland first; four nearby attraction cards and distances are recorded. [Finding](../.context/om2w/manual-native-20261021/tasks/63d6866fc000fcb1f153e07604bd1395/finding.json) |
| 3 | www.4shared.com | Supported | Video, MP4, 20+ minutes, medium 10–100 MB and newest-first controls were applied; the first result lasts 22:24. [Finding](../.context/om2w/manual-native-20261021/tasks/c8c1ff115879b3afd14280beb1559b13/attempt-2/finding.json) |
| 4 | www.akc.org | Not met; zero | The first groomer's nail-trimming service was found, but detailed service prices were not published. [Finding](../.context/om2w/manual-native-20261021/tasks/c03ee2be3d73556ab789c0ad1cbd3451/finding.json) |
| 5 | www.berkeley.edu | Supported | Fall 2023 graduate COMPSCI results include Tuesday and Tuesday/Thursday meetings starting within 2–6 PM; six sections are documented. [Finding](../.context/om2w/manual-native-20261021/tasks/b99c02965196d51e80ac7539e33f335b/finding.json) |
| 6 | www.bestbuy.com | Supported | One $100 birthday-themed Best Buy gift card is verified in the cart; the existing Uber card was preserved. [Finding](../.context/om2w/manual-native-20261021/tasks/d392e154c1c6ffbb26e2331c3afafc67/finding.json) |
| 7 | www.bestbuy.com | Not met; zero | The $50 trade-in estimate is documented, but no excellent-condition open-box Galaxy S25 Plus price was available. [Finding](../.context/om2w/manual-native-20261021/tasks/fc53ddd3421411a41c1020a3fdc84ec4_070826/finding.json) |
| 8 | www.booking.com | Qualified; zero | Package, party, breakfast, spa and lowest-price evidence exists for October 22–26. The phrase 'returning on the fourth day from departure' was interpreted as four days later; an inclusive fourth-day interpretation would return October 25. The intended duration is unresolved, so full credit is withheld. [Finding](../.context/om2w/manual-native-20261021/tasks/b2f4fde2fce122a93c7b578086cb0585/finding.json) |
| 9 | www.chase.com | Supported | The calculator commits ages 22–65, 3% return and $8,000 annual contributions from both employee and employer; the displayed result is $1,239,722. [Finding](../.context/om2w/manual-native-20261021/tasks/442a450e696a96085257db6297891a4d/finding.json) |
| 10 | www.chase.com | Supported | The requested ages, starting balance, return and tax rates are committed and the IRA comparison chart is displayed; additional monthly contributions remain zero. [Finding](../.context/om2w/manual-native-20261021/tasks/9ed3827266b3b804f485859c3d00401e_070826/finding.json) |
| 11 | www.chess.com | Not met; zero | The specified first Trending puzzle could not be located or passed; a different daily puzzle was not substituted. [Finding](../.context/om2w/manual-native-20261021/tasks/a48e2f1ee8d87eaeea56fe5e730427e6/finding.json) |
| 12 | www.coolmath4kids.com | Supported | The 11–12 multiplication quiz uses ten questions and unlimited time, with a recorded final score of 10/10. [Finding](../.context/om2w/manual-native-20261021/tasks/1223b07536a87e0170ff87cbbebd1d3c/finding.json) |
| 13 | www.cvs.com | Not met; zero | CVS-brand review leaders under $15 were found, but gluten-free status was not verified. [Finding](../.context/om2w/manual-native-20261021/tasks/afcebfed28bea091d58f49ea6cb8194b/finding.json) |
| 14 | www.google.com | Supported | The lowest documented nearby matching offer is a 27-inch Samsung IPS 4K monitor at $189.99; the existing Dallas location is disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/7fff82864f21ddeccf4104a220892824/finding.json) |
| 15 | www.gov.uk | Supported | The GOV.UK checker uses US citizenship, healthcare work and over six months and returns visa required; no British/Irish dual citizenship is an explicit scenario assumption. [Finding](../.context/om2w/manual-native-20261021/tasks/0170ca95038b05fa58d463fe627ac605/finding.json) |
| 16 | www.gov.uk | Qualified; zero | The checker returns eleven possible supports only after an extra savings-below-£16,000 assumption and an interpretation of caring responsibilities. It does not establish support for the entire underspecified scenario. [Finding](../.context/om2w/manual-native-20261021/tasks/ec78d3a635e417bc2a80d03ca93d7165/finding.json) |
| 17 | www.healthline.com | Not met; zero | No documented recipe meets savory, vegan, high-protein and at most five minutes simultaneously. [Finding](../.context/om2w/manual-native-20261021/tasks/301f267f421b93045874726183e8f722/finding.json) |
| 18 | www.healthline.com | Qualified; zero | The quiz and article were reached, but its final radio question retained excessive cravings alone. The requested portion-control and cravings profile was not fully represented. [Finding](../.context/om2w/manual-native-20261021/tasks/dcd26e662a616d373ddd339747c6ce5b/finding.json) |
| 19 | www.justice.gov | Supported | Actual DOJ Antitrust Division and year-2022 filters produce 62 releases. Earlier evidence supports completion despite the final renderer-crash frame. [Finding](../.context/om2w/manual-native-20261021/tasks/4f903626f632586fe4728d6664947bab/finding.json) |
| 20 | www.michaels.com | Not met; zero | The supplied order lookup was submitted correctly but returned Not found; requested order details were not obtained. This is zero in the conservative task-attainment review, not a claim that the upstream empty-result rule must fail it. [Finding](../.context/om2w/manual-native-20261021/tasks/9c97bab9c2abfb90a426cbe9addae8d0_110325/finding.json) |
| 21 | www.microcenter.com | Supported | The PS5 Digital Edition review widget explicitly uses Most Helpful and displays written reviews. [Finding](../.context/om2w/manual-native-20261021/tasks/62f1626ce249c31098854f8b38bdd6cf_110325/finding.json) |
| 22 | www.statista.com | Not met; zero | A current China cybersecurity forecast was found, but paid numerical data and broader digital-trend coverage remain unavailable. [Finding](../.context/om2w/manual-native-20261021/tasks/78baf9dbe7c3532f7d7ef4cc22a7f065_051526/finding.json) |
| 23 | www.stubhub.com | Not met; zero | No qualifying BTS event near New York was available; four upper-level tickets and estimated fees were not displayed. [Finding](../.context/om2w/manual-native-20261021/tasks/1bc154377120ec15b18dbabdba49c741_051526/finding.json) |
| 24 | www.ted.com | Supported | Robots, 12–18 minutes and Most viewed filters identify Raffaello D'Andrea's 15:50 talk first, with 14,466,230 displayed plays. [Finding](../.context/om2w/manual-native-20261021/tasks/bb5d90e6f2fbc0ae146f7c1998c2b4a1/finding.json) |
| 25 | www.tumblr.com | Supported | Taylor Swift's public Tumblr Likes tab and feed are displayed. [Finding](../.context/om2w/manual-native-20261021/tasks/e7f6cca9a8875f98fee3b711ead3a444_110325/finding.json) |
| 26 | www.ups.com | Supported | UPS quotes document 10 lb, 2×2×2 inches, Long Beach 90802 to Portland 97201, with commercial/drop-off and shipping-date defaults disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/3084bc225219fcb73dc1cb0f97276c1c/finding.json) |
| 27 | www.ups.com | Not met; zero | A next-day standard quote exists, but the same-day quote link hit a browser security warning and the displayed shipping cutoff had passed. Fastest available is unverified. [Finding](../.context/om2w/manual-native-20261021/tasks/9d46ccb915eff39ee1ae1e7328f5f20d/finding.json) |
| 28 | www.wineaccess.com | Not met; zero | No Oregon wine meets all requested price, critic-rank and fish-or-dessert pairing constraints; the near match does not have the requested pairings. [Finding](../.context/om2w/manual-native-20261021/tasks/c577a14301a725e09ccd269a3e0b271e_110325/finding.json) |
| 29 | boardgamegeek.com | Supported | The Danes is first on The Hotness, rated 7.6 from 33 ratings, supports 1–4 players and is community Best 1–2. The 2027 release label is retained. [Finding](../.context/om2w/manual-native-20261021/tasks/99daaed9a83c266341d28aa40067d376/attempt-2/finding.json) |
| 30 | dblp.org | Supported | The available Google Scholar Metrics 2025 CVPR ranking identifies the 2022 main-conference Latent Diffusion Models paper first. The edition is disclosed and no current citation total is asserted. [Finding](../.context/om2w/manual-native-20261021/tasks/5d542a7ec1fa142ba73cc87d970caf39/finding.json) |
| 31 | sourceforge.net | Supported | SourceForge Most Popular with Agentic AI, Linux, Mac, MIT and Production/Stable applied ranks Shinkai first. [Finding](../.context/om2w/manual-native-20261021/tasks/fe33894188d20d7469f37a9fd855e7ff_110325/attempt-2/finding.json) |
| 32 | us.speedo.com | Qualified; zero | The actual L facet, lowest-price selection and cart addition are verified. The added variant is 40/16; the saved size guide does not explicitly map that numeric variant to Large, so exact size compliance remains unconfirmed. [Finding](../.context/om2w/manual-native-20261021/tasks/824eb7bb0ef1ce40bfd49c12182d9428_070826/finding.json) |
| 33 | www.akc.org | Supported | AKC labels the American Hairless Terrier energetic, specifies the hairless variety and gives barking 3/5. [Finding](../.context/om2w/manual-native-20261021/tasks/eb2db4b769c145dbe6ba4f74f3e0de98/finding.json) |
| 34 | www.bbb.org | Supported | BBB's less-than-25-mile New York Rating order places Manhattan Motorcars second; its one listed address is recorded. A+ ties and site-listed-location scope are disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/0b838cd54f826c59c71f600c56b89a11_070826/finding.json) |
| 35 | www.bestbuy.com | Supported | The Samsung 8K Open-Box filtered listing displays the 65-inch QN990F offer. [Finding](../.context/om2w/manual-native-20261021/tasks/271b36efd4346721b5542488ff997042/finding.json) |
| 36 | www.bestbuy.com | Supported | The first matching organic Best Selling HP FHD/16 GB/Core i7 laptop is inspected; public specifications confirm Windows 11 Home. Conflicting port counts remain disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/4464a8421f8bc8786524a499258dfad3/attempt-2/finding.json) |
| 37 | www.bestbuy.com | Supported | The new Samsung 990 1 TB internal M.2 2280 SSD is documented at $189.99 within the requested $25–$200 range. [Finding](../.context/om2w/manual-native-20261021/tasks/515f2e5811cfdd5e0e669e40f17886d8/finding.json) |
| 38 | www.bestbuy.com | Not met; zero | No exact 33–49-inch QLED/240 Hz/$1,000–$2,000 match is verified; LED/VA and QD-OLED were not substituted. [Finding](../.context/om2w/manual-native-20261021/tasks/5dec0e6620849459f29e6465982c597e/finding.json) |
| 39 | www.birkenstock.com | Supported | Men's clogs, Brown, size US 10–10.5/EU43 and Best Sellers identify the Mocha Boston first; one correct pair is verified in the cart. [Finding](../.context/om2w/manual-native-20261021/tasks/11857213ca01510f12813740afd59918_110325/finding.json) |
| 40 | www.flightaware.com | Supported | FlightAware London-to-New York city groups, UA/AA airlines and 8–11 PM arrivals show AA141 at 9:05 PM and UA921 at 9:20 PM. [Finding](../.context/om2w/manual-native-20261021/tasks/949dc965a6c23a95663b3bc2ca2c3a8a/finding.json) |
| 41 | www.google.com | Supported | The requested search action is met by visible 55–65-inch and LED filter chips. Mixed recommendation cards are not individually certified. [Finding](../.context/om2w/manual-native-20261021/tasks/db1ffb5e60578597d1c3aa3c389ac7b1/finding.json) |
| 42 | www.healthline.com | Not met; zero | The saved sources do not establish an appropriate gluten-free pregnancy weight-loss diet; a generic restrictive menu was not substituted. [Finding](../.context/om2w/manual-native-20261021/tasks/239a29bde438fe44fe17fe1390ef1634/finding.json) |
| 43 | www.nba.com | Not met; zero | The latest listed Chris Paul row is 2025–26 at 3.3 APG, with no 2026–27 row; current-season assists remain unavailable. [Finding](../.context/om2w/manual-native-20261021/tasks/bbbc243b4f18a7a897f0bc84e11d293f/finding.json) |
| 44 | www.porsche.com | Supported | Porsche Approved 911, 2019+, ZIP 97007, 200 miles and price-lowest order identify the 2019 Carrera T at $123,991, 151 miles away. [Finding](../.context/om2w/manual-native-20261021/tasks/c3a333968fc3c43d7f2688f425a0d633/finding.json) |
| 45 | www.student.com | Not met; zero | The cheapest NYU apartment listings do not verify both Wi-Fi and cleaning in included bills. [Finding](../.context/om2w/manual-native-20261021/tasks/85b284c18d7e78c9b5a9e074e7aa3b98_051526/finding.json) |
| 46 | www.student.com | Supported | Provider-linked New York single-person private studios have private bathrooms, Wi-Fi and gas included; room prices, electricity cap and fees are disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/8ae510355d978424f490798f900bfa2c_051526/finding.json) |
| 47 | www.target.com | Supported | After user-completed verification, Target's real Vegetarian and $5–$9.99 facets and a direct frozen-cheese-pizza page verify Yough 11.3 oz at $9.99. This is an individual in-range match, not exact reproduction of an upstream $5–$10 filter-band requirement. No cart action is inferred from 'Get'. [Finding](../.context/om2w/manual-native-20261021/tasks/b64f938af842f6a1b4489d0e49a785a7_121125/attempt-2/finding.json) |
| 48 | www.theweathernetwork.com | Qualified; zero | A recent dated climate article leads Featured Climate News, but no latest-first sort or date comparison establishes that it is the newest story. [Finding](../.context/om2w/manual-native-20261021/tasks/f389398d2eeb29e5571e00439c57eb76/finding.json) |
| 49 | ziprecruiter.com | Supported | The ZIP 14810/10-mile, on-site and full-time search has individually verified Quick Apply jobs. Not all 102 search results are claimed to support Quick Apply. [Finding](../.context/om2w/manual-native-20261021/tasks/d8e2a81fa621ce4737e5ea85671b630e_110325/finding.json) |
| 50 | cookpad.com | Supported | Two gluten-free chocolate-chip-cookie recipes have no listed peanut/tree-nut ingredients; gluten-free flour must be chosen for Vicky's recipe. Coconut milk and absence of allergy certification are disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/0632e496d37badee0350dad358f047c5/finding.json) |
| 51 | doctor.webmd.com | Supported | Audiologist, New York, 50 miles, 4+ stars and Average Rating order identify the first organic 5.0-rated result. 'Best' is patient-rating order, not a clinical-quality claim. [Finding](../.context/om2w/manual-native-20261021/tasks/8244409b2c82043f966cad05f9afe132/finding.json) |
| 52 | finance.yahoo.com | Supported | The March 17, 2023 Tesla historical Close column reads $180.13. [Finding](../.context/om2w/manual-native-20261021/tasks/a6f0434ce6aff5f9b03681241b03ad82/finding.json) |
| 53 | macyswineshop.com | Not met; zero | The requested five-bottle alcohol cart action was not performed. This is a restriction on the action, not an FSB capture failure. [Finding](../.context/om2w/manual-native-20261021/tasks/d1970c16271496cbbe166ecbecc0a1d8/finding.json) |
| 54 | smartasset.com | Supported | Single/Beaverton ZIP 97007 and $174,250 gross minus $15,750 standard deduction represent the requested $158,500 taxable income; displayed 2025 federal tax is $30,887, excluding FICA. [Finding](../.context/om2w/manual-native-20261021/tasks/bc2ce7f206045dd2d322e5695a947219/finding.json) |
| 55 | superlawyers.com | Supported | Marilea W. Lewis has a Dallas divorce/family-law profile and verified inclusion in Top 50 Women Texas Super Lawyers. [Finding](../.context/om2w/manual-native-20261021/tasks/d1807551297ac60ecaaabbd2a2ed301a_110325/finding.json) |
| 56 | www.airbnb.com | Supported | The alternate Cleveland loft has the original recovery scenario's October 23–26 dates, 2 adults, 2 children, 1 pet, $237/night and verified parking, washer and gym. The first logical task date basis is retained across the midnight retry; cancellation/alarm caveats are disclosed. [Finding](../.context/om2w/manual-native-20261021/tasks/a13e4231a3d6a7000c622c56448d97ba/attempt-2/finding.json) |
| 57 | www.backcountry.com | Supported | The filtered highest-discount men's hiking result is La Sportiva Spire GTX: GORE-TEX, 40% off, $125.40 and rating 4.3/27. An unobscured catalog frame and product DOM support it. [Finding](../.context/om2w/manual-native-20261021/tasks/d730f4ff450da1bd60a836163736ef6a_110325/attempt-3/finding.json) |
| 58 | www.cboe.com | Qualified; zero | The closed BEPTEC page and constituents identify top gainer AT&S/code ATSv, but the saved display has no calendar date. Attribution to the latest market close remains unconfirmed. [Finding](../.context/om2w/manual-native-20261021/tasks/01abae9608f2d8752a83e08f136f720c/finding.json) |
| 59 | www.drugs.com | Supported | The public pill database matches pink oval imprint 894 5 to Eliquis/apixaban 5 mg; this is a database match, not authentication of a physical pill. [Finding](../.context/om2w/manual-native-20261021/tasks/5e4e89c9b6fdaee7a41aca5601b82e04/attempt-2/finding.json) |
| 60 | www.google.com | Supported | Three individual merchant listings document black drip coffee makers, sale comparisons and item prices within $25–$60; shipping and tax exclusions are explicit. [Finding](../.context/om2w/manual-native-20261021/tasks/c1d6ea6f2196d25782cc3646ff3090db/finding.json) |
| 61 | www.healthline.com | Supported | The answer compares a whole-food pescatarian pattern and an explicitly identified Mediterranean-style pescatarian adaptation; it does not label the unmodified Mediterranean diet pescatarian. [Finding](../.context/om2w/manual-native-20261021/tasks/64b76158720a69e4a5c31a55d54928bf/attempt-3/finding.json) |
| 62 | www.ikea.com | Supported | The cheapest qualifying black KIVIK three-seat leather-finish/4+ star sofa is verified already in the cart at quantity one. Credit is for the requested end state, not proof that this recovery added it; no duplicate was created. [Finding](../.context/om2w/manual-native-20261021/tasks/c6c9dc6079677cef594cec2fa6b16602/attempt-2/finding.json) |
| 63 | www.justice.gov | Supported | The official DOJ OIG headquarters directory shows the requested address and phone. [Finding](../.context/om2w/manual-native-20261021/tasks/d9a8689393effeed75ea0866e44e1def/finding.json) |
| 64 | www.kaggle.com | Supported | Active/Reward order identifies ARC-AGI-3 at the highest advertised prize; Most Votes order and the public code comments page identify Daniel Franzen's Milestone 2 Solution at 1,000 votes. Notebook execution/body display is not required or claimed. [Finding](../.context/om2w/manual-native-20261021/tasks/1c3b747ae12ccee895745f82e3f2ef8a/attempt-5/finding.json) |
| 65 | www.nba.com | Supported | The saved per-game playoff table compares all five listed runs; Devin Booker's maximum is 33.7 PPG in 2022–23. [Finding](../.context/om2w/manual-native-20261021/tasks/6b2cfae0ef25c73d1224b6ab74cb8b63/attempt-3/finding.json) |
| 66 | www.parkers.co.uk | Supported | The first Best Cars entry is Renault 4 E-Tech, and its running-cost page records tax, insurance group and charging measures. A fixed all-in ownership total is not published or invented. [Finding](../.context/om2w/manual-native-20261021/tasks/47186fac8e7c7277af01144644eb4e0b_070826/attempt-4/finding.json) |
| 67 | www.publicstorage.com | Supported | The 60538 search identifies a nearby climate-controlled 10×10 unit; the site's size guide explicitly says it fits two small bedrooms. [Finding](../.context/om2w/manual-native-20261021/tasks/2fc51dd3febd447f0fdcdabca8d944ce_110325/finding.json) |
| 68 | www.qatarairways.com | Supported | Qatar's official Economy table gives cabin and checked baggage weights by fare and route, including the Brazil cabin exception. [Finding](../.context/om2w/manual-native-20261021/tasks/005be9dd91c95669d6ddde9ae667125c/finding.json) |
| 69 | www.recreation.gov | Not met; zero | Cook Day Use Area is nearby, but horseback riding is mentioned for the lake region without verified riding access in the specific park. [Finding](../.context/om2w/manual-native-20261021/tasks/6174e5ddd40cfbdc33ee1502f40bac39/finding.json) |
| 70 | www.ryanair.com | Not met; zero | The Dublin search was prepared but not submitted because it accepts Website Terms. No fare under US$100 was verified; authorization pending is finalized as zero for this assessment. [Finding](../.context/om2w/manual-native-20261021/tasks/cf757a775fa1224acfc7998489e199a8/finding.json) |
| 71 | www.target.com | Supported | The requested search is performed with Miami, FL and Human Resources chips. A genuine HR role is inspected; the site's North Miami title/Miramar address inconsistency is disclosed rather than called a Miami-city job. [Finding](../.context/om2w/manual-native-20261021/tasks/6ebde509dca8f15c0fa1bd74f071e8d6/finding.json) |
| 72 | www.verizon.com | Supported | The public quote selector has four lines and Auto Pay off, giving Prepaid Unlimited $180/month plus taxes and fees, with the multi-line discount retained. [Finding](../.context/om2w/manual-native-20261021/tasks/c7c07ec10c668625a21ba64165d719bb/finding.json) |

Finalization freezes the evaluation outcome for this evidence snapshot. Later user authorization, new browser actions or changed website data require a new review rather than rewriting these finalized results.

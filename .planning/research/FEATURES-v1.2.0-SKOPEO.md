# Feature Research

**Domain:** On-demand, page-native assistance HUD; first capability pack is permission-scoped Google Drive vendor-contract lifecycle and compliance intelligence
**Researched:** 2026-07-14
**Confidence:** HIGH for the intended user experience (approved framing, supplied requirements, and supplied HUD board agree); MEDIUM for corpus-edge behavior until representative agreements, scans, amendments, permissions, and notification recipients are available for validation

## Product Thesis

Skopeo is not a contract application placed beside Google Drive. It is an explicitly invoked instrument layer placed on the Drive content the user is already viewing. Its first proof must turn a vendor folder from a pile of files into three trustworthy user states:

1. **Folder intelligence:** what is active, what is due, who owns it, and what is missing.
2. **Reading awareness:** whether the open document governs today, which document does, and which exact facts or clauses support the answer.
3. **Cited ask:** a focused, permission-scoped answer that distinguishes governing evidence from superseded context and exposes uncertainty.

The feature test is not “can AI search the folder?” It is “can a user safely tell what governs today, what deadline is next, and why Skopeo believes that—without leaving Drive or trusting an uncited summary?”

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any P1 item below makes the first capability pack unsafe or materially incomplete.

| Feature | User-visible expected behavior | Complexity | Dependencies / scope notes |
|---------|--------------------------------|------------|----------------------------|
| On-demand invocation and immediate dismissal | A user deliberately opens Skopeo from a discoverable control or shortcut, can dismiss the current surface immediately, and has a universal kill gesture. When off, no Skopeo chrome, marks, dimming, or layout changes remain. | MEDIUM | Platform lifecycle; all other HUD behavior depends on this. “On demand” governs visibility, not whether an authorized corpus may be maintained in the background. |
| Host-page integrity | Drive and Docs remain the working surface. Skopeo annotations stay attached to relevant files, clauses, dates, or page edges without obscuring required host controls or shifting the host layout. | HIGH | Semantic anchoring, isolated rendering, collision handling, viewport/zoom/scroll resilience. |
| Consistent HUD grammar and attention budget | Every capability pack composes the same six primitives—anchor mark, entity chip, halo, rail, ghost layer, and gate—and spends only the attention level appropriate to the current state. | HIGH | Shared rendering contracts and page-state router. A primitive being available does not mean all six appear at once. |
| Accessible vendor-corpus recognition | When invoked in the designated `vendor agreements` area, Skopeo recognizes accessible vendor subfolders and reports which documents are ready, pending, unreadable, or missing without exposing inaccessible content. | HIGH | Drive identity/access checks, corpus enrollment rules, incremental indexing, OCR/readability status. |
| Vendor overview in the folder | Each accessible vendor can show owner, document count/index state, active-version status, next material date, memo status when applicable, and urgent gaps. Quiet vendors stay visually quiet. | MEDIUM | Corpus state, owner mapping, lineage, date facts, gap detection. The mockup’s exact row density is illustrative, not mandatory. |
| Governing-document lineage | Skopeo distinguishes executed agreements, amendments, historical/superseded documents, and the document or clause that governs today. Opening an old document produces an unambiguous superseded warning and a direct path to the governing source. | HIGH | Stable document identities, relationship/precedence model, effective dates, provenance, conflict handling. |
| Exact, cited contract facts | The reading rail exposes exact signed, expiration/termination, renewal, notice-window/deadline, and written-notice destination facts with source locations and confidence/review state. Missing or conflicting evidence is shown as such; no date is silently guessed. | HIGH | Structured extraction, date-rule evaluation, citations, confidence states, OCR quality, governing lineage. |
| Deadline and consequence view | Users can see upcoming notice deadlines and term/renewal events across accessible vendors, understand the consequence of silence (for example, auto-renewal), and distinguish a notice deadline from the later renewal or expiration date. | HIGH | Exact facts and date computation first; accessible corpus aggregation; timeline/rail presentation. |
| Automatic 90-day owner notification | The mapped owner is notified 90 days before the **notice deadline**, with vendor, exact deadline, consequence, and a link back to the cited governing source. Missing owners or undeliverable alerts are surfaced as gaps rather than treated as complete. | HIGH | Trusted notice deadline, owner identity, scheduler/delivery channel, deduplication, delivery state. Notification is required; drafting or sending a termination notice is not. |
| Permission-scoped cited questions | A user can ask a vendor-specific or accessible-corpus question. Each material conclusion resolves to source locations; governing and superseded evidence are labeled; confidence and conflicts are explicit. Querying and derived data never broaden current Drive access. | HIGH | Access check at query time, permission-partitioned retrieval/traversal/cache, lineage, citations, uncertainty behavior. |
| Corpus-gap visibility | Skopeo calls out missing final agreements, unreadable/low-confidence scans, incomplete indexing, owner TBD, unresolved version conflicts, missing required policy documents, and other evidence gaps that could invalidate an answer or alert. | MEDIUM | Corpus completeness rules and quality state; must be visible in folder and answer contexts. |
| “Document 10” decision protocol | When a question or proposed conclusion counts as a decision for the relevant corpus, Skopeo visibly requires review of Document 10 and links to it. If Document 10 is missing or inaccessible, Skopeo cannot present the decision as cleared. | MEDIUM | Configurable corpus policy and document identity; should not be hard-coded as “the tenth file in sort order.” |
| Exceptional memo handling | Only agreements explicitly classified as complex (the supplied examples are Articulate, Priceline, and possibly Click Trust) show memo-required/on-file/missing status and a link to the authorized user-written memo. Routine agreements do not generate memo work. | MEDIUM | Complexity flag, memo identity/access, policy display. AI-authored memos for every vendor are out of scope. |
| Failure and uncertainty states | If Skopeo cannot identify the page, anchor reliably, read a scan, resolve governing precedence, access a source, or complete an answer, it says what failed and offers a safe next step instead of rendering confident but stale guidance. | MEDIUM | Shared platform error states, source freshness, confidence thresholds. |

### Differentiators (Competitive Advantage)

These are the behaviors that make Skopeo more than a Drive search box or generic contract chat.

| Feature | Value proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Meaning attached to the thing it describes | A status badge sits on the vendor folder, a supersession warning sits on the old document, and a cited fact resolves to the exact clause. Users do not have to reconcile a detached sidebar with the page. | HIGH | Semantic anchoring is the reusable platform advantage; selector-only placement would be too brittle. |
| Cross-document truth, not cross-document find | Skopeo answers “what governs today?” by reasoning over agreement lineage and effective state, rather than returning the most semantically similar clause. | HIGH | Central differentiator for amendments, renewals, and conflicting historical language. |
| Governing-versus-historical contrast | When a historical clause conflicts with today’s language, the answer can show both while marking which governs. This turns contradiction into useful context without presenting a false tie. | HIGH | Requires lineage and clause provenance; especially important for the Priceline airline-channel question. |
| Verifiable confidence | Extracted facts, inferred relationships, ambiguous evidence, and low-OCR sources have visibly different trust states. A user can open the source behind any consequential claim. | MEDIUM-HIGH | Confidence is a user contract, not merely an internal score. Raw percentages alone are insufficient without a state/explanation. |
| Sparse, state-shaped attention | The folder spends attention on deadlines and gaps; reading spends it on state and cited facts; ask temporarily ghosts the host page; a gate is reserved for genuinely consequential actions. The interface is quiet by design. | MEDIUM | Protects trust and prevents “movie HUD” noise. Orange halo is scarce, not decoration. |
| Permission-preserving intelligence | Skopeo can answer across what the user may access while preventing the graph, cache, citations, snippets, counts, and error messages from becoming a side channel into restricted sources. | HIGH | Must hold at ingestion, query, traversal, caching, display, and access revocation. |
| Reusable capability-pack contract | The Drive contract pack proves that page sensing, semantic anchors, attention states, and six primitives can support future genres without each pack inventing custom chrome. | HIGH | Platform value should be proven through this pack, not expanded into multiple packs in this milestone. |
| Operational gaps as first-class answers | “The final agreement is missing,” “the owner is unknown,” or “this scan is too weak to compute the deadline” is treated as useful output, not a failed search. | MEDIUM | Particularly valuable where current operations rely on memory or incomplete accounting copies. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why it may sound attractive | Why it is problematic here | Approved alternative |
|---------|-----------------------------|----------------------------|----------------------|
| Always-on HUD | Assistance feels instantly available | Violates the approved invocation model, consumes attention, and makes every page feel surveilled or cluttered | Explicit invocation; immediate dismissal; universal kill gesture |
| Separate contract dashboard or Drive replacement | Easier to design than anchoring into a changing host page | Splits the user’s workflow and evades the core product thesis | Keep Drive/Docs as the interaction surface; overlay only what is relevant |
| Keyword search or generic RAG as the product | Fast route to a chat demo | Similarity does not establish which amendment governs, calculate the notice deadline, or resolve conflicting clauses | State-aware lineage + structured facts + cited retrieval |
| A graph explorer for end users | Makes the knowledge graph visible and impressive | Adds a second complex UI without helping the routine deadline or decision task | Render graph-derived state as folder badges, lineage links, facts, and citations |
| Autonomous legal/commercial action | “Draft and send notice” looks like end-to-end automation | A mistaken recipient, deadline, or governing clause has material consequences; requirements ask for intelligence and alerts, not unsupervised action | Notify and link to evidence; leave drafting/sending/approval to an explicit later workflow |
| AI-generated memo for every agreement | Produces uniform-looking documentation | Conflicts with the stated 1% exception rule, creates review burden, and may falsely imply legal approval | Show memo required/on-file/missing only for flagged complex agreements; preserve human authorship |
| One confident answer that hides conflict | Feels simpler | Conceals superseded language, missing documents, low OCR, and unresolved precedence | Label governing evidence, historical contrast, confidence, and gaps |
| Cross-user or global derived cache | Improves apparent speed and recall | Can leak snippets, source existence, or graph relationships after permission changes | Permission-partitioned derived data with access revalidation |
| Persistent ambient rail while Skopeo is off | Seems like a harmless reminder | “Off” would no longer mean off | Rail may persist only within the active Skopeo session/state |
| Every primitive on every page | Demonstrates the design system | Creates noise and destroys the meaning of halos and gates | Apply the attention-budget matrix; most states use only a subset |
| Per-pack custom chrome | Lets each domain optimize independently | Produces inconsistent behavior, accessibility drift, and an unmaintainable overlay ecosystem | Six shared primitives with constrained pack composition |
| Treating every HUD mockup control as committed scope | Makes planning look concrete | Static sketches include illustrative controls such as “Draft notice” and “Add to memo” that were not approved as workflows | Use the board for grammar, states, and attention; validate each action separately |
| GCP, NotebookLM, Sheets, LM Studio, or Graphify as required runtime surfaces | The source conversation mentioned them as possible architecture | Contradicts the native FSB framing and adds foreign permission/runtime contracts | Selectively adapt useful graph concepts inside FSB; no runtime dependency on those systems |

## Attention Budget and Interaction-State Matrix

| User state | Entry / exit | Attention level | Allowed primitives | Required content | Explicitly quiet or absent |
|------------|--------------|-----------------|--------------------|------------------|----------------------------|
| **Off** | Default; reached by dismiss or universal kill | None | None | None | No rail, anchors, chips, halos, ghosting, gates, or host layout residue |
| **Invoked, context being identified** | User toggles Skopeo on | Ambient | Rail or compact invocation/lens chip | Current page/pack state, progress or a concise unsupported-context message | No speculative annotations; no modal interruption |
| **Vendor folder intelligence** | Accessible `vendor agreements` folder or vendor subfolder recognized | Anchored | Folder anchors/chips, sparse halo for urgent anomalies, deadline rail/timeline | Owners, active state, next deadlines, gaps, index quality; corpus ask entry | No blanket dimming; quiet vendors receive little/no decoration |
| **Document reading awareness** | Agreement document opened while Skopeo is active | Anchored | Supersession anchor/banner, fact/entity chips, clause marks, fact rail, rare halo | Governing status, route to current source, exact cited facts, Document 10/memo policy when relevant | No unrelated corpus dashboard; no gate merely for reading |
| **Focused ask** | User invokes ask and chooses vendor or accessible corpus scope | Focused anchored layer | Temporary ghost layer, answer panel, citation anchors/chips | Query scope, conclusion, governing sources, historical contrast, confidence/gaps, permission boundary | Ghost layer disappears on exit; no inaccessible-source details |
| **Consequential action (platform capability, not a baseline contract workflow)** | A future pack/action is about to cause an irreversible send, payment, disclosure, or commitment | Interstitial | Gate only, with minimal supporting evidence | Consequence, evidence, hold/proceed choices | No decorative marks competing with the gate; first contract-pack scope does not add autonomous notice sending |

### Attention Rules

- **Halo scarcity:** use only for anomalies that merit immediate attention, such as a near notice deadline, unresolved governing conflict, or missing source that blocks a consequential conclusion.
- **Ghosting is temporary:** it supports the focused ask state and must never become a permanent filter on Drive.
- **A gate protects an action, not a fact:** uncertainty is shown through confidence/gap states; it does not warrant a modal on ordinary reading.
- **One state, one main job:** folder = prioritize; document = orient and verify; ask = answer and cite.

## Contract Workflow Coverage Matrix

| Workflow moment | User question / job | Skopeo behavior required in v1.2.0 | Evidence of success | Complexity |
|-----------------|---------------------|------------------------------------|---------------------|------------|
| Enter vendor corpus | “What do we actually have?” | Identify accessible vendor folders, ready/pending/unreadable files, missing final copies, and unassigned owners | Folder intelligence matches accessible Drive contents; restricted files do not appear in output | HIGH |
| Triage portfolio | “What needs attention first?” | Order or visually emphasize upcoming notice deadlines, term/renewal events, auto-renew consequences, and blocking gaps | The earliest actionable notice deadline is distinct from expiration/renewal and links to its source | HIGH |
| Open a historical document | “Can I rely on this?” | Mark it superseded, name/link the governing document or clause, and explain effective relationship | Opening Doc 4 clearly routes to Doc 11 if Doc 11 governs | HIGH |
| Review key facts | “When was it signed; when and how can we terminate?” | Show exact dates, notice calculation, required delivery method/address, citations, and confidence/review state | Every fact can be opened at its supporting span; ambiguity is visible | HIGH |
| Ask a business-constraint question | “Can we sell rental cars through airline channels under Priceline?” | Answer from the accessible corpus, identify governing language, contrast relevant superseded text, show confidence/gaps, and cite each material claim | User can open the governing clause directly and sees the Document 10 rule before treating it as a decision | HIGH |
| Prepare for a decision | “Have we satisfied our internal review rule?” | Surface Document 10 as mandatory; show memo status only if this agreement is flagged complex | No “cleared” state when Document 10 is missing/inaccessible; routine vendors are not assigned memos | MEDIUM |
| Approach notice deadline | “Will the owner know in time?” | Notify the mapped owner 90 days before the notice deadline; surface missing owner/delivery failure | Notification record links to deadline evidence; repeat indexing does not create duplicate alerts | HIGH |
| Add a new agreement or amendment | “Does the new document change what governs?” | Incrementally update lineage, active status, affected facts, deadline timeline, alerts, and citations while retaining history | A newly executed amendment supersedes only what it actually changes; stale facts/alerts are replaced | HIGH |
| Encounter incomplete evidence | “Can I trust this result?” | State the missing/unreadable/conflicting evidence and limit the conclusion accordingly | No confident governing/date claim is shown from an unresolved or inaccessible corpus | MEDIUM |

## Feature Dependencies

```text
On-demand lifecycle + kill switch
    └──enables──> Context/genre recognition
                      └──selects──> Contract capability pack
                                        └──composes──> Shared six-primitive HUD grammar
                                                           └──placed by──> Semantic anchors

Drive identity + current permission checks
    └──gates──> Accessible corpus discovery
                   └──feeds──> Incremental source ingestion + quality state
                                  └──feeds──> Stable document identity + provenance
                                                 └──enables──> Governing lineage
                                                                ├──enables──> Exact active facts
                                                                ├──enables──> Governing-vs-historical answers
                                                                └──enables──> Safe source replacement

Exact active facts + date-rule evaluation
    └──enables──> Notice deadline / consequence timeline
                      └──requires──> Owner mapping
                                         └──enables──> 90-day notification + delivery state

Permission-scoped retrieval/traversal
    ├──requires──> Query-time access revalidation
    ├──requires──> Provenance + citations + confidence/gap states
    └──enables──> Vendor ask and accessible-corpus ask

Corpus policy (Document 10 rule + complex-agreement flag)
    ├──enhances──> Reading and ask states
    └──controls──> Human memo status (required / on file / missing)
```

### Dependency Notes

- **Lineage must precede answers and alerts.** A precise extraction from a superseded agreement is still the wrong fact. Active-state resolution is therefore a hard gate for “governs today,” notice, renewal, and compliance outputs.
- **Permissions must constrain every downstream feature.** Filtering only the final search results is insufficient; source ingestion, graph edges, cached summaries, citations, counts, notifications, and error text can all leak restricted information.
- **Notifications are downstream of trusted date computation.** Scheduling from an unverified expiration date or from “90 days before renewal” instead of “90 days before the notice deadline” would reproduce the business risk the feature is meant to remove.
- **Semantic anchoring and HUD grammar are separate foundations.** Grammar defines what can render; anchoring determines whether it stays attached to the right host content. Both are required before the first pack feels native.
- **Document 10 is a policy identity, not a list position.** It needs an explicit configured source identity and access state so reordering or renaming Drive files does not bypass the rule.
- **Memo support depends on an explicit exception flag.** No system inference should silently create memo obligations for the other 99% of agreements.
- **Representative corpus fixtures are a validation dependency.** At minimum, later UAT needs an active agreement, superseded agreement, amendment, scan/low-OCR document, missing-final-copy case, conflicting-date case, inaccessible source, Document 10, complex vendor memo, and near notice deadline.

## MVP Definition: v1.2.0 Skopeo

### Launch With

- [ ] **Complete on-demand lifecycle** — explicit invocation, immediate dismissal, universal kill gesture, and zero HUD residue when off.
- [ ] **Reusable HUD contract** — six shared primitives, accessible interaction states, attention budgets, and anchor behavior proven on the three Drive contract states.
- [ ] **Permission-scoped Drive corpus state** — accessible vendor folders and document quality/gap status without permission leakage.
- [ ] **Governing lineage** — active, amended, historical, and superseded states with direct routes to governing sources.
- [ ] **Exact cited facts** — signed, expiration/termination, renewal, notice window/deadline, written-notice destination, owner, confidence, and evidence gaps.
- [ ] **Folder prioritization** — upcoming events, auto-renew consequences, owner/memo status where relevant, and corpus gaps using sparse anchored/ambient presentation.
- [ ] **90-day owner notification** — scheduled from the notice deadline with evidence link, deduplication, and missing/delivery-failure state.
- [ ] **Permission-scoped cited ask** — vendor and accessible-corpus questions with governing/historical distinction, source navigation, confidence, and uncertainty.
- [ ] **Decision safeguards** — Document 10 protocol plus human-authored memo status for explicitly complex agreements only.
- [ ] **Incremental truth maintenance** — new or replaced documents update lineage, facts, queries, timeline, and alerts without leaving stale active claims.

### Add After Validation (v1.x)

- [ ] **Assisted notice drafting** — consider only after lineage/date/address accuracy and human review behavior are proven; sending remains separately authorized.
- [ ] **Additional Drive contract policy rules** — add configurable review requirements only when real workflows demonstrate repeated need beyond Document 10.
- [ ] **Additional contract sources** — expand beyond the designated Drive hierarchy only after permission and identity behavior is validated on Drive.
- [ ] **Portfolio/team workflow features** — acknowledgements, escalation chains, assignment changes, and collaboration history after the single-owner notification loop is proven.
- [ ] **More contract-specific views** — clause comparison or richer event maps only if users cannot answer the core jobs through the three approved states.

### Future Consideration (v2+)

- [ ] **Additional capability packs/page genres** — the platform is designed for them, but this milestone should prove the contract pack before broadening scope.
- [ ] **Autonomous contract actions** — draft/send termination notices or modify Drive documents only with a separate consequential-action design, permissions, and approval audit.
- [ ] **End-user graph explorer** — defer unless users demonstrate a job that citations, lineage links, and folder intelligence cannot serve.
- [ ] **Automated complex-agreement memos** — defer because the stated workflow requires rare, human-authored memos.
- [ ] **Standalone CLM/dashboard surface** — conflicts with the overlay-first premise unless later evidence shows a workflow impossible to serve in Drive.

## Feature Prioritization Matrix

| Feature | User value | Implementation cost | Priority |
|---------|------------|---------------------|----------|
| On-demand lifecycle / kill switch / zero residue | HIGH | MEDIUM | P1 |
| Shared primitives + attention-state contract | HIGH | HIGH | P1 |
| Semantic anchoring on folder rows, document state, clauses, and page edge | HIGH | HIGH | P1 |
| Permission-scoped corpus recognition and derived data | HIGH | HIGH | P1 |
| Governing document lineage | HIGH | HIGH | P1 |
| Exact facts, notice computation, citations, and confidence | HIGH | HIGH | P1 |
| Folder deadline/gap/owner intelligence | HIGH | MEDIUM-HIGH | P1 |
| 90-day owner notification with delivery state | HIGH | HIGH | P1 |
| Cited vendor/corpus ask | HIGH | HIGH | P1 |
| Document 10 protocol | HIGH | MEDIUM | P1 |
| Complex-vendor memo status and link | MEDIUM | MEDIUM | P1 (narrow) |
| Richer timeline visualization beyond prioritization needs | MEDIUM | MEDIUM | P2 |
| Assisted notice draft | MEDIUM | HIGH | P2 |
| Team acknowledgement/escalation workflow | MEDIUM | HIGH | P2 |
| More page genres/capability packs | HIGH long-term | HIGH | P3 for this milestone |
| Graph explorer | LOW for core jobs | HIGH | P3 |
| Autonomous notice sending / source-document mutation | LOW until trust proven | VERY HIGH | P3 / separate authorization |

**Priority key:** P1 = required to validate v1.2.0; P2 = add only after core validation or demonstrated need; P3 = explicitly deferred from this milestone.

## Adjacent-Approach Comparison

This is a product-shape comparison grounded in the supplied conversation, not a current market-capability review.

| User need | Manual Drive folders | Proposed per-vendor notebook + sheet approach from source conversation | Generic folder chat/search | Skopeo approach |
|-----------|----------------------|---------------------------------------------------------------|----------------------------|-----------------|
| Know what governs today | Human remembers file order/history | Master summary must be manually kept authoritative | May retrieve conflicting versions without precedence | Maintained lineage; active/superseded state attached to files and citations |
| Avoid missed renewal | Calendar/spreadsheet maintained separately | Sheet tracks dates and notifications | Chat answers only when asked | Exact notice deadline and consequence surfaced in Drive; owner alerted 90 days before notice deadline |
| Verify a constraint | Manually open multiple documents | Ask the correct vendor notebook | Search similar passages | Permission-scoped answer labels governing and historical evidence and links to exact spans |
| See incomplete records | Relies on team memory | Depends on notebook/sheet enrollment discipline | Missing sources may be invisible | Missing final copies, unreadable scans, index gaps, owner gaps, and conflicts are first-class state |
| Work in existing tools | Native but little intelligence | User crosses Drive, notebook, and sheet | Often detached chat/sidebar | Drive stays Drive; intelligence appears only when invoked and anchors to host content |

## Recommended Requirement Categories

The later REQ-ID pass should group testable requirements under these categories, in dependency order:

1. **Invocation & host integrity** — on/off lifecycle, kill behavior, no residue, accessibility, anchor resilience.
2. **HUD grammar & routing** — six primitives, attention budget, context/pack selection, shared failure states.
3. **Drive permissions & corpus state** — enrollment, accessible scope, revocation, index/quality/gap states.
4. **Document identity & governing lineage** — agreement/amendment/supersession/effective relationships, source replacement.
5. **Facts, provenance & confidence** — exact contract facts, source locations, notice computation, ambiguity and OCR state.
6. **Folder intelligence & notification** — portfolio priorities, timeline, owners, 90-day notification, delivery/gap state.
7. **Cited ask & decision protocol** — scoped questions, governing/history distinction, Document 10 rule, memo exception behavior.
8. **Incremental correctness & UAT** — new amendment, revoked access, conflicting dates, low OCR, missing final copy, no duplicate alerts, and host redesign/anchor recovery.

## Sources

- `.context/attachments/PPgV1d/AI-Driven Vendor Contract Lifecycle and Compliance Management System_summary.txt` — primary business requirements and workflow evidence.
- `.context/hud-design-reference/export/canvas-4/Canvas-4.dc.html` — primary interaction/design evidence for the six primitives, attention ladder, and three Drive contract states.
- `.planning/milestones/v1.2.0-SKOPEO-PROJECT-SNAPSHOT.md` — approved v1.2.0 framing, constraints, and milestone boundaries.

---
*Feature research for: FSB v1.2.0 Skopeo*
*Researched: 2026-07-14*

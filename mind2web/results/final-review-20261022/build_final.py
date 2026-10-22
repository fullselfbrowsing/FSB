"""Recompute the frozen benchmark and publish a separate, explicitly AI-reviewed composite."""
import collections
import csv
import datetime
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent
REPO = OUT.parents[2]
BENCH = REPO / 'mind2web'
ORIGINAL = BENCH / 'results/full-public-claude-20261019g'
RECOVERY = BENCH / 'results/rerun-public-claude-20261020'
MANUAL = REPO / '.context/om2w/manual-native-20261021'
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()


def read(path):
    return json.loads(path.read_text())


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def relative(path, root=REPO):
    return os.path.relpath(path, root)


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def write_csv(name, rows, fields):
    with (OUT / name).open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: row.get(key, '') for key in fields} for row in rows)


def verify_final():
    seal = read(OUT / 'FINAL-SEAL.json')
    for name, expected in seal['files'].items():
        assert digest(REPO / name) == expected, f'Final artifact changed: {name}'
    audit = read(OUT / 'FINAL-AUDIT.json')
    for item in audit['sealed_benchmark_files'] + audit['source_files']:
        assert digest(REPO / item['path']) == item['expected'], f'Source changed: {item["path"]}'
    scores = read(OUT / 'SCORES.json')
    rows = read(OUT / 'per-task-final.json')
    reviews = read(OUT / 'task-reviews.json')
    assert len(rows) == len({row['task_id'] for row in rows}) == 300
    assert len(reviews) == len({row['task_id'] for row in reviews}) == 72
    assert sum(row['reviewed_composite_credit'] for row in rows) == scores['reviewed_composite']['supported_total']
    assert not scores['pending_evaluations'] and scores['status'] == 'finalized'
    print(json.dumps({'final_seal': 'verified', 'source_files': len(audit['source_files']),
                      'sealed_benchmark_files': len(audit['sealed_benchmark_files']),
                      'full_denominator': 300, 'reviewed_tasks': 72,
                      'reviewed_composite': scores['reviewed_composite']['supported_total']}, indent=2))


if (OUT / 'FINAL-SEAL.json').exists():
    if sys.argv[1:] != ['--verify']:
        raise SystemExit('Already finalized. Use --verify; create a new review for later evidence.')
    verify_final()
    raise SystemExit(0)
assert not sys.argv[1:], 'Only --verify is accepted after finalization'

# Snapshot the structured inputs. Saved raw evidence and sealed judge files stay in place.
inputs = OUT / 'inputs'
inputs.mkdir(exist_ok=True)
input_sources = {
    'manual-results.json': MANUAL / 'results.json',
    'manual-manifest.json': MANUAL / 'manifest.json',
    'manual-evidence-audit.json': MANUAL / 'evidence-audit.json',
    'manual-evidence-review.json': MANUAL / 'evidence-review.json',
    'manual-resume-status.json': MANUAL / 'resume-status.json',
    'manual-reconnection.json': MANUAL / 'reconnection-20261022.json',
    'prior-preservation-audit.json': MANUAL / 'sealed-preservation-audit.json',
    'corrected-scores.json': RECOVERY / 'CORRECTED-SCORES.json',
    'corrected-per-task.json': RECOVERY / 'per-task-corrected.json',
}
for name, source in input_sources.items():
    destination = inputs / name
    if destination.exists():
        assert digest(destination) == digest(source), f'Input changed during build: {source}'
    else:
        shutil.copy2(source, destination)

manual = read(inputs / 'manual-results.json')
manual_manifest = read(inputs / 'manual-manifest.json')
corrected = read(inputs / 'corrected-scores.json')
old_rows = read(inputs / 'corrected-per-task.json')
source = Path(corrected['source']['path'])
assert digest(source) == corrected['source']['sha256']
dataset = read(source)
shutil.copy2(source, inputs / 'dataset.json')
tasks = {row['task_id']: row for row in dataset}
assert len(dataset) == len(tasks) == 300
assert len(old_rows) == len({row['task_id'] for row in old_rows}) == 300
assert {row['task_id'] for row in old_rows} == set(tasks)
assert len(manual['tasks']) == len({row['task_id'] for row in manual['tasks']}) == 72
assert manual['counts'] == {'visibly_completed': 55, 'partial': 15, 'blocked_site': 2}
decisions = read(OUT / 'review-decisions.json')
assert sorted(row[0] for row in decisions['decisions']) == list(range(1, 73))
assert all(row[1] in ('supported', 'qualified', 'not_met') for row in decisions['decisions'])

# Recompute all six jobs directly from original and serial-recovery judge records.
selected = set(read(RECOVERY / 'manifest.json')['task_ids'])
assert len(selected) == 44
jobs = {}
raw_sources = []
judge_file_audit = []
for variant in ('official', 'strict'):
    for pass_number in range(1, 4):
        name = f'claude-{variant}-pass{pass_number}'
        records = []
        for run, expected in ((ORIGINAL, set(tasks)), (RECOVERY, selected)):
            path = run / 'judge' / name / 'results.jsonl'
            rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
            terminal = [row for row in rows if row.get('judgment_status') == 'complete']
            pending = [row for row in rows if row.get('judgment_status') != 'complete']
            mapped = {row['task_id']: row for row in terminal}
            assert len(terminal) == len(mapped) == len(expected)
            assert set(mapped) == expected
            assert all(row['predicted_label'] in (0, 1) for row in terminal)
            assert not any(row.get('infrastructure_error') for row in terminal)
            for index, row in enumerate(rows):
                if row in pending:
                    assert row.get('judgment_status') == 'pending' and row.get('infrastructure_error')
                    assert row.get('predicted_label') is None
                    assert any(later['task_id'] == row['task_id'] and later.get('judgment_status') == 'complete'
                               for later in rows[index + 1:]), 'Unresolved or non-superseded judge pending'
            judge_file_audit.append({'path': relative(path), 'raw_records': len(rows),
                                    'terminal_records': len(terminal), 'superseded_pending_records': len(pending)})
            records.append(mapped)
            raw_sources.append(path)
        original_records, recovery_records = records
        original_bits = {tid: row['predicted_label'] for tid, row in original_records.items()}
        adjusted_bits = {tid: (recovery_records[tid]['predicted_label'] if tid in selected else original_bits[tid]) for tid in tasks}
        assert sum(original_bits.values()) == corrected['jobs'][name]['original']
        assert sum(adjusted_bits.values()) == corrected['jobs'][name]['corrected']
        for row in old_rows:
            assert original_bits[row['task_id']] == row[name + '_original']
            assert adjusted_bits[row['task_id']] == row[name + '_corrected']
        jobs[name] = {'variant': variant, 'original_successes': sum(original_bits.values()),
                      'recovery_adjusted_successes': sum(adjusted_bits.values()), 'expected': 300,
                      'original_bits': original_bits, 'adjusted_bits': adjusted_bits}

majorities = {}
automated = {}
for variant in ('official', 'strict'):
    family = [job for job in jobs.values() if job['variant'] == variant]
    majorities[variant] = {tid: int(sum(job['adjusted_bits'][tid] for job in family) >= 2) for tid in tasks}
    original_majority = sum(sum(job['original_bits'][tid] for job in family) >= 2 for tid in tasks)
    adjusted_majority = sum(majorities[variant].values())
    original_mean = sum(job['original_successes'] for job in family) / 900
    adjusted_mean = sum(job['recovery_adjusted_successes'] for job in family) / 900
    assert original_mean == corrected[variant]['original_mean']
    assert adjusted_mean == corrected[variant]['corrected_mean']
    assert original_majority == corrected[variant]['majority']['original']
    assert adjusted_majority == corrected[variant]['majority']['corrected']
    automated[variant] = {'original_mean': original_mean, 'recovery_adjusted_mean': adjusted_mean,
                          'original_majority': original_majority, 'recovery_adjusted_majority': adjusted_majority,
                          'expected': 300, 'passes': 3}
manual_ids = {row['task_id'] for row in manual['tasks']}
failure_union = {tid for tid in tasks if not majorities['official'][tid] or not majorities['strict'][tid]}
assert manual_ids == failure_union
retained = set(tasks) - failure_union
assert len(retained) == 228

review_map = {order: (verdict, rationale) for order, verdict, rationale in decisions['decisions']}
reviews = []
all_evidence_files = set(input_sources.values()) | {source, OUT / 'review-decisions.json'} | set(raw_sources)
all_observations = []
for task in manual['tasks']:
    assert task['task'] == tasks[task['task_id']]['confirmed_task']
    task_root = MANUAL / 'tasks' / task['task_id']
    latest = MANUAL / task['latest_attempt_dir']
    finding_path = MANUAL / task['finding_file']
    assert read(finding_path) == task['finding']
    assert read(finding_path)['state'] == task['state']
    verdict, rationale = review_map[task['order']]
    if verdict != 'not_met':
        assert task['state'] == 'visibly_completed'
    for path in task_root.rglob('*'):
        if path.is_file() and (path.suffix in ('.json', '.jsonl', '.png') or path.name.endswith('.ax.txt')):
            all_evidence_files.add(path)
    for path in task_root.rglob('observations.jsonl'):
        for line in path.read_text().splitlines():
            observation = json.loads(line)
            image, ax = Path(observation['png']), Path(observation['ax_file'])
            assert image.exists() and ax.exists()
            actual = digest(image)
            assert actual == observation['sha256']
            all_observations.append({'path': relative(image), 'sha256': actual, 'ax': relative(ax)})
    focused = []
    for name in decisions['focused_images_reviewed'].get(str(task['order']), []):
        path = task_root / name
        assert path.exists()
        focused.append(relative(path))
    reviews.append({'order': task['order'], 'task_id': task['task_id'], 'level': tasks[task['task_id']]['level'],
                    'task': task['task'], 'website': task['website'], 'prior_manual_state': task['state'],
                    'adjudication': verdict, 'conservative_credit': int(verdict == 'supported'),
                    'assessment': rationale, 'recorded_answer': task['finding']['answer'],
                    'qualification_notes': task['finding']['notes'],
                    'finding': relative(finding_path), 'latest_attempt_dir': relative(latest),
                    'last_screenshot': relative(Path(task['last_observation']['png'])),
                    'focused_images_reviewed': focused, 'prior_capture_symptom': task.get('prior_capture_symptom'),
                    'snapshot_sha256': digest(finding_path), 'review_protocol': decisions['protocol']})
assert len(all_observations) == manual['observations'] == 850
assert len({o['path'] for o in all_observations}) == len(all_observations)
review_by_id = {row['task_id']: row for row in reviews}
counts = dict(collections.Counter(row['adjudication'] for row in reviews))
assert counts == {'supported': 49, 'not_met': 17, 'qualified': 6}
per_task = []
for old in old_rows:
    tid = old['task_id']
    review = review_by_id.get(tid)
    credit = review['conservative_credit'] if review else 1
    origin = ('manual_' + review['adjudication']) if review else 'retained_both_claude_majorities'
    per_task.append({**old, 'task': tasks[tid]['confirmed_task'], 'website': tasks[tid]['website'],
                     'corrected_official_majority': majorities['official'][tid],
                     'corrected_strict_majority': majorities['strict'][tid],
                     'manually_reviewed': bool(review), 'manual_order': review['order'] if review else None,
                     'manual_adjudication': review['adjudication'] if review else None,
                     'reviewed_composite_credit': credit, 'credit_source': origin})
total = sum(row['reviewed_composite_credit'] for row in per_task)
assert total == 228 + counts['supported'] == 277
by_level = {}
for level in ('easy', 'medium', 'hard'):
    group = [row for row in per_task if row['level'] == level]
    reviewed_group = [row for row in reviews if row['level'] == level]
    by_level[level] = {'expected': len(group), 'retained': sum(row['credit_source'] == 'retained_both_claude_majorities' for row in group),
                       'manual_supported': sum(row['adjudication'] == 'supported' for row in reviewed_group),
                       'manual_qualified': sum(row['adjudication'] == 'qualified' for row in reviewed_group),
                       'manual_not_met': sum(row['adjudication'] == 'not_met' for row in reviewed_group),
                       'composite_supported': sum(row['reviewed_composite_credit'] for row in group)}
assert [by_level[level]['expected'] for level in by_level] == [80, 141, 79]
capture_subset = [row for row in reviews if row['prior_capture_symptom']]
assert len(capture_subset) == 28
capture_counts = dict(collections.Counter(row['adjudication'] for row in capture_subset))

preserved = []
for item in read(inputs / 'prior-preservation-audit.json')['files']:
    path = REPO / item['path']
    assert digest(path) == item['expected'], f'Sealed benchmark changed: {path}'
    preserved.append({'path': relative(path), 'expected': item['expected']})
assert len(preserved) == 43
source_files = [{'path': relative(path), 'expected': digest(path)} for path in sorted(all_evidence_files)]
save('task-reviews.json', reviews)
write_csv('task-reviews.csv', reviews, ['order', 'task_id', 'level', 'task', 'prior_manual_state', 'adjudication', 'conservative_credit', 'assessment', 'finding', 'last_screenshot'])
save('per-task-final.json', per_task)
write_csv('per-task-final.csv', per_task, list(per_task[0]))
scores = {'status': 'finalized', 'finalized_at': NOW, 'expected': 300,
          'dataset': corrected['source'], 'new_claude_judge_runs': 0, 'pending_evaluations': 0,
          'automated': automated,
          'jobs': {name: {key: value for key, value in job.items() if not key.endswith('_bits')} for name, job in jobs.items()},
          'manual_review': {'protocol': decisions['protocol'], 'reviewer': decisions['reviewer'],
                            'blind': False, 'automated_webjudge': False, 'goals_and_findings_reviewed': 72,
                            'historical_operator_completed_count': 55, 'counts': counts,
                            'supported_rate_within_selected_failures': counts['supported'] / 72,
                            'native_observations_integrity_verified': 850,
                            'all_native_images_independently_reexamined': False,
                            'focused_images_reexamined': sum(len(v) for v in decisions['focused_images_reviewed'].values()),
                            'prior_28_missing_trajectory_outcomes': capture_counts},
          'reviewed_composite': {'supported_total': total, 'expected': 300, 'rate': total / 300,
                                 'retained_both_claude_majorities': 228, 'new_supported_manual_reviews': 49,
                                 'uncredited_qualified': 6, 'uncredited_not_met': 17,
                                 'autonomous_benchmark_score': False, 'by_level': by_level},
          'limitations': ['The 228 carried-forward tasks were not independently re-reviewed.',
                          'This is one non-blind Codex review, not six new Claude passes or upstream WebJudge equivalence.',
                          'Manual recovery used native macOS observation, public rendered DOM, multiple fresh retries and user-completed Target verification.',
                          'Manual recovery does not retain the automated per-task time/action budget; products, dates and shared cart state changed.',
                          'An already-correct IKEA cart is credited as an end state, not a new actor-caused addition.',
                          'Qualified and unsuccessful tasks remain zeros; pending Ryanair terms authorization does not leave the evaluation pending.']}
save('SCORES.json', scores)
audit = {'verified_at': NOW, 'ok': True, 'expected': 300, 'raw_judge_jobs_recomputed': 12,
         'raw_judge_records_read': sum(row['raw_records'] for row in judge_file_audit),
         'terminal_judge_records_recomputed': 6 * (300 + 44),
         'superseded_pending_judge_records': sum(row['superseded_pending_records'] for row in judge_file_audit),
         'judge_files': judge_file_audit, 'manual_task_reviews': 72,
         'native_observations_verified': 850, 'every_image_reexamined': False,
         'sealed_benchmark_files': preserved, 'source_files': source_files,
         'checks': ['All 300 original and 44 serial-recovery IDs match the fixed dataset.',
                    'All twelve raw judge jobs are terminal and match every stored per-task original/corrected bit.',
                    'All automated totals, means and majorities recompute exactly.',
                    'The 72 manual tasks equal the union of corrected official/strict majority failures.',
                    'All 850 PNG hashes and companion accessibility files verify.',
                    'The 300-row composite carries forward 228 tasks and credits 49 supported reviews without double counting.',
                    'All 43 previously sealed benchmark hashes match; no benchmark source output was rewritten.']}
save('FINAL-AUDIT.json', audit)

# The final report is a new canonical document; existing sealed REPORT.md files are immutable.
review_link = lambda path: relative(REPO / path, BENCH)
artifact = 'results/' + OUT.name
lines = ['# FSB Online-Mind2Web — final consolidated report', '',
         f'Finalized {NOW}. All 300 automated tasks and all 72 selected manual reviews are accounted for. No evaluation jobs remain pending.', '',
         '**Final automated result: official mean 83.33%; strict mean 77.00%, after the separately sealed serial recovery.** These remain the Claude Opus 5.5 + public FSB results. The later Codex-run recovery is reported separately and does not overwrite them.', '',
         '## Automated scores, independently recomputed', '',
         '| Evaluation | Official mean, 3 passes | Official majority | Strict mean, 3 passes | Strict majority |',
         '|---|---:|---:|---:|---:|',
         '| Original 300-task run | 79.00% | 238/300 (79.33%) | 72.67% | 218/300 (72.67%) |',
         '| After 44-task serial recovery | 83.33% | 251/300 (83.67%) | 77.00% | 231/300 (77.00%) |', '',
         'Mean and majority are different statistics. Every mean retains all 300 tasks in each pass; missing trajectories and terminal format failures remain zeros. The six original and six recovery judge files were read directly, and every stored per-task verdict and aggregate was checked.', '',
         'The append-only judge logs also retain 20 historical quota-pause pending records. Each is followed by a completed judgment for the same task. Only the 2,064 terminal task judgments are used, with all 20 superseded records preserved and audited; none remains pending.', '',
         '| Claude judge pass | Original successes / 300 | Adjusted successes / 300 |',
         '|---|---:|---:|']
for name, job in jobs.items():
    lines.append(f'| {name} | {job["original_successes"]} | {job["recovery_adjusted_successes"]} |')
lines += ['', 'The serial rerun exported 16 of 44 trajectories; 27 capture failures and one startup/rig failure left 28 without trajectories. Each recovery judge pass passed 13 tasks. The original and rerun reports, provenance and judge outputs remain sealed and unchanged.', '',
          '## Codex reassessment of the 72 recovered tasks', '',
          'The earlier operational ledger marked 55 tasks completed, 15 partial and two site-blocked. This final review compared every full goal and finding, checked saved public DOM and accessibility evidence where needed, and reexamined focused screenshots for disputed outcomes. It is a single non-blind review by the same assistant that performed the manual recovery. It does not claim an independent judge or reinspection of all 850 images.', '',
          '| Reassessed outcome | Tasks | Conservative credit |', '|---|---:|---:|',
          '| Supported full goal | 49 | 49 |', '| Qualified / incomplete evidence | 6 | 0 |',
          '| Goal not met, including two site-blocked tasks | 17 | 0 |', '| Total manually reviewed | 72 | 49 |', '',
          'The six qualified outcomes below explain why the earlier 55 completed labels are not all counted as confirmed successes. A qualification records uncertainty, not proof that the returned item or answer is wrong.', '',
          '| Manual task | Qualification withheld from full-success credit |', '|---|---|']
for row in reviews:
    if row['adjudication'] == 'qualified':
        lines.append(f'| {row["order"]} | {row["assessment"].replace("|", chr(92) + "|")} |')
lines += ['', 'The separate conservative task-attainment policy gives no full-goal credit when requested information or action remains missing. It is not a reimplementation of upstream `upstream-filter-v1`: for example, a correctly submitted invalid-order lookup may pass upstream’s valid-empty-result rule while still receiving zero here because no order details were obtained. The Target pizza is credited as a verified individual $9.99 vegetarian frozen-cheese-pizza match; the site’s $5–$9.99 bracket is not represented as an exact reproduction of a $5–$10 filter requirement.', '',
          '## Reviewed-completion composite — diagnostic only', '',
          f'**{total}/300 = {total / 3:.2f}%** supported or carried forward after recovery: **228** tasks passed a majority of both existing Claude variants, plus **49** supported manual reviews. The other **23** receive zero. The 228 retained tasks were not independently re-reviewed. This is a mixed-actor, reviewed-completion composite, not a revised autonomous Claude score or a leaderboard result.', '',
          'The 72 reviewed tasks are the union of the 49 corrected official failures and 69 corrected strict failures. They overlap: adding manual successes directly to 251 or 231 would double count some tasks. The composite replaces the whole 72-task union and retains the other 228, so each task is counted exactly once.', '',
          '| Difficulty | Tasks | Retained Claude tasks | Supported manual reviews | Composite |', '|---|---:|---:|---:|---:|']
for level, group in by_level.items():
    lines.append(f'| {level} | {group["expected"]} | {group["retained"]} | {group["manual_supported"]} | {group["composite_supported"]}/{group["expected"]} |')
lines += ['', 'Manual recovery used pinned public FSB 0.9.92 / MCP 0.11.2 for task actions, native macOS Chrome screenshots and public rendered DOM for observations. The user completed Target’s verification; BoardGameGeek later loaded without a challenge. Native setup input was used only to reconnect the same FSB installation. Multiple fresh attempts, changing live content, shared cookies/carts and the absence of the original time/action budget make this a recovery diagnostic rather than a controlled repeat.', '',
          'The IKEA cart already held the qualifying sofa: that row credits the verified end state, not a new addition caused by the recovery. Relative dates are anchored to the original manual scenario; the Airbnb retry retained October 23–26 across midnight. Original Claude judging occurred earlier and used different absolute expansions of relative dates. Prices and availability are historical observations, not current quotes.', '',
          '## Remaining unsuccessful tasks — finalized as zero', '',
          'No CAPTCHA-paused tasks remain. Ryanair terms authorization was not received; its unverified fare is scored zero for this finalized assessment. No booking, purchase, application or terms acceptance was performed to close a score gap. The other stopping conditions are recorded below; they are not all FSB failures.', '',
          '| Manual task | Unmet requirement / stopping condition |', '|---|---|']
for row in reviews:
    if row['adjudication'] == 'not_met':
        lines.append(f'| {row["order"]} | {row["assessment"].replace("|", chr(92) + "|")} |')
lines += ['', '## What the 28 missing screenshot trails establish', '',
          'Their final capture diagnostics were 23 host-permission refusals, three different-extension URL errors and two out-of-bounds errors. These establish missing evidence, not that every underlying task had been completed. In the conservative review, that subset has **15 supported, three qualified and ten unmet** tasks. Earlier Chrome-interference and power-saving explanations were hypotheses, not proven causes for all 28.', '',
          'Native screenshots exposed actual renderer crashes behind some “Cannot access contents” messages. Separately, the reconnect check demonstrated a fresh-client startup race: the first inventory read reported an unattached extension, but subsequent reads on the same client succeeded after one second. Neither observation establishes a universal cause.', '',
          '## Integrity, limits and artifacts', '',
          f'All **850** native PNG records retain matching SHA-256 hashes and companion accessibility files. All **43** previously sealed benchmark file hashes still match. The source inventory additionally hashes the manual findings, journals and evidence. Hashes establish preservation, not correctness of every frame or verdict. Eighteen historical cleanup/retry receipts remain incomplete or errored; this is not a count of tabs still open. Latest Target and BoardGameGeek cleanup succeeded; the manual helper and its temporary keep-awake process were stopped.', '',
          'The automated actor and judges both use `claude-opus-5-5`, medium effort, with the pinned Online-Mind2Web revision `eacad896a84dc5b65e29b0b06e4699ab0544d701`. “Official” denotes the upstream answer-visible variant, not OSU endorsement. “Strict” hides the actor’s final answer. These substitute-model judgments are uncalibrated, not OSU-verified and not directly comparable to the o4-mini leaderboard.', '',
          f'- [Final scores and methodology]({artifact}/SCORES.json)',
          f'- [All 300 tasks, JSON]({artifact}/per-task-final.json) · [CSV]({artifact}/per-task-final.csv)',
          f'- [All 72 reassessments, JSON]({artifact}/task-reviews.json) · [CSV]({artifact}/task-reviews.csv)',
          f'- [Final audit and source hashes]({artifact}/FINAL-AUDIT.json) · [final seal]({artifact}/FINAL-SEAL.json)',
          '- [Original sealed Claude report](results/full-public-claude-20261019g/REPORT.md)',
          '- [Sealed serial-recovery Claude report](results/rerun-public-claude-20261020/REPORT.md)',
          f'- [Historical manual operations report]({relative(MANUAL / "REPORT.md", BENCH)})', '',
          '## Manual review ledger', '', '| # | Site | Final review | Basis and evidence |', '|---:|---|---|---|']
for row in reviews:
    from urllib.parse import urlparse
    label = {'supported': 'Supported', 'qualified': 'Qualified; zero', 'not_met': 'Not met; zero'}[row['adjudication']]
    assessment = row['assessment'].replace('|', '\\|')
    lines.append(f'| {row["order"]} | {urlparse(row["website"]).hostname} | {label} | {assessment} [Finding]({review_link(row["finding"])}) |')
lines += ['', 'Finalization freezes the evaluation outcome for this evidence snapshot. Later user authorization, new browser actions or changed website data require a new review rather than rewriting these finalized results.', '']
canonical = BENCH / 'FINAL-REPORT.md'
canonical.write_text('\n'.join(lines))
(OUT / 'REPORT.md').write_text('# Final evaluation review\n\nSee the [final consolidated report](../../FINAL-REPORT.md).\n\n'
    'Automated Claude recovery-adjusted means: official **83.33%**, strict **77.00%**.\n\n'
    'Codex conservative saved-evidence review: **49 supported**, **6 qualified**, **17 not met** out of 72.\n\n'
    'Reviewed composite: **277/300 (92.33%)**, comprising 228 retained Claude-majority tasks and 49 supported manual reviews. '
    'This is not an autonomous benchmark score.\n\n'
    'Machine-readable artifacts: [scores](SCORES.json), [300-task ledger](per-task-final.json), '
    '[72-task reassessment](task-reviews.json), [audit](FINAL-AUDIT.json), [seal](FINAL-SEAL.json).\n')
save('review-manifest.json', {'version': 1, 'status': 'finalized', 'finalized_at': NOW,
    'task_count': 300, 'manual_review_count': 72, 'pending_evaluation_jobs': 0,
    'review_protocol': decisions['protocol'], 'canonical_report': relative(canonical),
    'sealed_benchmark_mutated': False, 'new_claude_judge_runs': 0,
    'manual_sources_snapshotted': list(input_sources), 'build_script': relative(Path(__file__))})
seal_files = [path for path in OUT.rglob('*') if path.is_file() and path.name != 'FINAL-SEAL.json'] + [canonical]
save('FINAL-SEAL.json', {'sealed_at': NOW, 'status': 'finalized',
                        'files': {relative(path): digest(path) for path in sorted(seal_files)}})
verify_final()
print(json.dumps({'automated': automated, 'manual_review': counts,
                  'reviewed_composite': total, 'by_level': by_level}, indent=2))

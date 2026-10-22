"""Diagnostic replay of released o4-mini screenshot summaries, without screenshots or actions."""
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import random
import sys
from urllib.request import urlopen

BENCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BENCH / 'judge'))
from om2w_judge.engines import ClaudeCodeEngine, CodexEngine
from om2w_judge.runner import MODE, UPSTREAM
from utils import extract_predication
from metrics import metrics, bootstrap, mcnemar

REVISION = 'f0d805ee0e9e0b3ea70911e45e5264b72968f3dc'
BASE = f'https://raw.githubusercontent.com/OSU-NLP-Group/Online-Mind2Web/{REVISION}/data/evaluation_results/online_mind2web_evaluation_results/'
AGENTS = {'agente': 'Agent-E', 'browser_use': 'Browser_Use', 'claude_computer_use_3.5': 'Claude_Computer_Use_3.5',
          'claude_computer_use_3.7': 'Claude_Computer_Use_3.7', 'operator': 'Operator', 'seeact': 'SeeAct'}


def load_data(cache):
    names = ['human_label.json'] + [f'webjudge_o4-mini/{name}_results.json' for name in AGENTS]
    digests = {}
    for name in names:
        target = cache / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(urlopen(BASE + name, timeout=30).read())
        digests[name] = hashlib.sha256(target.read_bytes()).hexdigest()
    source = {'base': BASE, 'sha256': digests}
    meta = cache / 'sources.json'
    if meta.exists() and json.loads(meta.read_text()) != source:
        raise ValueError('Cached calibration sources changed')
    meta.write_text(json.dumps(source, indent=2) + '\n')
    labels = {r['task_id']: r for r in json.loads((cache / 'human_label.json').read_text())}
    return labels, source


def select_sample(cache, per_agent=30, seed=20261015):
    labels, source = load_data(cache)
    selected = []
    for filename, agent in AGENTS.items():
        candidates = []
        for line in (cache / f'webjudge_o4-mini/{filename}_results.json').read_text().splitlines():
            row = json.loads(line)
            label = labels.get(row['task_id'])
            if not label or label['confirmed_task'] != row['confirmed_task']:
                continue
            raw_label = int(label[agent + '_human_label'])
            if raw_label not in (0, 1, 2) or row['final_eval'] not in (0, 1):
                raise ValueError('Unexpected source label')
            candidates.append({'task_id': row['task_id'], 'agent': agent, 'human': int(raw_label == 1),
                               'human_raw': raw_label, 'o4_mini': row['final_eval'], 'record': row})
        if len(candidates) < per_agent:
            raise ValueError(f'{agent}: insufficient paired rows')
        rng = random.Random(f'{seed}:{agent}')
        selected.extend(rng.sample(sorted(candidates, key=lambda r: r['task_id']), per_agent))
    return selected, source


def final_system_prompt():
    tree = ast.parse((UPSTREAM / 'methods/webjudge_online_mind2web.py').read_text())
    function = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == MODE)
    assignment = next(n for n in function.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'system_msg' for t in n.targets))
    return ast.literal_eval(assignment.value)


def replay_messages(row):
    record = row['record']
    summaries = [r['Response'] for r in record['image_judge_record'] if int(r.get('Score', 0)) >= 3][:50]
    text = f"User Task: {record['confirmed_task']}\n\nKey Points: {record['key_points']}\n\nAction History:\n[Not released in this diagnostic replay]\n\nThe potentially important snapshots of the webpage in the agent's trajectory and their reasons:\n"
    text += '\n'.join(f'{i + 1}. {summary}' for i, summary in enumerate(summaries))
    return [{'role': 'system', 'content': final_system_prompt()}, {'role': 'user', 'content': text}]


def report(rows, prediction, ci_samples):
    result = metrics(rows, prediction)
    result['ci95_clustered_by_task'] = bootstrap(rows, prediction, samples=ci_samples)
    if prediction != 'o4_mini':
        result['agreement_with_o4_mini'] = sum(r[prediction] == r['o4_mini'] for r in rows) / len(rows)
        result['mcnemar_vs_o4_mini'] = mcnemar(rows, prediction)
        result['same_family_probe'] = {}
        for family, subset in [('claude', [r for r in rows if r['agent'].startswith('Claude_')]), ('other', [r for r in rows if not r['agent'].startswith('Claude_')])]:
            if subset:
                result['same_family_probe'][family] = metrics(subset, prediction)['false_positive_rate']
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['claude', 'codex'], default='claude')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--per-agent', type=int, default=30)
    parser.add_argument('--seed', type=int, default=20261015)
    parser.add_argument('--bootstrap', type=int, default=2000)
    parser.add_argument('--cache', type=Path, default=BENCH / 'cache/calibration')
    parser.add_argument('--output', type=Path, default=BENCH / 'results/calibration')
    args = parser.parse_args()
    selected, source = select_sample(args.cache, args.per_agent, args.seed)
    args.output.mkdir(parents=True, exist_ok=True)
    sample = {'seed': args.seed, 'per_agent': args.per_agent, 'sources': source,
              'pairs': [[r['agent'], r['task_id']] for r in selected]}
    sample_path = args.output / 'sample.json'
    if sample_path.exists() and json.loads(sample_path.read_text()) != sample:
        raise ValueError('Output already contains a different sample; use another output directory')
    sample_path.write_text(json.dumps(sample, indent=2) + '\n')
    baseline = report(selected, 'o4_mini', args.bootstrap)
    (args.output / 'o4-mini-baseline.json').write_text(json.dumps(baseline, indent=2) + '\n')
    if args.prepare_only:
        print(json.dumps(baseline, indent=2))
        return
    engine_dir = args.output / args.engine
    engine_dir.mkdir(exist_ok=True)
    cls = ClaudeCodeEngine if args.engine == 'claude' else CodexEngine
    engine = cls(usage_log=engine_dir / 'usage.jsonl', attempts=1)
    completed = []
    for row in selected:
        target = engine_dir / f"{row['agent']}-{row['task_id']}.json"
        messages = replay_messages(row)
        digest = hashlib.sha256(json.dumps(messages).encode()).hexdigest()
        if target.exists():
            cached = json.loads(target.read_text())
            if cached['prompt_sha256'] != digest or cached.get('model') != engine.model or cached.get('effort') != engine.effort:
                raise ValueError('Replay prompt changed; use a new output directory')
            reply = cached['reply']
        else:
            try:
                reply = engine.generate(messages)[0]
            except Exception as error:
                (engine_dir / 'blocked.json').write_text(json.dumps({'completed': len(completed), 'error': str(error)}, indent=2) + '\n')
                print(f'Stopped after {len(completed)} judgments: {error}', file=sys.stderr)
                break
            target.write_text(json.dumps({'reply': reply, 'prompt_sha256': digest, 'model': engine.model, 'effort': engine.effort}, indent=2) + '\n')
        completed.append({**row, 'prediction': extract_predication(reply, MODE)})
    if completed:
        result = {'requested': len(selected), 'completed': len(completed), 'diagnostic_only': True,
                  'judge': report(completed, 'prediction', args.bootstrap), 'o4_mini_paired': report(completed, 'o4_mini', args.bootstrap)}
        (engine_dir / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
    return 0 if len(completed) == len(selected) else 1


if __name__ == '__main__':
    sys.exit(main() or 0)

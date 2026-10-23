"""Paired binary-label metrics and bootstrap intervals clustered by task."""
from collections import defaultdict
from math import comb
import random


def metrics(rows, prediction='prediction'):
    if not rows:
        raise ValueError('No labeled rows')
    if any(r['human'] not in (0, 1) or r[prediction] not in (0, 1) for r in rows):
        raise ValueError('Metrics require binary labels')
    tp = sum(r['human'] == r[prediction] == 1 for r in rows)
    tn = sum(r['human'] == r[prediction] == 0 for r in rows)
    fp = sum(r['human'] == 0 and r[prediction] == 1 for r in rows)
    fn = sum(r['human'] == 1 and r[prediction] == 0 for r in rows)
    n = len(rows)
    accuracy = (tp + tn) / n
    human_sr, judge_sr = (tp + fn) / n, (tp + fp) / n
    chance = human_sr * judge_sr + (1 - human_sr) * (1 - judge_sr)
    by_agent = defaultdict(list)
    for row in rows:
        by_agent[row['agent']].append(row)
    gaps = {agent: sum(r[prediction] - r['human'] for r in agent_rows) / len(agent_rows) for agent, agent_rows in by_agent.items()}
    return {'n': n, 'accuracy': accuracy, 'kappa': (accuracy - chance) / (1 - chance) if chance < 1 else None,
            'precision': tp / (tp + fp) if tp + fp else 0,
            'recall': tp / (tp + fn) if tp + fn else 0,
            'f1': 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0,
            'human_success_rate': human_sr, 'judge_success_rate': judge_sr, 'signed_gap': judge_sr - human_sr,
            'mean_agent_gap': sum(gaps.values()) / len(gaps), 'mean_absolute_agent_gap': sum(abs(v) for v in gaps.values()) / len(gaps),
            'agent_gaps': gaps, 'false_positive_rate': fp / (fp + tn) if fp + tn else 0,
            'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn}


def mcnemar(rows, left='prediction', right='o4_mini'):
    left_only = sum((r[left] == r['human']) and (r[right] != r['human']) for r in rows)
    right_only = sum((r[right] == r['human']) and (r[left] != r['human']) for r in rows)
    n = left_only + right_only
    p = min(1.0, 2 * sum(comb(n, k) for k in range(min(left_only, right_only) + 1)) / (2 ** n)) if n else 1.0
    return {'left_only_correct': left_only, 'right_only_correct': right_only, 'exact_p_two_sided': p}


def bootstrap(rows, prediction='prediction', samples=2000, seed=20261015):
    groups = defaultdict(list)
    for row in rows:
        groups[row['task_id']].append(row)
    ids = sorted(groups)
    if not ids or samples < 1:
        raise ValueError('Bootstrap needs rows and positive samples')
    rng = random.Random(seed)
    names = ['accuracy', 'kappa', 'precision', 'recall', 'mean_agent_gap', 'mean_absolute_agent_gap']
    values = {name: [] for name in names}
    for _ in range(samples):
        selected = [row for key in rng.choices(ids, k=len(ids)) for row in groups[key]]
        result = metrics(selected, prediction)
        for name in names:
            if result[name] is not None:
                values[name].append(result[name])
    def interval(items):
        ordered = sorted(items)
        return [ordered[int((len(ordered) - 1) * 0.025)], ordered[int((len(ordered) - 1) * 0.975)]] if ordered else None
    return {name: interval(items) for name, items in values.items()}

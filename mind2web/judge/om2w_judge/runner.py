import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import threading
import re

from .cache import CacheIntegrityError, StageCache, bind_engine, json_digest
from .circuit import (CodexCircuit, GlobalCLISlots, CircuitOpen, InfrastructureError,
                      atomic_json, classify_error, file_lock)
from .engines import ClaudeCodeEngine, CodexEngine, FakeEngine
from .parsers import FormatError, parse_status

UPSTREAM = Path(__file__).resolve().parents[1] / 'upstream' / 'src'
if str(UPSTREAM) not in sys.path:
    sys.path.insert(0, str(UPSTREAM))
from .protocols.scorefield_v2 import WebJudge_Online_Mind2Web_eval

MODE = 'WebJudge_Online_Mind2Web_eval'
PROTOCOL = 'scorefield-v2'
UPSTREAM_COMMIT = 'f0d805ee0e9e0b3ea70911e45e5264b72968f3dc'


def source_fingerprints():
    root = Path(__file__).parent
    files = sorted(root.rglob('*.py'))
    files += [UPSTREAM / 'methods/webjudge_online_mind2web.py', UPSTREAM / 'utils.py',
              root.parent / 'requirements.lock.txt', root.parent.parent / 'config/codex-tool-isolation.json',
              root.parent.parent / 'config/codex-gpt61sol-browser-policy.json',
              root.parent.parent / 'config/codex-gpt61sol-browser-policy.receipt.json',
              root.parent.parent / 'config/model-family.json']
    return {os.path.relpath(file, root.parent): hashlib.sha256(file.read_bytes()).hexdigest()
            for file in files}


def load_v2(directory, variant='official'):
    if variant not in ('official', 'strict'):
        raise ValueError('Unsupported judge variant')
    result = json.loads((directory / 'result.json').read_text())
    if result.get('schema_version') != 'online-mind2web-v2':
        raise ValueError('Expected online-mind2web-v2')
    if result['task_id'] != directory.name:
        raise ValueError('task_id and directory disagree')
    actions, screenshots = [], []
    for index, step in enumerate(result['action_history']):
        if step['step'] != index:
            raise ValueError('Non-contiguous trajectory')
        screenshot = (directory / 'trajectory' / step['screenshot']).resolve()
        if screenshot.parent != (directory / 'trajectory').resolve() or not screenshot.is_file():
            raise ValueError('Missing or unsafe screenshot path')
        screenshots.append(str(screenshot))
        if not (variant == 'strict' and step['action'].startswith('TASK_COMPLETE -> ANSWER:')):
            actions.append(step['action'])
    return result, actions, screenshots


def evaluate(directory, engine, variant='official', protocol=PROTOCOL, context=None, cache=None):
    if protocol != PROTOCOL:
        raise ValueError('Use an archived environment to reproduce a historical protocol')
    result, actions, screenshots = load_v2(directory, variant)
    context = {**(context or {}), 'task_id': result['task_id'], 'protocol': protocol}
    messages, text, system, record, key_points = asyncio.run(
        WebJudge_Online_Mind2Web_eval(result['task'], actions, screenshots, engine, 3,
                                     context=context, cache=cache))
    response = bind_engine(engine, {**context, 'stage': 'final'}, cache).generate(messages)[0]
    label = parse_status(response)
    return {**result, 'input_text': text, 'system_msg': system, 'image_judge_record': record,
            'key_points': key_points, 'judge_protocol': protocol, 'rubric': 'upstream-filter-v1',
            'evaluation_details': {'response': response, 'predicted_label': label,
                                   'response_sha256': hashlib.sha256(response.encode()).hexdigest(),
                                   'parser': protocol}, 'predicted_label': label,
            'judgment_status': 'complete', 'infrastructure_error': False}


def read_jsonl(path):
    if not path.exists():
        return []
    data = path.read_bytes()
    if data and not data.endswith(b'\n'):
        raise CacheIntegrityError(f'Incomplete saved JSONL: {path.name}; bytes preserved')
    try:
        return [json.loads(line) for line in data.splitlines() if line.strip()]
    except (ValueError, UnicodeError) as error:
        raise CacheIntegrityError(f'Malformed saved JSONL: {path.name}') from error


def run_pass(root, output, engine, task_ids, variant='official', workers=1, retry_errors=False,
             protocol=PROTOCOL, job_id=None):
    root, output = Path(root).resolve(), Path(output).resolve()
    if protocol != PROTOCOL or not 1 <= workers <= 10:
        raise ValueError('Expected scorefield-v2 and task workers1..10')
    ids = list(task_ids)
    if not ids or len(set(ids)) != len(ids):
        raise ValueError('Unique expected task IDs are required')
    if any(not isinstance(t, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', t) for t in ids):
        raise ValueError('Unsafe task ID')
    output.mkdir(parents=True, exist_ok=True)
    # flock remains process-safe across different job output directories. Its
    # empty lock file persists; liveness is determined by the lock, not existence.
    with file_lock(output.parent / '.judge-worker.lock', blocking=False):
        owner = output.parent / '.judge-worker-owner.json'
        atomic_json(owner, {'pid': os.getpid(), 'job_id': job_id or output.name})
        try:
            return _run_pass(root, output, engine, ids, variant, workers, retry_errors, protocol, job_id or output.name)
        finally:
            owner.unlink(missing_ok=True)


def _run_pass(root, output, engine, ids, variant, workers, retry_errors, protocol, job_id):
    def fingerprint(task_id):
        directory = root / task_id
        digest = hashlib.sha256()
        for file in sorted(directory.rglob('*')) if directory.exists() else []:
            if file.is_file():
                digest.update(str(file.relative_to(directory)).encode())
                digest.update(b'\0')
                digest.update(file.read_bytes())
                digest.update(b'\0')
        return digest.hexdigest()

    manifest_file = root.parent / 'manifest.json'
    synthetic = isinstance(engine, FakeEngine) or (manifest_file.exists() and json.loads(manifest_file.read_text()).get('synthetic', False))
    sources = source_fingerprints()
    config = {'format_version': 2, 'engine': type(engine).__name__, 'model': engine.model,
              'effort': engine.effort, 'variant': variant, 'task_ids': ids, 'job_id': job_id,
              'inputs': {task_id: fingerprint(task_id) for task_id in ids}, 'synthetic': synthetic,
              'judge_protocol': protocol, 'rubric': 'upstream-filter-v1', 'upstream_commit': UPSTREAM_COMMIT,
              'source_sha256': sources, 'adapter_sha256': json_digest(sources),
              'judge_source_sha256': hashlib.sha256((UPSTREAM / 'methods/webjudge_online_mind2web.py').read_bytes() + (UPSTREAM / 'utils.py').read_bytes()).hexdigest(),
              'workers': workers, 'engine_concurrency': engine.concurrency, 'global_cli_limit': 10,
              'format_attempts': engine.attempts, 'transport_attempts': engine.transport_attempts,
              'call_timeout_seconds': engine.timeout,
              'circuit_state': str(engine.circuit.path) if engine.circuit else None}
    config_path = output / 'config.json'
    if config_path.exists():
        if json.loads(config_path.read_text()) != config:
            raise ValueError('Output belongs to a different judge configuration or trajectory set')
    else:
        if any((output / name).exists() for name in ('results.jsonl', 'usage.jsonl', 'stages')):
            raise ValueError('Existing judge artifacts have no matching configuration')
        atomic_json(config_path, config)
    config_sha = json_digest(config)
    cache = StageCache(output / 'stages', config_sha)
    if engine.usage_log:
        saved_calls = read_jsonl(engine.usage_log)
        call_ids = set()
        for call in saved_calls:
            if (not call.get('call_id') or call['call_id'] in call_ids or call.get('task_id') not in ids or
                    call.get('job_id') != job_id or call.get('config_sha256') != config_sha or
                    call.get('input_sha256') != config['inputs'][call['task_id']] or
                    call.get('engine') != type(engine).__name__ or call.get('model') != engine.model or
                    call.get('effort') != engine.effort or call.get('stage') not in ('key_points', 'image', 'final') or
                    ('response' in call and hashlib.sha256(call['response'].encode()).hexdigest() != call.get('response_sha256'))):
                raise CacheIntegrityError('Invalid saved correlated usage history')
            call_ids.add(call['call_id'])
        cache.verify_call_history(saved_calls)
    rows_path = output / 'results.jsonl'
    rows = {}
    for row in read_jsonl(rows_path):
        task_id = row.get('task_id')
        if task_id not in ids:
            raise CacheIntegrityError('Unexpected task ID in saved results')
        infrastructure = row.get('infrastructure_error')
        if (type(infrastructure) is not bool or row.get('judge_protocol') != protocol or
                row.get('judgment_status') != ('pending' if infrastructure else 'complete') or
                (infrastructure and row.get('predicted_label') is not None) or
                (not infrastructure and (type(row.get('predicted_label')) is not int or row['predicted_label'] not in (0, 1))) or
                (row.get('error') and not infrastructure and row['predicted_label'] != 0)):
            raise CacheIntegrityError('Invalid saved terminal verdict or pending status')
        old = rows.get(task_id)
        if old and not old.get('infrastructure_error'):
            raise CacheIntegrityError('A terminal normal verdict was judged again')
        rows[task_id] = row
    lock = threading.Lock()
    unavailable = threading.Event()

    def work(task_id):
        if unavailable.is_set():
            return
        try:
            row = evaluate(root / task_id, engine, variant, protocol,
                           {'job_id': job_id, 'input_sha256': config['inputs'][task_id],
                            'config_sha256': config_sha}, cache)
        except CacheIntegrityError:
            raise
        except Exception as error:
            infrastructure = (isinstance(error, (InfrastructureError, CircuitOpen)) or
                              (not isinstance(error, (FormatError, FileNotFoundError, ValueError)) and
                               classify_error(error) in ('quota', 'authentication', 'transport', 'rate_limit')))
            row = {'task_id': task_id, 'predicted_label': None if infrastructure else 0,
                   'error': f'{type(error).__name__}: {error}', 'infrastructure_error': infrastructure,
                   'judgment_status': 'pending' if infrastructure else 'complete',
                   'error_kind': getattr(error, 'kind', 'format' if isinstance(error, FormatError) else
                                         'missing_trajectory' if isinstance(error, FileNotFoundError) else 'input'),
                   'judge_protocol': protocol}
            if infrastructure:
                unavailable.set()
        with lock:
            rows[task_id] = row
            with rows_path.open('a') as stream:
                stream.write(json.dumps(row) + '\n')
                stream.flush()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, [task_id for task_id in ids if task_id not in rows or
                           (retry_errors and rows[task_id].get('infrastructure_error'))]))
    succeeded = sum(rows.get(task_id, {}).get('predicted_label') == 1 for task_id in ids)
    pending = sum(task_id not in rows or bool(rows[task_id].get('infrastructure_error')) for task_id in ids)
    summary = {'engine': type(engine).__name__, 'model': engine.model, 'effort': engine.effort,
               'variant': variant, 'judge_protocol': protocol, 'rubric': 'upstream-filter-v1',
               'expected': len(ids), 'successes': succeeded, 'success_rate': succeeded / len(ids),
               'errors': sum(bool(rows.get(task_id, {}).get('error')) for task_id in ids),
               'pending_judgments': pending,
               'infrastructure_errors': sum(bool(rows.get(task_id, {}).get('infrastructure_error')) for task_id in ids),
               'complete': pending == 0, 'score_status': 'complete' if pending == 0 else 'provisional',
               'unverified': True, 'human_calibrated': False, 'synthetic': synthetic,
               'workers': workers, 'engine_concurrency': engine.concurrency, 'global_cli_limit': 10,
               'config_sha256': config_sha, 'cache_hits_this_process': engine.cache_hits}
    calls = read_jsonl(engine.usage_log) if engine.usage_log else engine.calls
    summary.update(calls=len(calls), format_errors=sum(bool(c.get('format_error')) for c in calls),
                   transport_errors=sum(not c.get('ok') and not c.get('format_error') for c in calls))
    if engine.circuit:
        summary['circuit'] = engine.circuit.status()
    atomic_json(output / 'summary.json', summary)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['claude', 'codex', 'fake'], required=True)
    parser.add_argument('--cli', help='Pinned judge CLI executable (Claude only)')
    parser.add_argument('--model')
    parser.add_argument('--effort', default='medium')
    parser.add_argument('--judge-protocol', default=PROTOCOL, choices=[PROTOCOL])
    parser.add_argument('--trajectories_dir', type=Path, required=True)
    parser.add_argument('--output_path', type=Path, required=True)
    parser.add_argument('--passes', type=int, default=1)
    parser.add_argument('--pass_number', type=int)
    parser.add_argument('--retry_errors', action='store_true')
    parser.add_argument('--variant', choices=['official', 'strict'], default='official')
    parser.add_argument('--num_workers', type=int, default=10)
    parser.add_argument('--engine-concurrency', type=int, default=10)
    parser.add_argument('--task_ids', required=True)
    parser.add_argument('--usage_log', type=Path)
    parser.add_argument('--attempts', type=int, default=3)
    parser.add_argument('--transport-attempts', type=int, default=2)
    parser.add_argument('--circuit-state', type=Path)
    args = parser.parse_args()
    if not 1 <= args.passes <= 3 or (args.pass_number is not None and not 1 <= args.pass_number <= 3):
        parser.error('Passes must be1..3')
    if not 1 <= args.num_workers <= 10 or not 1 <= args.engine_concurrency <= 10:
        parser.error('Worker and engine concurrency must be1..10')
    ids = json.loads(Path(args.task_ids).read_text()) if Path(args.task_ids).is_file() else args.task_ids.split(',')
    if args.engine in ('claude', 'codex'):
        manifest = args.trajectories_dir.parent / 'manifest.json'
        if manifest.exists() and not json.loads(manifest.read_text()).get('collection_complete'):
            parser.error('Collection must be complete before trajectory fingerprints are frozen')
    circuit_path = (args.circuit_state or args.output_path.parent / 'model-circuit.json').resolve()
    errors = pending = 0
    for repeat in ([args.pass_number] if args.pass_number else range(1, args.passes + 1)):
        output = args.output_path / f'{args.engine}-{args.variant}-pass{repeat}'
        circuit = CodexCircuit(circuit_path, family=args.engine) if args.engine in ('claude', 'codex') else None
        engine_class = {'claude': ClaudeCodeEngine, 'codex': CodexEngine, 'fake': FakeEngine}[args.engine]
        engine = engine_class(
            **({'model': args.model} if args.model else {}), **({'command': args.cli} if args.cli and args.engine == 'claude' else {}),
            effort=args.effort,
            concurrency=args.engine_concurrency, usage_log=args.usage_log or output / 'usage.jsonl',
            attempts=args.attempts, transport_attempts=args.transport_attempts, circuit=circuit,
            cli_slots=GlobalCLISlots(circuit_path.parent / 'judge-cli-slots'))
        summary = run_pass(args.trajectories_dir, output, engine, ids, args.variant,
                           args.num_workers, args.retry_errors, args.judge_protocol)
        print(json.dumps(summary), flush=True)
        errors += summary['errors']
        pending += summary['pending_judgments']
        if summary['pending_judgments']:
            break
    return 75 if pending else 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())

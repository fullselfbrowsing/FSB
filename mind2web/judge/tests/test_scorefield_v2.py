import ast
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from om2w_judge.parsers import FormatError, parse_image_score, parse_status
from om2w_judge.circuit import CodexCircuit, CircuitOpen, InfrastructureError, GlobalCLISlots, reset_epoch
from om2w_judge.engines import FakeEngine, CodexEngine, PROCESS_TRACE, run_process
from om2w_judge.runner import evaluate, run_pass, UPSTREAM
from om2w_judge.cache import CacheIntegrityError
from test_judge import fixture


IMAGE_MESSAGES = [{'role': 'system', 'content': 'Assign a score'}, {'role': 'user', 'content': 'Fixture'}]


@contextmanager
def process_timezone(name):
    original = os.environ.get('TZ')
    try:
        os.environ['TZ'] = name
        time.tzset()
        yield
    finally:
        if original is None: os.environ.pop('TZ', None)
        else: os.environ['TZ'] = original
        time.tzset()


def utc_epoch(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp()


class ParserTests(unittest.TestCase):
    def test_prose_score_does_not_steal_structured_field(self):
        for field in ['Score: 4', '**Score**: 4', '2. **Score**: 4', '- **Score:** 4', '+ Score: **4**']:
            response = '  Reasoning: Score board shows 1–2; Score is part of its title.\nScore board names are visible.\n\n' + field + '\n\n'
            self.assertEqual(parse_image_score(response), 4)

    def test_malformed_duplicate_and_trailing_fields_are_rejected(self):
        for reply in ['Score: 0', 'Score: 6', 'Score: 13', 'Score: 3.5', 'Score: -1',
                      'Score: ３', 'Score: 3 probably', 'Score: 3\nmore', 'Score: 3\nScore: 4',
                      'Score: 9\nScore: 4', '**Score** 2\nScore: 4', 'no score here',
                      '```\nScore: 4\n```', 'Score:', 'Score: "4"']:
            with self.subTest(reply=reply), self.assertRaises(FormatError):
                parse_image_score(reply)

    def test_status_is_an_exact_enum_not_a_substring(self):
        self.assertEqual(parse_status('Thoughts: success mentioned in prose\nStatus: failure\n'), 0)
        self.assertEqual(parse_status('Thoughts: no issue\nStatus: "success"'), 1)
        for reply in ['Status: unsuccessful', 'Status: success enough', 'Status: success\nStatus: failure',
                      'Status: failure\nfooter', 'Status: SUCCESS']:
            with self.assertRaises(FormatError):
                parse_status(reply)

    def test_all_three_prompt_templates_are_literal_upstream_strings(self):
        local = Path(__file__).resolve().parents[1] / 'om2w_judge/protocols/scorefield_v2.py'
        def prompts(path):
            tree = ast.parse(path.read_text())
            return {function.name: [ast.literal_eval(node.value) for node in ast.walk(function)
                    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('system_msg', 'prompt') for t in node.targets)]
                    for function in tree.body if isinstance(function, ast.AsyncFunctionDef)}
        self.assertEqual(prompts(local), prompts(UPSTREAM / 'methods/webjudge_online_mind2web.py'))
        self.assertEqual(hashlib.sha256((UPSTREAM / 'methods/webjudge_online_mind2web.py').read_bytes()).hexdigest(),
                         'e3cd499b7c1fc92cbd51d3c4216c95ebab774c2c2cd998c5ad6dad94710780c4')


class ColorEngine(FakeEngine):
    def __init__(self, fail_red=False, **kwargs):
        super().__init__(**kwargs)
        self.fail_red = fail_red
        self.final_colors = None

    def call(self, system, text, images, model):
        if 'Assign a score' in system:
            color = Image.open(io.BytesIO(images[0][0])).getpixel((0, 0))
            if color[0] > 200 and self.fail_red:
                self.fail_red = False
                raise RuntimeError('usage_limit_reached')
            if color[2] > 200:
                time.sleep(.005)
            score = 2 if color[2] > 200 else 3 if color[1] > 100 else 5
            return 'Reasoning: Score board label contains 1.\n\n**Score**: ' + str(score) + '\n', {}
        if 'Status:' in system:
            self.final_colors = [Image.open(io.BytesIO(data)).getpixel((0, 0)) for data, _ in images]
            return '\nThoughts: fixture\nStatus: success\n\n', {}
        return '**Key Points**:\n1. Inspect the fixture.', {}


def colored_fixture(root, count=3):
    directory = fixture(root)
    result = json.loads((directory / 'result.json').read_text())
    colors = ['blue', 'green', 'red']
    result['action_history'] = []
    for i in range(count):
        name = f'{i:04d}.png'
        Image.new('RGB', (32, 32), colors[i % 3]).save(directory / 'trajectory' / name)
        result['action_history'].append({'step': i, 'screenshot': name,
                                        'action': 'page -> NAVIGATE -> fixture | SUCCESS', 'thought': None})
    (directory / 'result.json').write_text(json.dumps(result))
    return directory


class PipelineTests(unittest.TestCase):
    def test_codex_raw_response_retains_crlf_and_whitespace(self):
        raw = b'\r\n  Saved provider text.\r\n\r\n'
        def local_result(command, **_kwargs):
            Path(command[command.index('-o') + 1]).write_bytes(raw)
            return json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 1}}), ''
        engine = CodexEngine()
        with patch('om2w_judge.engines.run_process', local_result):
            self.assertEqual(engine.generate([{'role': 'system', 'content': 'Key points'}, {'role': 'user', 'content': 'Fixture'}]), [raw.decode()])
        self.assertEqual(engine.calls[0]['response_sha256'], hashlib.sha256(raw).hexdigest())
        self.assertTrue(engine.calls[0]['spawn_admitted'])
        self.assertFalse(engine.calls[0]['cli_spawned'])

    def test_spawn_record_is_written_only_after_a_real_local_process_starts(self):
        record = {'cli_spawned': False}
        PROCESS_TRACE.record = record
        try:
            with tempfile.TemporaryDirectory() as directory:
                stdout, _ = run_process([sys.executable, '-c', 'print("fixture")'], cwd=directory,
                                        env=os.environ, input_text='', timeout=5)
            self.assertEqual(stdout.strip(), 'fixture')
            self.assertTrue(record['cli_spawned'])
            self.assertGreater(record['cli_pid'], 0)
            self.assertIn('cli_spawned_at', record)
            self.assertNotIn('command', record)
        finally:
            PROCESS_TRACE.record = None

    def test_parallel_scores_preserve_source_order_and_threshold(self):
        with tempfile.TemporaryDirectory() as root:
            engine = ColorEngine()
            row = evaluate(colored_fixture(root), engine)
            self.assertEqual([r['Score'] for r in row['image_judge_record']], [2, 3, 5])
            self.assertEqual([r['image_index'] for r in row['image_judge_record'] if r['selected']], [1, 2])
            self.assertEqual([c[0] > 200 for c in engine.final_colors], [False, True])
            self.assertTrue(row['image_judge_record'][0]['Response'].endswith('\n'))
            self.assertTrue(row['evaluation_details']['response'].startswith('\n'))

    def test_first_fifty_qualifying_images_not_completion_order(self):
        with tempfile.TemporaryDirectory() as root:
            engine = ColorEngine()
            row = evaluate(colored_fixture(root, 81), engine)
            selected = [r['image_index'] for r in row['image_judge_record'] if r['selected']]
            self.assertEqual(selected, [i for i in range(81) if i % 3 != 0][:50])
            self.assertEqual(len(engine.final_colors), 50)

    def test_valid_stages_resume_without_repeating_calls_and_keep_raw_response(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'trajectories', Path(temp) / 'judge/job'
            colored_fixture(source)
            engine = ColorEngine(fail_red=True, concurrency=1)
            first = run_pass(source, output, engine, ['task_1'])
            self.assertEqual(first['pending_judgments'], 1)
            self.assertIsNone(json.loads((output / 'results.jsonl').read_text().splitlines()[0])['predicted_label'])
            self.assertEqual(len(engine.calls), 4)  # key points and three image attempts; quota has no retry
            second = run_pass(source, output, engine, ['task_1'], retry_errors=True)
            self.assertEqual(second['pending_judgments'], 0)
            self.assertEqual(second['successes'], 1)
            self.assertEqual(len(engine.calls), 6)  # only failed red image and final stage are new
            self.assertGreaterEqual(engine.cache_hits, 3)
            before = len(engine.calls)
            run_pass(source, output, engine, ['task_1'], retry_errors=True)
            self.assertEqual(len(engine.calls), before)
            for record in engine.calls:
                self.assertEqual(record['job_id'], 'job')
                self.assertEqual(record['task_id'], 'task_1')
                self.assertEqual(len(record['prompt_sha256']), 64)
                self.assertIn('started_at', record)
                self.assertIn('ended_at', record)
                if record.get('ok'):
                    self.assertEqual(record['response_sha256'], hashlib.sha256(record['response'].encode()).hexdigest())

    def test_tampered_stage_cache_and_source_fingerprint_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'trajectories', Path(temp) / 'judge/job'
            colored_fixture(source)
            engine = ColorEngine(fail_red=True, concurrency=1)
            run_pass(source, output, engine, ['task_1'])
            cached = next((output / 'stages').glob('*.json'))
            value = json.loads(cached.read_text());value['response'] += 'tampered'
            cached.write_text(json.dumps(value))
            count = len(engine.calls)
            with self.assertRaises(CacheIntegrityError):
                run_pass(source, output, engine, ['task_1'], retry_errors=True)
            self.assertEqual(len(engine.calls), count)
            with patch('om2w_judge.runner.source_fingerprints', return_value={'parser': 'different'}), self.assertRaises(ValueError):
                run_pass(source, output, engine, ['task_1'], retry_errors=True)

    def test_persistent_format_error_is_terminal_zero_and_not_retried_on_resume(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'trajectories', Path(temp) / 'judge/job'
            fixture(source)
            class Invalid(FakeEngine):
                def call(self, *_):
                    return ' ', {}
            engine = Invalid()
            with patch('om2w_judge.engines.time.sleep'):
                first = run_pass(source, output, engine, ['task_1'])
                self.assertEqual(first['pending_judgments'], 0)
                self.assertEqual(first['errors'], 1)
                self.assertEqual(len(engine.calls), 3)
                run_pass(source, output, engine, ['task_1'], retry_errors=True)
                self.assertEqual(len(engine.calls), 3)

    def test_persisted_usage_and_binary_verdicts_are_checked_before_resume_calls(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'trajectories', Path(temp) / 'judge/job'
            colored_fixture(source)
            usage = output / 'usage.jsonl'
            engine = ColorEngine(fail_red=True, concurrency=1, usage_log=usage)
            run_pass(source, output, engine, ['task_1'])
            before = len(engine.calls)
            original = usage.read_bytes()
            usage.write_bytes(original + b'{"partial":')
            with self.assertRaises(CacheIntegrityError): run_pass(source, output, engine, ['task_1'], retry_errors=True)
            self.assertEqual(len(engine.calls), before)
            usage.write_bytes(original)
            calls = [json.loads(line) for line in original.splitlines()]
            valid = next(call for call in calls if call.get('ok'))
            valid['call_id'] = 'unlinked'
            usage.write_text(''.join(json.dumps(call) + '\n' for call in calls))
            with self.assertRaises(CacheIntegrityError): run_pass(source, output, engine, ['task_1'], retry_errors=True)
            self.assertEqual(len(engine.calls), before)
            usage.write_bytes(original)
            run_pass(source, output, engine, ['task_1'], retry_errors=True)
            completed = len(engine.calls)
            results = output / 'results.jsonl'
            rows = [json.loads(line) for line in results.read_text().splitlines()]
            rows[-1]['predicted_label'] = 7
            results.write_text(''.join(json.dumps(row) + '\n' for row in rows))
            with self.assertRaises(CacheIntegrityError): run_pass(source, output, engine, ['task_1'], retry_errors=True)
            self.assertEqual(len(engine.calls), completed)


class CircuitTests(unittest.TestCase):
    def circuit(self, root):
        self.now = 1800000000.0
        return CodexCircuit(Path(root) / 'shared.json', clock=lambda: self.now)

    def test_one_quota_episode_stops_queued_calls_and_late_success_cannot_close(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            permits = [circuit.before_spawn() for _ in range(10)]
            for permit in permits:
                circuit.failure(permit, 'usage_limit_reached')
            state = circuit.status()
            self.assertEqual(state['quota_backoff_index'], 1)
            self.assertEqual(state['not_before_epoch'], self.now + 1800)
            circuit.success(permits[-1])
            self.assertEqual(circuit.status()['state'], 'open')
            with self.assertRaises(CircuitOpen):
                circuit.before_spawn()
            # A different instance/restart observes the same gate.
            with self.assertRaises(CircuitOpen):
                CodexCircuit(circuit.path, clock=lambda: self.now).before_spawn()

    def test_evidenced_reset_and_single_half_open_probe(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            permit = circuit.before_spawn()
            circuit.failure(permit, '{"resetsAt":1800000100,"error":"quota"}')
            self.assertEqual(circuit.status()['not_before_epoch'], 1800000160)
            self.now = 1800000160
            probe = circuit.before_spawn('real pending image')
            with self.assertRaises(CircuitOpen):
                circuit.before_spawn()
            circuit.success(probe)
            self.assertEqual(circuit.status()['state'], 'closed')
            self.assertEqual(len(circuit.status()['probe_history']), 1)

    def test_saved_codex_month_reset_uses_process_timezone_and_target_date_dst(self):
        now = utc_epoch('2026-10-18T00:00:00')
        saved_shape = 'Codex returned no completed judgment: ' + json.dumps({'message':
            "You've hit your usage limit. Upgrade to Pro, or try again at Oct 22nd, 2026 1:27 AM."})
        with process_timezone('America/Chicago'):
            self.assertEqual(reset_epoch(saved_shape, now), utc_epoch('2026-10-22T06:27:00'))
            self.assertEqual(reset_epoch('Try again at Nov 22nd, 2026 1:27 AM.', now), utc_epoch('2026-11-22T07:27:00'))
            self.assertEqual(reset_epoch('Try again at Nov 1st, 2026 1:27 AM.', now), utc_epoch('2026-11-01T07:27:00'))
            self.assertIsNone(reset_epoch('Try again at Mar 8th, 2026 2:27 AM.', utc_epoch('2026-01-01T00:00:00')))

    def test_explicit_iana_and_iso_reset_fields_preserve_numeric_epochs_and_reject_past_or_invalid_dates(self):
        now = utc_epoch('2026-10-18T00:00:00')
        with process_timezone('UTC'):
            for zone in ['America/Chicago', '(America/Chicago)', 'in America/Chicago']:
                self.assertEqual(reset_epoch(f'Try again at October 22nd, 2026 1:27 AM {zone}.', now), utc_epoch('2026-10-22T06:27:00'))
            self.assertEqual(reset_epoch('Try again at Nov 1st, 2026 1:27 AM America/Chicago.', now), utc_epoch('2026-11-01T07:27:00'))
            self.assertEqual(reset_epoch('Try again at Oct 22nd, 2026 12:01 AM UTC.', now), utc_epoch('2026-10-22T00:01:00'))
            self.assertEqual(reset_epoch('Try again at Oct 22nd, 2026 12:01 PM UTC.', now), utc_epoch('2026-10-22T12:01:00'))
            for field in ['resetsAt', 'resetAt', 'reset_at', 'resets_at']:
                self.assertEqual(reset_epoch(json.dumps({field: 1792640400}), now), 1792640400)
                self.assertEqual(reset_epoch(json.dumps({field: '1792640400'}), now), 1792640400)
                for value in ['2026-10-22T06:27:00Z', '2026-10-22T01:27:00-05:00', '2026-10-22T01:27:00-0500']:
                    self.assertEqual(reset_epoch(json.dumps({field: value}), now), utc_epoch('2026-10-22T06:27:00'))
            for message in ['Try again at Oct 17th, 2026 1:27 AM.', 'Try again at Feb 30th, 2027 1:27 AM.',
                            'Try again at Oct 22nd, 2026 1:27 AM Mars/Olympus.', 'reset_at: "not a date"',
                            'Try again at Oct 22nd, 2026 13:27 AM.', 'resetsAt:1792640400000']:
                self.assertIsNone(reset_epoch(message, now), message)
        with process_timezone('America/Chicago'):
            self.assertEqual(reset_epoch('{"reset_at":"2026-11-22T01:27:00"}', now), utc_epoch('2026-11-22T07:27:00'))

    def test_known_dated_reset_blocks_all_early_probes_with_the_existing_margin(self):
        with tempfile.TemporaryDirectory() as root, process_timezone('America/Chicago'):
            self.now = utc_epoch('2026-10-18T00:00:00')
            circuit = CodexCircuit(Path(root) / 'shared.json', clock=lambda: self.now)
            reset = utc_epoch('2026-10-22T06:27:00')
            permits = [circuit.before_spawn() for _ in range(2)]
            circuit.failure(permits[0], "You've hit your usage limit. Try again at Oct 22nd, 2026 1:27 AM.")
            self.assertEqual(circuit.status()['reason']['reset_epoch'], reset)
            self.assertEqual(circuit.status()['not_before_epoch'], reset + 60)
            for when in [self.now + 1800, reset, reset + 59]:
                self.now = when
                with self.assertRaises(CircuitOpen): circuit.before_spawn()
                self.assertEqual(circuit.status()['probe_history'], [])
            self.now = reset + 60
            probe = circuit.before_spawn()
            with self.assertRaises(CircuitOpen): circuit.before_spawn()
            circuit.success(probe)
            self.assertEqual(circuit.status()['state'], 'closed')

    def test_late_known_dated_reset_extends_unknown_backoff_without_spending_another_probe(self):
        with tempfile.TemporaryDirectory() as root, process_timezone('America/Chicago'):
            self.now = utc_epoch('2026-10-18T00:00:00')
            circuit = CodexCircuit(Path(root) / 'shared.json', clock=lambda: self.now)
            first, in_flight = circuit.before_spawn(), circuit.before_spawn()
            circuit.failure(first, 'usage_limit_reached')
            circuit.failure(in_flight, "You've hit your usage limit. Try again at Oct 22nd, 2026 1:27 AM.")
            self.assertEqual(circuit.status()['not_before_epoch'], utc_epoch('2026-10-22T06:27:00') + 60)
            self.assertEqual(circuit.status()['quota_backoff_index'], 1)
            self.assertEqual(circuit.status()['probe_history'], [])

    def test_rolling_quota_probe_budget_survives_successes(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            for _ in range(6):
                permit = circuit.before_spawn()
                circuit.failure(permit, json.dumps({'error': 'quota', 'resetsAt': int(self.now + 1)}))
                self.now += 61
                circuit.success(circuit.before_spawn())
            permit = circuit.before_spawn()
            circuit.failure(permit, json.dumps({'error': 'quota', 'resetsAt': int(self.now + 1)}))
            self.now += 61
            with self.assertRaises(CircuitOpen):
                circuit.before_spawn()
            self.assertEqual(len(circuit.status()['probe_history']), 6)

    def test_transport_threshold_and_authentication_block(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            for index in range(3):
                circuit.failure(circuit.before_spawn(), 'connection refused')
                self.assertEqual(circuit.status()['state'], 'closed' if index < 2 else 'open')
            self.now += 60
            circuit.failure(circuit.before_spawn(), 'not logged in')
            self.now += 86400
            with self.assertRaises(CircuitOpen):
                circuit.before_spawn()
            self.assertEqual(circuit.status()['state'], 'blocked')

    def test_operator_recovery_is_explicit_current_auth_only_and_preserves_quota_history(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            circuit.failure(circuit.before_spawn(), 'quota')
            self.now += 1800
            circuit.success(circuit.before_spawn())
            circuit.failure(circuit.before_spawn(), 'not logged in')
            before = circuit.status()
            request = dict(acknowledgement='operator_repaired_authentication_or_configuration',
                           reason='Local authentication was repaired; one pending call may probe.',
                           expected_generation=before['generation'], expected_error_sha256=before['reason']['error_sha256'])
            with self.assertRaises(ValueError): circuit.operator_recover(**{**request, 'acknowledgement': 'yes'})
            with self.assertRaises(ValueError): circuit.operator_recover(**{**request, 'expected_generation': 0})
            after = circuit.operator_recover(**request)
            self.assertEqual(after['state'], 'open')
            self.assertEqual(after['quota_backoff_index'], before['quota_backoff_index'])
            self.assertEqual(after['probe_history'], before['probe_history'])
            probe = circuit.before_spawn()
            with self.assertRaises(CircuitOpen): circuit.before_spawn()
            circuit.success(probe)
            circuit.failure(circuit.before_spawn(), 'quota')
            state = circuit.status()
            with self.assertRaises(ValueError): circuit.operator_recover(**{**request,
                'expected_generation': state['generation'], 'expected_error_sha256': state['reason']['error_sha256']})

    def test_a_dead_probe_owner_can_be_replaced_but_live_owner_never_duplicates(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            circuit.failure(circuit.before_spawn(), 'quota')
            self.now += 1800
            first = circuit.before_spawn()
            self.now += 5000
            with self.assertRaises(CircuitOpen): circuit.before_spawn()
            with patch('om2w_judge.circuit.pid_alive', return_value=False):
                self.assertTrue(circuit.status()['ready'])
                second = circuit.before_spawn()
            self.assertNotEqual(first['probe_token'], second['probe_token'])
            circuit.success(first)
            self.assertEqual(circuit.status()['state'], 'half_open')
            circuit.success(second)
            self.assertEqual(circuit.status()['state'], 'closed')

    def test_abandon_restores_only_an_unused_current_probe_without_spending_its_budget(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            ordinary = circuit.before_spawn()
            circuit.abandon(ordinary)
            self.assertEqual(circuit.status()['state'], 'closed')
            circuit.failure(ordinary, 'quota')
            self.now += 1800
            before = circuit.status()
            probe = circuit.before_spawn()
            circuit.abandon({**probe, 'probe_token': 'stale'})
            self.assertEqual(circuit.status()['state'], 'half_open')
            circuit.abandon(probe)
            after = circuit.status()
            self.assertEqual(after['state'], 'open')
            self.assertEqual(after['reason'], before['reason'])
            self.assertEqual(after['not_before_epoch'], before['not_before_epoch'])
            self.assertEqual(after['probe_history'], before['probe_history'])
            self.assertEqual(after['quota_backoff_index'], before['quota_backoff_index'])
            next_probe = circuit.before_spawn()
            circuit.abandon(probe)
            circuit.success(probe)
            circuit.failure(probe, 'quota')
            self.assertEqual(circuit.status()['state'], 'half_open')
            self.assertEqual(circuit.status()['probe']['token'], next_probe['probe_token'])
            circuit.success(next_probe)
            self.assertEqual(circuit.status()['state'], 'closed')

    def test_stdin_abandon_bridge_releases_probe_held_by_live_collector(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            circuit.failure(circuit.before_spawn(), 'quota')
            self.now += 1800
            probe = circuit.before_spawn(owner_pid=os.getpid())
            args = [sys.executable, '-B', '-m', 'om2w_judge.circuit', '--state', str(circuit.path), '--request-stdin', 'abandon']
            result = subprocess.run(args, input=json.dumps({'permit': probe}), text=True, capture_output=True,
                                    cwd=Path(__file__).resolve().parents[1])
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['state'], 'open')
            self.assertEqual(circuit.status()['probe_history'], [])

    def test_engine_rechecks_circuit_after_semaphore_queue(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            class Quota(FakeEngine):
                def call(self, *_):
                    raise RuntimeError('usage_limit_reached')
            engine = Quota(concurrency=1, circuit=circuit)
            def invoke():
                try: engine.generate(IMAGE_MESSAGES)
                except (InfrastructureError, CircuitOpen): pass
            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(lambda _: invoke(), range(8)))
            self.assertEqual(len(engine.calls), 1)

    def test_transport_has_two_attempts_and_rechecks_before_retry(self):
        class Broken(FakeEngine):
            def call(self, *_):
                raise RuntimeError('connection refused')
        engine = Broken()
        with patch('om2w_judge.engines.time.sleep'), self.assertRaises(InfrastructureError):
            engine.generate(IMAGE_MESSAGES)
        self.assertEqual(len(engine.calls), 2)
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            engine = Broken(circuit=circuit)
            def interrupt_retry(_):
                circuit.failure(circuit.before_spawn(), 'quota')
            with patch('om2w_judge.engines.time.sleep', side_effect=interrupt_retry), self.assertRaises(CircuitOpen):
                engine.generate(IMAGE_MESSAGES)
            self.assertEqual(len(engine.calls), 1)

    def test_global_cli_slots_bound_parallel_admission(self):
        with tempfile.TemporaryDirectory() as root:
            slots = GlobalCLISlots(root, limit=2)
            active = maximum = 0
            lock = threading.Lock()
            def work(_):
                nonlocal active, maximum
                with slots.acquire():
                    with lock:
                        active += 1; maximum = max(maximum, active)
                    time.sleep(.01)
                    with lock: active -= 1
            with ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(work, range(12)))
            self.assertEqual(maximum, 2)

    def test_stdin_bridge_retains_long_lived_probe_owner_without_secret_argv(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = self.circuit(root)
            permit = circuit.before_spawn(); circuit.failure(permit, 'quota')
            self.now += 1800
            # The CLI uses real time, so make the saved gate due for this fixture.
            value = json.loads(circuit.path.read_text());value['families']['codex']['not_before_epoch'] = 1
            circuit.path.write_text(json.dumps(value))
            args = [sys.executable, '-B', '-m', 'om2w_judge.circuit', '--state', str(circuit.path), '--request-stdin', 'admit']
            result = subprocess.run(args, input=json.dumps({'scope': 'collector', 'owner_pid': os.getpid()}),
                                    text=True, capture_output=True, cwd=Path(__file__).resolve().parents[1])
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(circuit.path.read_text())['families']['codex']['probe']['pid'], os.getpid())
            self.assertEqual(json.loads(result.stdout)['family'], 'codex')


if __name__ == '__main__':
    unittest.main()

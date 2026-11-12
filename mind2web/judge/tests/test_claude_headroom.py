import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from om2w_judge.circuit import CodexCircuit, CircuitOpen, InfrastructureError, classify_error, reset_epoch
from om2w_judge.engines import ClaudeCodeEngine, FAMILY, quota_headroom

HEADROOM = 'Claude quota headroom reached: '
LIMIT_TEXT = "You've hit your limit · resets 4am (America/Chicago)"
REPLY = 'Thoughts: The final screenshot shows the requested price.\nStatus: success'
FINAL_MESSAGES = [{'role': 'system', 'content': 'Status: "success" or "failure"'}, {'role': 'user', 'content': 'Judge this fixture.'}]
INIT = {'type': 'system', 'subtype': 'init', 'session_id': 'judge-session', 'model': FAMILY['model'], 'tools': [], 'mcp_servers': [],
        'permissionMode': 'default', 'apiKeySource': 'none'}


def headroom_error(reset, compact=False):
    info = {'window': 'five_hour', 'utilization': 0.95, 'limit': 0.9, 'resetsAt': reset}
    # The JS collector serializes with JSON.stringify (compact); the judge uses json.dumps.
    return HEADROOM + (json.dumps(info, separators=(',', ':')) if compact else json.dumps(info))


def rate_limit(status, five_hour, reset):
    return {'type': 'rate_limit_event', 'rate_limit_info': {'status': status, 'resetsAt': reset, 'rateLimitType': 'five_hour', 'unifiedWindows': {
        'five_hour': {'utilization': five_hour, 'resetsAt': reset}, 'seven_day': {'utilization': 0.4, 'resetsAt': reset + 4 * 86400}}}}


def result(**fields):
    return {'type': 'result', 'subtype': 'success', 'is_error': False, 'result': REPLY, 'num_turns': 1, 'session_id': 'judge-session',
            'stop_reason': 'end_turn', 'total_cost_usd': 0.01,
            'usage': {'input_tokens': 10, 'cache_read_input_tokens': 200, 'cache_creation_input_tokens': 30, 'output_tokens': 5}, **fields}


def stream(*events):
    return ''.join(json.dumps(event) + '\n' for event in events)


class RecordingCircuit:
    """Stands in for the shared circuit and records every transition the engine requests."""

    def __init__(self):
        self.calls = []

    def before_spawn(self, scope=None, lease_seconds=240, owner_pid=None):
        permit = {'family': 'claude', 'generation': len(self.calls), 'probe_token': None}
        self.calls.append(('before_spawn', permit))
        return permit

    def success(self, permit):
        self.calls.append(('success', permit))

    def failure(self, permit, error, kind=None):
        self.calls.append(('failure', permit, str(error), kind))

    def kinds(self):
        return [call[0] for call in self.calls]


class HeadroomCircuitTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.now = 1_800_000_000.0
        self.circuit = CodexCircuit(Path(root.name) / 'claude-circuit.json', family='claude', clock=lambda: self.now)

    def events(self):
        log = self.circuit.path.with_suffix(self.circuit.path.suffix + '.events.jsonl')
        return [json.loads(line) for line in log.read_text().splitlines()]

    def test_headroom_opens_until_reset_margin_without_advancing_backoff(self):
        # Earn real backoff history first so an unchanged index is observable.
        self.circuit.failure(self.circuit.before_spawn(), 'usage_limit_reached')
        self.now += 1800
        self.circuit.success(self.circuit.before_spawn())
        before = self.circuit.status()
        self.assertEqual((before['state'], before['quota_backoff_index'], len(before['probe_history'])), ('closed', 1, 1))
        permit = self.circuit.before_spawn()
        reset = int(self.now) + 3600
        self.circuit.failure(permit, headroom_error(reset), 'headroom')
        state = self.circuit.status()
        self.assertEqual(state['state'], 'open')
        self.assertEqual(state['not_before_epoch'], reset + 60)
        self.assertEqual((state['reason']['kind'], state['reason']['reset_epoch']), ('headroom', reset))
        self.assertEqual(state['generation'], permit['generation'] + 1)
        self.assertIsNone(state['probe'])
        for key in ('quota_backoff_index', 'transport_backoff_index', 'consecutive_transport_failures', 'probe_history'):
            self.assertEqual(state[key], before[key], key)
        self.assertEqual(self.events()[-1]['event'], 'headroom')
        self.circuit.success(permit)
        self.assertEqual(self.circuit.status()['state'], 'open', 'A late success from the paused call cannot close the pause')
        for when in (self.now, reset, reset + 59):
            self.now = when
            self.assertFalse(self.circuit.status()['ready'])
            with self.assertRaises(CircuitOpen):
                self.circuit.before_spawn()
        self.assertEqual(self.circuit.status()['probe_history'], before['probe_history'], 'Early admissions spend no probe')

    def test_due_headroom_closes_directly_and_admits_without_a_probe(self):
        permit = self.circuit.before_spawn()
        reset = int(self.now) + 600
        self.circuit.failure(permit, headroom_error(reset, compact=True), 'headroom')
        paused = self.circuit.status()
        self.now = reset + 60
        self.assertTrue(self.circuit.status()['ready'])
        first = self.circuit.before_spawn('judge:task-1')
        self.assertIsNone(first['probe_token'])
        self.assertEqual(first['generation'], paused['generation'] + 1)
        state = self.circuit.status()
        self.assertEqual(state['state'], 'closed')
        for key in ('probe', 'reason', 'not_before_epoch'):
            self.assertIsNone(state[key], key)
        self.assertEqual(state['probe_history'], [])
        second = self.circuit.before_spawn('judge:task-2')
        self.assertEqual((second['probe_token'], second['generation']), (None, first['generation']), 'No half-open exclusivity')
        self.assertNotIn('half_open', [event['state'] for event in self.events()])
        self.circuit.success(first)
        self.circuit.success(second)
        self.assertEqual(self.circuit.status()['state'], 'closed')

    def test_headroom_without_a_future_reset_epoch_is_rejected(self):
        permit = self.circuit.before_spawn()
        before = self.circuit.status()
        missing = HEADROOM + json.dumps({'window': 'five_hour', 'utilization': 0.95, 'limit': 0.9})
        for error in (missing, 'Claude quota headroom reached', headroom_error(int(self.now)), headroom_error(int(self.now) - 1)):
            with self.subTest(error=error), self.assertRaises(ValueError):
                self.circuit.failure(permit, error, 'headroom')
        after = self.circuit.status()
        self.assertEqual((after['state'], after['generation']), ('closed', before['generation']))
        self.circuit.before_spawn()

    def test_in_flight_headroom_only_extends_an_open_quota_gate(self):
        first, in_flight = self.circuit.before_spawn(), self.circuit.before_spawn()
        self.circuit.failure(first, 'usage_limit_reached')
        reset = int(self.now) + 7200
        self.circuit.failure(in_flight, headroom_error(reset), 'headroom')
        state = self.circuit.status()
        self.assertEqual(state['reason']['kind'], 'quota', 'Headroom evidence never downgrades a quota episode into a probe-free pause')
        self.assertEqual(state['not_before_epoch'], reset + 60)
        self.assertEqual(state['quota_backoff_index'], 1)
        self.assertEqual(self.events()[-1]['event'], 'late_reset_evidence')


class QuotaHeadroomTests(unittest.TestCase):
    def test_thresholds_latest_reset_and_ignored_windows(self):
        now, limits = 1_800_000_000, {'five_hour': 0.9, 'seven_day': 0.97}

        def info(**windows):
            return {'status': 'allowed', 'resetsAt': now + 3600, 'rateLimitType': 'five_hour',
                    'unifiedWindows': {name: {'utilization': value[0], 'resetsAt': value[1]} for name, value in windows.items()}}

        self.assertEqual(quota_headroom(info(five_hour=(0.95, now + 3 * 3600), seven_day=(0.99, now + 4 * 86400)), limits, now),
                         {'window': 'seven_day', 'utilization': 0.99, 'limit': 0.97, 'resetsAt': now + 4 * 86400})
        self.assertEqual(quota_headroom(info(five_hour=(0.95, now + 7200), seven_day=(0.98, now + 3600)), limits, now)['window'], 'five_hour')
        self.assertEqual(quota_headroom(info(five_hour=(0.9, now + 3600), seven_day=(0.969, now + 86400)), limits, now),
                         {'window': 'five_hour', 'utilization': 0.9, 'limit': 0.9, 'resetsAt': now + 3600})
        self.assertIsNone(quota_headroom(info(five_hour=(0.899, now + 3600), seven_day=(0.969, now + 86400)), limits, now))
        for reset in (now, now - 1):
            self.assertIsNone(quota_headroom(info(five_hour=(1, reset)), limits, now), reset)
        self.assertEqual(quota_headroom(info(five_hour=(1, now - 1), seven_day=(0.99, now + 60)), limits, now)['window'], 'seven_day')
        self.assertIsNone(quota_headroom(info(seven_day_overage_included=(1, now + 3600)), limits, now))
        for missing in (None, {}, {'status': 'allowed'}, {'unifiedWindows': None}, info()):
            self.assertIsNone(quota_headroom(missing, limits, now), missing)

    def test_default_limits_come_from_the_shared_family_config(self):
        limit, future = FAMILY['quota_headroom']['five_hour'], time.time() + 3600
        self.assertEqual(quota_headroom({'unifiedWindows': {'five_hour': {'utilization': limit, 'resetsAt': future}}})['limit'], limit)
        self.assertIsNone(quota_headroom({'unifiedWindows': {'five_hour': {'utilization': limit - 0.01, 'resetsAt': future}}}))


class ClaudeEngineHeadroomTests(unittest.TestCase):
    def engine_with(self, outputs, circuit=None):
        spawned = []

        def run(command, **kwargs):
            spawned.append(kwargs)
            return outputs[min(len(spawned), len(outputs)) - 1]
        patcher = patch('om2w_judge.engines.run_process', run)
        patcher.start()
        self.addCleanup(patcher.stop)
        sleeper = patch('om2w_judge.engines.time.sleep')
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)
        return ClaudeCodeEngine(circuit=circuit), spawned

    def test_reply_over_headroom_is_returned_but_reported_as_headroom_never_success(self):
        self.assertLessEqual(FAMILY['quota_headroom']['five_hour'], 0.95, 'Fixture utilization must exceed the configured headroom')
        reset = int(time.time()) + 3600
        circuit = RecordingCircuit()
        engine, spawned = self.engine_with([(0, stream(INIT, rate_limit('allowed', 0.95, reset), result()), '')], circuit)
        self.assertEqual(engine.generate(FINAL_MESSAGES), [REPLY])
        self.assertEqual(len(spawned), 1)
        self.assertIs(spawned[0]['check'], False, 'Nonzero exits must reach the stream parser')
        self.assertEqual(circuit.kinds(), ['before_spawn', 'failure'])
        _, permit, error, kind = circuit.calls[1]
        self.assertEqual((kind, permit), ('headroom', circuit.calls[0][1]))
        self.assertTrue(error.startswith(HEADROOM), error)
        expected = {'window': 'five_hour', 'utilization': 0.95, 'limit': FAMILY['quota_headroom']['five_hour'], 'resetsAt': reset}
        self.assertEqual(json.loads(error[len(HEADROOM):]), expected)
        self.assertEqual(reset_epoch(error, time.time()), reset, 'A real circuit can read the window reset from this text')
        record = engine.calls[0]
        self.assertTrue(record['ok'])
        self.assertEqual(record['quota_headroom'], expected)
        self.assertEqual(record['rate_limit']['status'], 'allowed')
        self.assertEqual(record['usage'], {'input_tokens': 240, 'cached_input_tokens': 200, 'cache_creation_input_tokens': 30,
                                           'uncached_input_tokens': 10, 'output_tokens': 5})

    def test_reply_below_headroom_reports_success(self):
        circuit = RecordingCircuit()
        engine, _ = self.engine_with([(0, stream(INIT, rate_limit('allowed', 0.5, int(time.time()) + 3600), result()), '')], circuit)
        self.assertEqual(engine.generate(FINAL_MESSAGES), [REPLY])
        self.assertEqual(circuit.kinds(), ['before_spawn', 'success'])
        self.assertIsNone(engine.calls[0]['quota_headroom'])

    def test_real_circuit_pauses_later_spawns_after_a_headroom_reply(self):
        with tempfile.TemporaryDirectory() as root:
            circuit = CodexCircuit(Path(root) / 'claude-circuit.json', family='claude')
            reset = int(time.time()) + 3600
            engine, spawned = self.engine_with([(0, stream(INIT, rate_limit('allowed', 0.95, reset), result()), '')], circuit)
            self.assertEqual(engine.generate(FINAL_MESSAGES), [REPLY])
            state = circuit.status()
            self.assertEqual((state['state'], state['reason']['kind'], state['not_before_epoch']), ('open', 'headroom', reset + 60))
            self.assertEqual((state['quota_backoff_index'], state['probe_history']), (0, []))
            with self.assertRaises(CircuitOpen):
                engine.generate(FINAL_MESSAGES)
            self.assertEqual(len(spawned), 1, 'The paused circuit admits no second CLI spawn')

    def test_rejected_rate_limit_with_nonzero_exit_is_a_quota_error(self):
        reset = int(time.time()) + 3 * 3600
        rejected = rate_limit('rejected', 1.0, reset)
        cases = {'error result': stream(INIT, rejected, result(is_error=True, result=LIMIT_TEXT, usage={'input_tokens': 0, 'output_tokens': 0})),
                 'no result': stream(INIT, rejected)}
        for name, output in cases.items():
            with self.subTest(name):
                with patch('om2w_judge.engines.run_process', lambda command, **kwargs: (1, output, 'API Error: request rejected')):
                    with self.assertRaises(RuntimeError) as raised:
                        ClaudeCodeEngine().call('Status: "success" or "failure"', 'Judge this fixture.', [], FAMILY['model'])
                text = str(raised.exception)
                self.assertIn('Claude rate limit rejected', text)
                self.assertIn(str(reset), text)
                self.assertEqual(classify_error(raised.exception), 'quota')
                circuit = RecordingCircuit()
                engine, spawned = self.engine_with([(1, output, 'API Error: request rejected')], circuit)
                with self.assertRaises(InfrastructureError) as surfaced:
                    engine.generate(FINAL_MESSAGES)
                self.assertEqual((surfaced.exception.kind, classify_error(surfaced.exception)), ('quota', 'quota'))
                self.assertIn('Claude rate limit rejected', str(surfaced.exception))
                self.assertEqual(circuit.kinds(), ['before_spawn', 'failure'])
                self.assertEqual(circuit.calls[1][3], 'quota')
                self.assertEqual(len(spawned), 1, 'Quota is terminal for the call; it is not retried')
                self.sleep.assert_not_called()


if __name__ == '__main__':
    unittest.main()

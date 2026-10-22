import asyncio
import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from om2w_judge.engines import unpack_messages, valid_reply, ClaudeCodeEngine, CodexEngine, FakeEngine, CLAUDE_CLI, FAMILY
from om2w_judge.runner import load_v2, run_pass, evaluate
from om2w_judge.parsers import FormatError
from utils import extract_predication


def fixture(root, task_id='task_1'):
    directory = Path(root) / task_id
    (directory / 'trajectory').mkdir(parents=True)
    Image.new('RGB', (32, 32), 'blue').save(directory / 'trajectory/0000.png')
    Image.new('RGB', (32, 32), 'blue').save(directory / 'trajectory/0001.png')
    (directory / 'result.json').write_text(json.dumps({
        'schema_version': 'online-mind2web-v2', 'task_id': task_id,
        'task': 'Find the price of the Blue Widget.', 'reference_length': 2, 'agent_final_answer': '$19.99',
        'action_history': [
            {'step': 0, 'screenshot': '0000.png', 'action': 'page -> NAVIGATE -> open page | SUCCESS', 'thought': None},
            {'step': 1, 'screenshot': '0001.png', 'action': 'TASK_COMPLETE -> ANSWER: $19.99', 'thought': None}]}))
    return directory


class EngineTests(unittest.TestCase):
    def test_media_type_uses_bytes_despite_upstream_png_label(self):
        image = io.BytesIO()
        Image.new('RGB', (16, 16), 'red').save(image, 'JPEG')
        messages = [{'role': 'system', 'content': 'Exact system'}, {'role': 'user', 'content': [
            {'type': 'text', 'text': 'Exact text'},
            {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()}}]}]
        system, text, images = unpack_messages(messages)
        self.assertEqual((system, text), ('Exact system', 'Exact text'))
        self.assertEqual(images[0][1], 'image/jpeg')

    def test_reject_remote_images_and_interleaving(self):
        with self.assertRaises(ValueError):
            unpack_messages([{'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': 'https://example.com/image'}}]}])

    def test_parser_trap_is_real_and_guarded(self):
        response = 'Thoughts: incomplete\nStatus: unsuccessful'
        self.assertEqual(extract_predication(response, 'WebJudge_Online_Mind2Web_eval'), 1)
        self.assertFalse(valid_reply(response, 'final'))
        for response in ['Status: failure', 'Thoughts: yes\nStatus: "success"', '**Status**: success']:
            self.assertTrue(valid_reply(response, 'final'))
        for response in ['Status: failure but success', 'Status: success\nStatus: failure']:
            self.assertFalse(valid_reply(response, 'final'))

    def test_malformed_output_reasks_identical_input(self):
        engine = FakeEngine(['Status: unsuccessful', 'Status: failure'])
        messages = [{'role': 'system', 'content': 'Status: "success" or "failure"'}, {'role': 'user', 'content': 'Task'}]
        with patch('om2w_judge.engines.time.sleep'):
            self.assertEqual(engine.generate(messages), ['Status: failure'])
        self.assertEqual(len(engine.calls), 2)
        self.assertTrue(engine.calls[0]['format_error'])

    def test_persistent_invalid_reply_is_error_not_success(self):
        engine = FakeEngine(['Status: unsuccessful'] * 3)
        with patch('om2w_judge.engines.time.sleep'), self.assertRaises(FormatError):
            engine.generate([{'role': 'system', 'content': 'Status: "success" or "failure"'}, {'role': 'user', 'content': 'Task'}])

    def test_claude_isolation_flags_and_exact_prompt(self):
        self.assertEqual(ClaudeCodeEngine().command, CLAUDE_CLI)

        def run(command, **kwargs):
            # The engine inspects the exit code itself, so the CLI must not raise on failure.
            self.assertIs(kwargs['check'], False)
            self.assertEqual(command[0], '/fixture/pinned/claude')
            self.assertEqual(command[command.index('--model') + 1], FAMILY['model'])
            self.assertIn('--strict-mcp-config', command)
            self.assertEqual(command[command.index('--tools') + 1], '')
            self.assertEqual(Path(command[command.index('--system-prompt-file') + 1]).read_text(), 'Exact')
            for key in ('ANTHROPIC_API_KEY', 'CLAUDECODE'):
                self.assertNotIn(key, kwargs['env'])
            payload = json.loads(kwargs['input_text'])
            self.assertEqual(payload['message']['content'][0]['text'], 'Hello')
            return 0, '\n'.join([json.dumps({'type': 'system', 'subtype': 'init', 'tools': [], 'mcp_servers': []}), json.dumps({'type': 'result', 'subtype': 'success', 'result': 'OK'})]), ''
        with patch('om2w_judge.engines.run_process', run), \
                patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'operator-secret', 'CLAUDECODE': '1'}):
            engine = ClaudeCodeEngine(command='/fixture/pinned/claude')
            self.assertEqual(engine.generate([{'role': 'system', 'content': 'Exact'}, {'role': 'user', 'content': 'Hello'}]), ['OK'])

    def test_codex_model_prompt_and_isolation_flags(self):
        def run(command, **kwargs):
            self.assertEqual(command[command.index('-m') + 1], 'gpt-6.1-sol')
            self.assertIn('--ignore-user-config', command)
            setting = next(s for s in command if s.startswith('model_instructions_file='))
            self.assertEqual(Path(json.loads(setting.split('=', 1)[1])).read_text(), 'Exact')
            Path(command[command.index('-o') + 1]).write_text('OK')
            return json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 1}}), ''
        with patch('om2w_judge.engines.run_process', run):
            self.assertEqual(CodexEngine().generate([{'role': 'system', 'content': 'Exact'}, {'role': 'user', 'content': 'Hello'}]), ['OK'])


class RunnerTests(unittest.TestCase):
    def test_v2_loading_and_strict_answer_variant(self):
        with tempfile.TemporaryDirectory() as root:
            directory = fixture(root)
            _, official, images = load_v2(directory)
            _, strict, strict_images = load_v2(directory, 'strict')
            self.assertEqual(len(official), 2)
            self.assertEqual(len(strict), 1)
            self.assertEqual(images, strict_images)

    def test_local_pipeline_keeps_upstream_stage_sequence(self):
        with tempfile.TemporaryDirectory() as root:
            directory = fixture(root)
            engine = FakeEngine()
            row = evaluate(directory, engine)
            self.assertEqual(row['predicted_label'], 1)
            self.assertEqual(len(engine.calls), 4)
            self.assertEqual(len(row['image_judge_record']), 2)

    def test_missing_tasks_count_as_failures_and_resume_does_not_rejudge(self):
        with tempfile.TemporaryDirectory() as root:
            source, output = Path(root) / 'trajectories', Path(root) / 'out'
            fixture(source)
            engine = FakeEngine()
            summary = run_pass(source, output, engine, ['task_1', 'missing'])
            self.assertEqual(summary['expected'], 2)
            self.assertEqual(summary['success_rate'], 0.5)
            self.assertEqual(summary['errors'], 1)
            count = len(engine.calls)
            run_pass(source, output, engine, ['task_1', 'missing'])
            self.assertEqual(len(engine.calls), count)
            Image.new('RGB', (32, 32), 'red').save(source / 'task_1/trajectory/0000.png')
            with self.assertRaises(ValueError):
                run_pass(source, output, engine, ['task_1', 'missing'])

    def test_unsafe_screenshot_and_task_ids_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            directory = fixture(root)
            result = json.loads((directory / 'result.json').read_text())
            result['action_history'][0]['screenshot'] = '../../outside.png'
            (directory / 'result.json').write_text(json.dumps(result))
            with self.assertRaises(ValueError):
                load_v2(directory)
            with self.assertRaises(ValueError):
                run_pass(Path(root), Path(root) / 'out', FakeEngine(), ['../outside'])

    def test_quota_stops_pass_and_resume_retries_only_infrastructure_errors(self):
        with tempfile.TemporaryDirectory() as root:
            source, output = Path(root) / 'trajectories', Path(root) / 'out'
            for task_id in ['passed', 'quota', 'pending']:
                fixture(source, task_id)
            engine = FakeEngine()
            visited = []

            def initial(directory, *_args):
                visited.append(directory.name)
                if directory.name == 'quota':
                    raise RuntimeError('usage_limit_reached')
                return {'task_id': directory.name, 'predicted_label': 1, 'judge_protocol': 'scorefield-v2',
                        'judgment_status': 'complete', 'infrastructure_error': False}

            with patch('om2w_judge.runner.evaluate', initial):
                summary = run_pass(source, output, engine, ['passed', 'quota', 'pending'])
            self.assertEqual(visited, ['passed', 'quota'])
            self.assertEqual(summary['pending_judgments'], 2)
            self.assertEqual(summary['success_rate'], 1 / 3)
            visited.clear()

            def resumed(directory, *_args):
                visited.append(directory.name)
                return {'task_id': directory.name, 'predicted_label': 0, 'judge_protocol': 'scorefield-v2',
                        'judgment_status': 'complete', 'infrastructure_error': False}

            with patch('om2w_judge.runner.evaluate', resumed):
                summary = run_pass(source, output, engine, ['passed', 'quota', 'pending'], retry_errors=True)
            self.assertEqual(visited, ['quota', 'pending'])
            self.assertEqual(summary['pending_judgments'], 0)
            self.assertEqual(summary['successes'], 1)
            rows = [json.loads(line) for line in (output / 'results.jsonl').read_text().splitlines()]
            self.assertEqual(len(rows), 4)


if __name__ == '__main__':
    unittest.main()

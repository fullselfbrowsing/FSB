import hashlib
import json
from pathlib import Path
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from om2w_judge.engines import CODEX_MODEL_CATALOG, CODEX_TOOL_ISOLATION, CodexEngine, FakeEngine, toml_value
from om2w_judge.runner import run_pass, source_fingerprints
from test_judge import fixture


CONFIG = Path(__file__).resolve().parents[2] / 'config'
POLICY_FILES = ['codex-tool-isolation.json', 'codex-gpt61sol-browser-policy.json',
                'codex-gpt61sol-browser-policy.receipt.json']


def overrides(command):
    values = [command[index + 1] for index, value in enumerate(command) if value == '-c']
    output = {}
    for value in values:
        key = value.split('=', 1)[0]
        parsed = tomllib.loads(value)
        for part in key.split('.'):
            parsed = parsed[part]
        output[key] = parsed
    return output


class CodexToolPolicyTests(unittest.TestCase):
    def test_actual_judge_command_has_shared_policy_and_direct_image_bytes(self):
        raw_response = b'\r\nThoughts: saved exactly.\r\nStatus: success\r\n'
        seen = []

        def result(command, *, cwd, env, input_text, timeout):
            config = overrides(command)
            for key, value in CODEX_TOOL_ISOLATION.items():
                self.assertEqual(config[key], value, key)
            self.assertEqual(command[command.index('-m') + 1], 'gpt-6.1-sol')
            self.assertEqual(config['model_reasoning_effort'], 'medium')
            self.assertEqual(config['model_catalog_json'], str(CODEX_MODEL_CATALOG))
            self.assertEqual(config['mcp_servers'], {})
            self.assertFalse(any(key.startswith('mcp_servers.') for key in config))
            self.assertIn('--ignore-user-config', command)
            self.assertIn('--ignore-rules', command)
            self.assertEqual(command[command.index('-s') + 1], 'read-only')
            self.assertEqual(Path(config['model_instructions_file']).read_text(), 'System fixture')
            image_paths = [Path(command[index + 1]) for index, value in enumerate(command) if value == '-i']
            self.assertEqual([file.read_bytes() for file in image_paths], [b'first image', b'second image'])
            self.assertTrue(all(file.parent == Path(cwd) for file in image_paths))
            self.assertEqual(input_text, 'Task fixture')
            Path(command[command.index('-o') + 1]).write_bytes(raw_response)
            seen.append(command)
            return json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 7}}), ''

        with patch('om2w_judge.engines.run_process', result):
            response, metadata = CodexEngine(effort='medium').call('System fixture', 'Task fixture',
                [(b'first image', 'image/png'), (b'second image', 'image/jpeg')], 'gpt-6.1-sol')
        self.assertEqual(len(seen), 1)
        self.assertEqual(response.encode(), raw_response)
        self.assertEqual(metadata['usage']['input_tokens'], 7)

    def test_nested_policy_values_are_valid_toml(self):
        for value in list(CODEX_TOOL_ISOLATION.values()) + [
                {'quoted.key': ['line\nbreak', 'quote"slash\\', '日本語'], 'empty': {}}]:
            with self.subTest(value=value):
                self.assertEqual(tomllib.loads('fixture=' + toml_value(value))['fixture'], value)
        with self.assertRaises(TypeError):
            toml_value(None)

    def test_retained_resource_handler_or_any_execution_event_cannot_become_a_judgment(self):
        for item in [
            {'type': 'mcp_tool_call', 'server': 'codex', 'tool': 'list_mcp_resources'},
            {'type': 'mcp_tool_call', 'server': 'fsb', 'tool': 'read_page'},
            {'type': 'command_execution'}, {'type': 'file_change'}, {'type': 'web_search'},
            {'type': 'custom_tool_call', 'name': 'exec'},
        ]:
            def result(command, **kwargs):
                Path(command[command.index('-o') + 1]).write_text('Status: success')
                return '\n'.join(json.dumps(event) for event in [
                    {'type': 'item.started', 'item': item}, {'type': 'turn.completed'}]), ''
            with self.subTest(item=item), patch('om2w_judge.engines.run_process', result), \
                    self.assertRaisesRegex(RuntimeError, 'attempted to use tools'):
                CodexEngine().call('System fixture', 'Task fixture', [], 'gpt-6.1-sol')

    def test_all_policy_sources_are_hash_bound_and_each_edit_refuses_cached_resume(self):
        files = source_fingerprints()
        for name in POLICY_FILES:
            file = CONFIG / name
            self.assertEqual(files['../config/' + name], hashlib.sha256(file.read_bytes()).hexdigest())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root / 'trajectories')
            engine = FakeEngine()
            run_pass(root / 'trajectories', root / 'job', engine, ['task_1'])
            calls = len(engine.calls)
            read_bytes = Path.read_bytes
            for name in POLICY_FILES:
                target = CONFIG / name

                def changed_bytes(file):
                    data = read_bytes(file)
                    return data + b'\n' if file.resolve() == target.resolve() else data

                with self.subTest(name=name), patch.object(Path, 'read_bytes', changed_bytes), \
                        self.assertRaisesRegex(ValueError, 'fingerprint|configuration|different'):
                    run_pass(root / 'trajectories', root / 'job', engine, ['task_1'], retry_errors=True)
                self.assertEqual(len(engine.calls), calls)


if __name__ == '__main__':
    unittest.main()

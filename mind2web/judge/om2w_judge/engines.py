import base64
from contextlib import nullcontext
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
import time
import uuid
from PIL import Image

from .cache import prompt_digest
from .circuit import CircuitOpen, InfrastructureError, classify_error
from .parsers import FormatError, parse_image_score, parse_status, validate_reply

PROCESS_TRACE = threading.local()
CODEX_TOOL_ISOLATION = json.loads((Path(__file__).resolve().parents[2] / 'config/codex-tool-isolation.json').read_text())
CODEX_MODEL_CATALOG = Path(__file__).resolve().parents[2] / 'config/codex-gpt61sol-browser-policy.json'
FAMILY = json.loads((Path(__file__).resolve().parents[2] / 'config/model-family.json').read_text())
CLAUDE_CLI = str(Path(__file__).resolve().parents[3] / FAMILY['cli']['path'])
# The judge child must not inherit the operator's Claude Code session or API credentials.
ENV_ALLOWLIST = ('PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING')


def claude_environment(env=None):
    env = os.environ if env is None else env
    clean = {key: env[key] for key in ENV_ALLOWLIST if isinstance(env.get(key), str)}
    return {**clean, 'CLAUDE_CODE_DISABLE_AUTO_MEMORY': '1', 'DISABLE_AUTOUPDATER': '1',
            'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1'}


def normalize_claude_usage(usage):
    if not usage:
        return None
    read, created = usage.get('cache_read_input_tokens') or 0, usage.get('cache_creation_input_tokens') or 0
    return {'input_tokens': (usage.get('input_tokens') or 0) + read + created, 'cached_input_tokens': read,
            'cache_creation_input_tokens': created, 'uncached_input_tokens': usage.get('input_tokens') or 0,
            'output_tokens': usage.get('output_tokens') or 0}


def quota_headroom(info, limits=None, now=None):
    limits = FAMILY['quota_headroom'] if limits is None else limits
    now = time.time() if now is None else now
    windows = (info or {}).get('unifiedWindows') or {}
    seconds = lambda value: value // 1000 if value > 1e11 else value  # tolerate millisecond epochs
    over = [{'window': name, 'utilization': row['utilization'], 'limit': limit, 'resetsAt': seconds(row['resetsAt'])}
            for name, limit in limits.items()
            for row in [windows.get(name)] if row and row.get('utilization', 0) >= limit and seconds(row.get('resetsAt') or 0) > now]
    return max(over, key=lambda row: row['resetsAt']) if over else None


def toml_value(value):
    if isinstance(value, list):
        return '[' + ', '.join(toml_value(item) for item in value) + ']'
    if isinstance(value, dict):
        return '{ ' + ', '.join(json.dumps(key) + ' = ' + toml_value(item) for key, item in value.items()) + ' }'
    if value is None or not isinstance(value, (str, bool, int, float)):
        raise TypeError('Unsupported Codex TOML config value')
    return json.dumps(value)


def unpack_messages(messages):
    systems, text, images = [], [], []
    saw_images = False
    for message in messages:
        content = message['content']
        if message['role'] == 'system':
            if not isinstance(content, str):
                raise ValueError('System prompt must be text')
            systems.append(content)
        elif message['role'] == 'user':
            for part in ([{'type': 'text', 'text': content}] if isinstance(content, str) else content):
                if part['type'] == 'text':
                    if saw_images:
                        raise ValueError('Interleaved image/text messages are unsupported')
                    text.append(part['text'])
                elif part['type'] == 'image_url':
                    url = part['image_url']['url']
                    if not url.startswith('data:') or ';base64,' not in url:
                        raise ValueError('Only inline base64 images are supported')
                    data = base64.b64decode(url.split(';base64,', 1)[1], validate=True)
                    with Image.open(io.BytesIO(data)) as image:
                        media = Image.MIME[image.format]
                    images.append((data, media))
                    saw_images = True
                else:
                    raise ValueError(f"Unsupported content type: {part['type']}")
        else:
            raise ValueError('Only system and user messages are supported')
    return '\n\n'.join(systems), '\n'.join(text), images


def validation_stage(messages):
    system = next((m['content'] for m in messages if m['role'] == 'system'), '')
    if 'Assign a score' in system:
        return 'image'
    if 'Status: "success" or "failure"' in system:
        return 'final'
    return 'key_points'


def valid_reply(reply, stage):
    try:
        validate_reply(reply, stage)
        return True
    except FormatError:
        return False


def run_process(command, *, cwd, env, input_text, timeout, check=True):
    proc = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    if getattr(PROCESS_TRACE, 'record', None) is not None:
        PROCESS_TRACE.record.update(cli_spawned=True, cli_pid=proc.pid,
                                    cli_spawned_at=datetime.now(timezone.utc).isoformat())
    try:
        stdout, stderr = proc.communicate(input_text, timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise RuntimeError('Judge CLI timed out') from None
    finally:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    if proc.returncode and check:
        raise RuntimeError(f'Judge CLI exited {proc.returncode}: {(stderr or stdout)[-1500:]}')
    return (stdout, stderr) if check else (proc.returncode, stdout, stderr)


class CLIEngine:
    def __init__(self, model=None, effort='medium', concurrency=10, usage_log=None, timeout=180,
                 attempts=3, transport_attempts=2, circuit=None, cli_slots=None):
        if not 1 <= concurrency <= 10 or not 1 <= attempts <= 3 or not 1 <= transport_attempts <= 2:
            raise ValueError('Judge limits: concurrency1..10, format attempts1..3, transport attempts1..2')
        self.model = model
        self.effort = effort
        self.concurrency = concurrency
        self.semaphore = threading.BoundedSemaphore(concurrency)
        self.lock = threading.Lock()
        self.usage_log = Path(usage_log) if usage_log else None
        self.timeout = timeout
        self.attempts = attempts
        self.transport_attempts = transport_attempts
        self.circuit, self.cli_slots = circuit, cli_slots
        self.local = threading.local()
        self.calls = []
        self.cache_hits = 0

    def last_completion(self):
        return self.local.completion

    def log(self, record):
        with self.lock:
            self.calls.append(record)
            if self.usage_log:
                self.usage_log.parent.mkdir(parents=True, exist_ok=True)
                with self.usage_log.open('a') as output:
                    output.write(json.dumps(record) + '\n')

    def generate(self, messages, max_new_tokens=512, temperature=0, model=None, trace_context=None, **kwargs):
        context = dict(trace_context or {})
        stage = context.get('stage') or validation_stage(messages)
        last_error = None
        transport_failures = 0
        with self.semaphore:
            system, text, images = unpack_messages(messages)
            for attempt in range(self.attempts):
                slot = self.cli_slots.acquire(self.circuit) if self.cli_slots else nullcontext()
                with slot:
                    # Admission is deliberately after both queues and before
                    # every spawn, including retries queued by asyncio.gather.
                    permit = self.circuit.before_spawn(context, self.timeout + 60) if self.circuit else None
                    started = time.monotonic()
                    record = {**context, 'call_id': uuid.uuid4().hex, 'engine': type(self).__name__,
                              'model': model or self.model, 'effort': self.effort,
                              'stage': stage, 'attempt': attempt + 1, 'requested_max_new_tokens': max_new_tokens,
                              'requested_temperature': temperature, 'image_count': len(images),
                              'prompt_sha256': prompt_digest(messages), 'spawn_admitted': True, 'cli_spawned': False,
                              'started_at': datetime.now(timezone.utc).isoformat()}
                    try:
                        PROCESS_TRACE.record = record
                        reply, details = self.call(system, text, images, model or self.model)
                        record.update(details)
                        record['response'] = reply
                        record['response_sha256'] = hashlib.sha256(reply.encode()).hexdigest()
                        if self.circuit:
                            headroom = details.get('quota_headroom')
                            try:
                                if headroom:
                                    self.circuit.failure(permit, 'Claude quota headroom reached: ' + json.dumps(headroom), 'headroom')
                            except ValueError:
                                # An unparseable reset must not discard a valid reply.
                                headroom = None
                            if not headroom:
                                self.circuit.success(permit)
                        validate_reply(reply, stage)
                        record['parsed'] = parse_image_score(reply) if stage == 'image' else parse_status(reply) if stage == 'final' else None
                        record['ok'] = True
                        self.local.completion = record
                        return [reply]
                    except FormatError as error:
                        last_error = FormatError(f'Malformed {stage} reply; scorefield-v2: {error}')
                        record.update(ok=False, format_error=True, error_kind='format', error=str(last_error))
                    except (RuntimeError, ValueError, OSError) as error:
                        kind = classify_error(error)
                        if self.circuit:
                            self.circuit.failure(permit, error, kind)
                        record.update(ok=False, error_kind=kind, error=str(error))
                        last_error = InfrastructureError(str(error), kind)
                        if kind in ('quota', 'authentication', 'configuration', 'rate_limit', 'circuit_open'):
                            raise last_error from error
                        transport_failures += 1
                        if transport_failures >= self.transport_attempts:
                            raise last_error from error
                    finally:
                        PROCESS_TRACE.record = None
                        record['duration_ms'] = round((time.monotonic() - started) * 1000)
                        record['ended_at'] = datetime.now(timezone.utc).isoformat()
                        self.log(record)
                if attempt + 1 < self.attempts:
                    time.sleep(min(2 ** attempt, 8))
        raise last_error


class ClaudeCodeEngine(CLIEngine):
    def __init__(self, model=FAMILY['model'], command=CLAUDE_CLI, **kwargs):
        super().__init__(model=model, **kwargs)
        self.command = command

    def call(self, system, text, images, model):
        with tempfile.TemporaryDirectory(prefix='om2w-claude-judge-') as work:
            prompt = Path(work) / 'system.txt'
            prompt.write_text(system)
            config = Path(work) / 'mcp.json'
            config.write_text('{"mcpServers":{}}')
            command = [self.command, '-p', '--model', model, '--effort', self.effort, '--tools', '',
                       '--strict-mcp-config', '--mcp-config', str(config), '--setting-sources', '',
                       '--settings', '{"disableAllHooks":true}', '--disable-slash-commands', '--no-chrome',
                       '--no-session-persistence', '--system-prompt-file', str(prompt), '--max-turns', '1',
                       '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
            parts = [{'type': 'text', 'text': text}] + [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': media, 'data': base64.b64encode(data).decode()}}
                for data, media in images]
            payload = json.dumps({'type': 'user', 'message': {'role': 'user', 'content': parts}}) + '\n'
            code, stdout, stderr = run_process(command, cwd=work, env=claude_environment(), input_text=payload,
                                               timeout=self.timeout, check=False)
            events = []
            for line in stdout.splitlines():
                try:
                    events.append(json.loads(line)) if line.startswith('{') else None
                except ValueError:
                    pass
            limits = [e.get('rate_limit_info') for e in events if e.get('type') == 'rate_limit_event']
            rejected = next((info for info in reversed(limits) if (info or {}).get('status') == 'rejected'), None)
            result = next((e for e in reversed(events) if e.get('type') == 'result'), None)
            if code or not result or result.get('is_error') or result.get('subtype') != 'success':
                summary = {key: (result or {}).get(key) for key in ('subtype', 'is_error', 'api_error_status', 'result', 'errors')}
                detail = f'Claude judge CLI exited {code}; result: {json.dumps(summary)[-1200:]}'
                if rejected:
                    # Only the rejecting window: the circuit takes the latest reset in the text.
                    detail += ' Claude rate limit rejected: ' + json.dumps({key: rejected.get(key) for key in ('status', 'rateLimitType', 'resetsAt')})
                if not result and stderr:
                    detail += ' stderr: ' + stderr[-800:]
                raise RuntimeError(detail)
            init = next((e for e in events if e.get('subtype') == 'init'), {})
            if init.get('tools') or init.get('mcp_servers'):
                raise RuntimeError('Unexpected tools enabled in Claude judge')
            return result['result'], {'usage': normalize_claude_usage(result.get('usage')), 'claude_usage': result.get('usage'),
                                      'total_cost_usd': result.get('total_cost_usd'), 'stop_reason': result.get('stop_reason'),
                                      'reported_model': init.get('model'), 'rate_limit': limits[-1] if limits else None,
                                      'quota_headroom': quota_headroom(limits[-1] if limits else None)}


class CodexEngine(CLIEngine):
    def __init__(self, model='gpt-6.1-sol', **kwargs):
        super().__init__(model=model, **kwargs)

    def call(self, system, text, images, model):
        with tempfile.TemporaryDirectory(prefix='om2w-codex-judge-') as work:
            prompt = Path(work) / 'system.txt'
            prompt.write_text(system)
            output = Path(work) / 'answer.txt'
            command = ['codex', 'exec', '-m', model, '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
                       '--ignore-rules', '-s', 'read-only', '--json', '-o', str(output),
                       '-c', 'model_reasoning_effort=' + json.dumps(self.effort),
                       '-c', 'model_instructions_file=' + json.dumps(str(prompt)),
                       '-c', 'model_catalog_json=' + json.dumps(str(CODEX_MODEL_CATALOG)),
                       '-c', 'project_doc_max_bytes=0']
            for key, value in CODEX_TOOL_ISOLATION.items():
                command += ['-c', key + '=' + toml_value(value)]
            for i, (data, media) in enumerate(images):
                target = Path(work) / f'image-{i:04d}.{media.split("/")[1]}'
                target.write_bytes(data)
                command += ['-i', str(target)]
            command += ['-']
            stdout, _ = run_process(command, cwd=work, env=os.environ, input_text=text, timeout=self.timeout)
            events = [json.loads(line) for line in stdout.splitlines() if line.startswith('{')]
            forbidden = [e for e in events if e.get('item') and e['item'].get('type') not in ('agent_message', 'reasoning', 'error')]
            if forbidden:
                raise RuntimeError('Codex attempted to use tools while judging')
            completed = next((e for e in reversed(events) if e.get('type') == 'turn.completed'), None)
            if not output.exists() or not completed:
                failure = next((e for e in reversed(events) if e.get('type') in ('turn.failed', 'error')), {})
                raise RuntimeError('Codex returned no completed judgment: ' + str(failure.get('error', failure.get('message', 'missing result'))))
            return output.read_bytes().decode('utf-8'), {'usage': completed.get('usage'), 'total_cost_usd': None,
                                        'reported_model': completed.get('model'), 'stop_reason': 'turn.completed'}


class FakeEngine(CLIEngine):
    def __init__(self, replies=None, **kwargs):
        super().__init__(model='fake', **kwargs)
        self.replies = iter(replies) if replies is not None else None

    def call(self, system, text, images, model):
        if self.replies is not None:
            return next(self.replies), {}
        if 'Assign a score' in system:
            return '**Reasoning**: Synthetic fixture.\n\n**Score**: 5', {}
        if 'Status: "success" or "failure"' in system:
            return 'Thoughts: Synthetic fixture only.\nStatus: success', {}
        return '**Key Points**:\n1. Find the price of the Blue Widget.', {}

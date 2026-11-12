"""Valid stage results are immutable and scoped to one pass and full input hash."""
import hashlib
import json
from pathlib import Path

from .circuit import atomic_json, file_lock
from .parsers import validate_reply, parse_image_score, parse_status


class CacheIntegrityError(ValueError):
    pass


def json_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def prompt_digest(messages):
    return json_digest(messages)


class StageCache:
    def __init__(self, directory, config_sha256):
        self.directory = Path(directory)
        self.config_sha256 = config_sha256
        # Validate the saved pass before any parallel stage can spend a call.
        for path in sorted(self.directory.glob('*.json')):
            try:
                value = json.loads(path.read_text())
                key = value['key']
                if path.is_symlink() or key['config_sha256'] != self.config_sha256 or path.stem != json_digest(key):
                    raise ValueError('Stage filename or configuration differs')
                self.retrieve(path, key, key['context']['stage'])
            except (KeyError, TypeError, ValueError) as error:
                raise CacheIntegrityError(f'Invalid saved stage cache: {path.name}') from error

    def key(self, context, messages, model, effort):
        return {'config_sha256': self.config_sha256, 'context': context, 'model': model,
                'effort': effort, 'prompt_sha256': prompt_digest(messages)}

    def verify_call_history(self, calls):
        by_id = {call['call_id']: call for call in calls}
        for path in sorted(self.directory.glob('*.json')):
            value = json.loads(path.read_text())
            key = value['key']
            call = by_id.get(value['call_id'])
            if (not call or not call.get('ok') or call.get('response') != value['response'] or
                    call.get('response_sha256') != value['response_sha256'] or
                    any(call.get(field) != key[field] for field in ('model', 'effort', 'prompt_sha256')) or
                    any(call.get(field) != expected for field, expected in key['context'].items())):
                raise CacheIntegrityError(f'Stage cache has no matching successful usage call: {path.name}')

    def retrieve(self, path, key, stage):
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text())
            if (value['format_version'] != 1 or value['key'] != key or not value['call_id'] or
                    hashlib.sha256(value['response'].encode()).hexdigest() != value['response_sha256']):
                raise ValueError('Stage cache key or response hash differs')
            validate_reply(value['response'], stage)
            parsed = parse_image_score(value['response']) if stage == 'image' else parse_status(value['response']) if stage == 'final' else None
            if value['parsed'] != parsed:
                raise ValueError('Stage parsed metadata differs from its response')
        except (KeyError, TypeError, ValueError) as error:
            raise CacheIntegrityError(f'Invalid saved stage cache: {path.name}') from error
        return value


class BoundEngine:
    def __init__(self, engine, context, cache=None):
        self.engine, self.context, self.cache = engine, dict(context), cache

    def generate(self, messages, **kwargs):
        stage = self.context['stage']
        if self.cache is None:
            return self.engine.generate(messages, trace_context=self.context, **kwargs)
        key = self.cache.key(self.context, messages, self.engine.model, self.engine.effort)
        path = self.cache.directory / (json_digest(key) + '.json')
        with file_lock(str(path) + '.lock'):
            cached = self.cache.retrieve(path, key, stage)
            if cached is not None:
                with self.engine.lock:
                    self.engine.cache_hits += 1
                return [cached['response']]
            response = self.engine.generate(messages, trace_context=self.context, **kwargs)[0]
            record = self.engine.last_completion()
            atomic_json(path, {'format_version': 1, 'key': key, 'response': response,
                               'response_sha256': hashlib.sha256(response.encode()).hexdigest(),
                               'call_id': record['call_id'], 'parsed': record.get('parsed')})
            return [response]


def bind_engine(engine, context, cache=None):
    return BoundEngine(engine, context, cache)

"""Process-safe model-family admission shared by collection and judging.

Only the admit operation grants a spawn permit. Reading status never spends a
probe. The CLI provides the same transitions to a non-Python collector.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

POLICY = {'id': 'codex-circuit-v2', 'quota_delays_seconds': [1800, 3600, 7200, 14400, 21600],
          'quota_probes_per_24h': 6, 'transport_probes_per_24h': 12,
          'transport_delays_seconds': [60, 120, 300, 600, 900],
          'transport_failure_threshold': 3, 'reset_margin_seconds': 60}


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp')
    try:
        with temporary.open('x') as stream:
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def file_lock(path, blocking=True):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


class CircuitOpen(RuntimeError):
    infrastructure_error = True

    def __init__(self, state):
        self.state = state
        super().__init__('Model family circuit is ' + state['state'])


class InfrastructureError(RuntimeError):
    infrastructure_error = True

    def __init__(self, message, kind='transport'):
        self.kind = kind
        super().__init__(message)


def classify_error(error):
    if isinstance(error, CircuitOpen):
        return 'circuit_open'
    if isinstance(error, InfrastructureError):
        return error.kind
    text = str(error)
    if re.search(r'not logged in|authentication|unauthorized|invalid.api.key|login required|token.expired', text, re.I):
        return 'authentication'
    if re.search(r'quota|session limit|usage.limit|hit your.*limit|limit.*resets|insufficient_quota', text, re.I):
        return 'quota'
    if re.search(r'rate.limit|too many requests|\b429\b|retry.after', text, re.I):
        return 'rate_limit'
    if re.search(r'timed? out|timeout|connection|temporar|service.unavailable|\b50[0234]\b|\b529\b|overloaded|ECONN|EPIPE', text, re.I):
        return 'transport'
    if isinstance(error, OSError):
        return 'configuration' if isinstance(error, FileNotFoundError) else 'transport'
    return 'configuration'


def _wall_epoch(value, zone=None):
    """Resolve wall time using target-date DST, choosing the later repeated hour."""
    candidates = []
    if zone is not None:
        for fold in (0, 1):
            epoch = value.replace(tzinfo=zone, fold=fold).timestamp()
            if datetime.fromtimestamp(epoch, zone).replace(tzinfo=None) == value:
                candidates.append(epoch)
    else:
        # mktime honors the process TZ/system zone for the target date. Taking
        # today's UTC offset would be wrong when reset crosses a DST boundary.
        for dst in (-1, 0, 1):
            try:
                epoch = time.mktime((value.year, value.month, value.day, value.hour,
                                     value.minute, value.second, -1, -1, dst)) + value.microsecond / 1_000_000
                if datetime.fromtimestamp(epoch) == value:
                    candidates.append(epoch)
            except (ValueError, OverflowError, OSError):
                pass
    return max(candidates) if candidates else None


def reset_epoch(message, now):
    field = r'["\x27]?(?:resetsAt|resetAt|reset_at|resets_at)["\x27]?\s*[:=]\s*["\x27]?'
    candidates = [int(value) for value in re.findall(field + r'(\d{10})(?!\d)', message, re.I)]
    iso = r'(\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:[Zz]|[+-]\d{2}:?\d{2})?)'
    for value in re.findall(field + iso, message, re.I):
        try:
            parsed = datetime.fromisoformat(value.upper().replace('Z', '+00:00'))
            epoch = parsed.timestamp() if parsed.tzinfo else _wall_epoch(parsed)
            if epoch is not None:
                candidates.append(epoch)
        except (ValueError, OverflowError, OSError):
            pass
    months = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'
    zone_name = r'(?:[A-Za-z][A-Za-z0-9_+\-]*(?:/[A-Za-z0-9_+\-]+)+|UTC|GMT)'
    human = re.compile(r'(?:try\s+again|resets?)\s+at\s+(' + months + r')\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+'
                       r'(\d{4})\s+(0?[1-9]|1[0-2]):([0-5]\d)\s*([AP]M)'
                       r'(?:\s+(?:in\s+)?(?:\((' + zone_name + r')\)|(' + zone_name + r')))?', re.I)
    month_numbers = {name: index for index, name in enumerate(
        ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'), 1)}
    for match in human.finditer(message):
        month, day, year, hour, minute, half, parenthesized, bare = match.groups()
        try:
            zone = ZoneInfo(parenthesized or bare) if parenthesized or bare else None
            wall = datetime(int(year), month_numbers[month[:3].lower()], int(day),
                            int(hour) % 12 + (12 if half.upper() == 'PM' else 0), int(minute))
            epoch = _wall_epoch(wall, zone)
            if epoch is not None:
                candidates.append(epoch)
        except (ValueError, OverflowError, OSError, ZoneInfoNotFoundError):
            pass
    future = [value for value in candidates if value > now]
    return max(future) if future else None


def retry_after(message):
    match = re.search(r'retry[-_ ]after["\x27]?\s*[:=]\s*["\x27]?(\d+)', message, re.I)
    return max(30, min(900, int(match.group(1)))) if match else 60


def _family():
    return {'state': 'closed', 'generation': 0, 'not_before_epoch': None, 'reason': None,
            'quota_backoff_index': 0, 'transport_backoff_index': 0,
            'consecutive_transport_failures': 0, 'probe_history': [], 'probe': None}


def pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


class CodexCircuit:
    def __init__(self, path, family='codex', clock=time.time):
        self.path, self.family, self.clock = Path(path).resolve(), family, clock

    def _read(self):
        if not self.path.exists():
            return {'format_version': 1, 'policy': POLICY, 'families': {}}
        value = json.loads(self.path.read_text())
        if value.get('format_version') != 1 or value.get('policy') != POLICY or not isinstance(value.get('families'), dict):
            raise ValueError('Incompatible model circuit schema or policy')
        for state in value['families'].values():
            if (not isinstance(state, dict) or state.get('state') not in ('closed', 'open', 'half_open', 'blocked')
                    or type(state.get('generation')) is not int or state['generation'] < 0
                    or not isinstance(state.get('probe_history'), list)
                    or any(type(state.get(key)) is not int or state[key] < 0 for key in
                           ('quota_backoff_index', 'transport_backoff_index', 'consecutive_transport_failures'))
                    or (state['state'] in ('open', 'half_open') and
                        (not isinstance(state.get('reason'), dict) or
                         not isinstance(state.get('not_before_epoch'), (int, float))))
                    or (state['state'] == 'half_open' and
                        (not isinstance(state.get('probe'), dict) or type(state['probe'].get('pid')) is not int
                         or state['probe']['pid'] < 1))):
                raise ValueError('Invalid saved model circuit state')
        return value

    def _save(self, document, event, state):
        document['families'][self.family] = state
        document['updated_at_epoch'] = self.clock()
        atomic_json(self.path, document)
        with self.path.with_suffix(self.path.suffix + '.events.jsonl').open('a') as stream:
            stream.write(json.dumps({'at_epoch': self.clock(), 'family': self.family,
                                     'event': event, 'generation': state['generation'],
                                     'state': state['state'], 'not_before_epoch': state['not_before_epoch'],
                                     'reason': state['reason']}) + '\n')

    def status(self):
        with file_lock(str(self.path) + '.lock'):
            state = self._read()['families'].get(self.family, _family())
            return {**state, 'family': self.family, 'ready': state['state'] == 'closed' or
                    (state['state'] == 'open' and (state['not_before_epoch'] or 0) <= self.clock()) or
                    (state['state'] == 'half_open' and not pid_alive(state['probe']['pid']))}

    def before_spawn(self, scope=None, lease_seconds=240, owner_pid=None):
        owner_pid = os.getpid() if owner_pid is None else owner_pid
        if type(owner_pid) is not int or owner_pid < 1 or lease_seconds <= 0:
            raise ValueError('Admission requires a positive owner PID and lease duration')
        with file_lock(str(self.path) + '.lock'):
            document = self._read()
            state = document['families'].get(self.family, _family())
            now = self.clock()
            if state['state'] == 'half_open':
                probe = state['probe']
                alive = pid_alive(probe['pid'])
                if alive:
                    raise CircuitOpen(state)
                state.update(state='open', probe=None)
            if state['state'] == 'blocked' or (state['state'] == 'open' and (state['not_before_epoch'] or 0) > now):
                raise CircuitOpen(state)
            if state['state'] == 'open' and state['reason']['kind'] == 'headroom':
                # A headroom pause is a scheduled window reset, not an observed
                # failure, so no probe is needed once that reset has passed.
                state.update(state='closed', generation=state['generation'] + 1, not_before_epoch=None, reason=None, probe=None)
            permit = {'family': self.family, 'generation': state['generation'], 'probe_token': None}
            if state['state'] == 'open':
                history = [p for p in state['probe_history'] if p['at_epoch'] > now - 86400]
                kind = state['reason']['kind']
                relevant = [p for p in history if p['kind'] == kind]
                limit = POLICY['quota_probes_per_24h'] if kind == 'quota' else POLICY['transport_probes_per_24h']
                if len(relevant) >= limit:
                    state['not_before_epoch'] = max(state['not_before_epoch'] or 0, relevant[0]['at_epoch'] + 86400)
                    self._save(document, 'probe_budget_wait', state)
                    raise CircuitOpen(state)
                token = uuid.uuid4().hex
                state['probe_history'] = history + [{'at_epoch': now, 'kind': kind, 'token': token, 'scope': scope}]
                state.update(state='half_open', probe={'token': token, 'pid': owner_pid or os.getpid(),
                                                      'lease_until_epoch': now + lease_seconds})
                permit['probe_token'] = token
            self._save(document, 'admit', state)
            return permit

    @staticmethod
    def _current(state, permit):
        return (permit['generation'] == state['generation'] and
                (state['state'] != 'half_open' or permit.get('probe_token') == state['probe']['token']))

    def success(self, permit):
        self._validate_permit(permit)
        with file_lock(str(self.path) + '.lock'):
            document = self._read()
            state = document['families'].get(self.family, _family())
            if not self._current(state, permit) or state['state'] in ('open', 'blocked'):
                return
            if state['state'] == 'half_open':
                state['generation'] += 1
            state.update(state='closed', not_before_epoch=None, reason=None, probe=None,
                         consecutive_transport_failures=0)
            # Rolling probe history and backoff indices survive a successful probe.
            self._save(document, 'success', state)

    def abandon(self, permit):
        """Return an admitted half-open call that never requested a model spawn."""
        self._validate_permit(permit)
        with file_lock(str(self.path) + '.lock'):
            document = self._read()
            state = document['families'].get(self.family, _family())
            if state['state'] != 'half_open' or not self._current(state, permit):
                return
            token = state['probe']['token']
            state['probe_history'] = [entry for entry in state['probe_history'] if entry['token'] != token]
            state.update(state='open', probe=None, generation=state['generation'] + 1)
            self._save(document, 'abandon_unspawned', state)

    def failure(self, permit, error, kind=None):
        self._validate_permit(permit)
        kind = kind or classify_error(error)
        if kind not in ('quota', 'headroom', 'authentication', 'configuration', 'rate_limit', 'transport'):
            raise ValueError('Unsupported circuit failure kind')
        with file_lock(str(self.path) + '.lock'):
            document = self._read()
            state = document['families'].get(self.family, _family())
            now = self.clock()
            future_reset = reset_epoch(str(error), now) if kind in ('quota', 'headroom') else None
            if kind == 'headroom' and not future_reset:
                raise ValueError('A quota headroom pause requires its window reset time')
            if not self._current(state, permit):
                # Already-spawned calls can extend an evidenced reset, but cannot
                # each advance the backoff or undo a newer generation.
                if state['state'] in ('open', 'half_open') and future_reset:
                    state['not_before_epoch'] = max(state['not_before_epoch'] or 0, future_reset + 60)
                    self._save(document, 'late_reset_evidence', state)
                return
            if kind == 'headroom':
                if state['state'] == 'blocked':
                    return
                state.update(state='open', generation=state['generation'] + 1, probe=None,
                             not_before_epoch=max(state['not_before_epoch'] or 0, future_reset + 60),
                             reason={'kind': 'headroom', 'error_sha256': hashlib.sha256(str(error).encode()).hexdigest(),
                                     'observed_at_epoch': now, 'reset_epoch': future_reset})
                self._save(document, 'headroom', state)
                return
            if kind == 'transport':
                state['consecutive_transport_failures'] += 1
                if state['state'] == 'closed' and state['consecutive_transport_failures'] < 3:
                    self._save(document, 'transport_failure', state)
                    return
            evidence = {'kind': kind, 'error_sha256': hashlib.sha256(str(error).encode()).hexdigest(),
                        'observed_at_epoch': now, 'reset_epoch': future_reset}
            state.update(generation=state['generation'] + 1, probe=None, reason=evidence)
            if kind in ('authentication', 'configuration'):
                state.update(state='blocked', not_before_epoch=None)
            else:
                key = 'quota_backoff_index' if kind == 'quota' else 'transport_backoff_index'
                delays = POLICY['quota_delays_seconds'] if kind == 'quota' else POLICY['transport_delays_seconds']
                delay = delays[min(state[key], len(delays) - 1)]
                state[key] += 1
                if kind == 'rate_limit':
                    delay = retry_after(str(error))
                state.update(state='open', not_before_epoch=future_reset + 60 if future_reset else now + delay)
            self._save(document, 'failure', state)

    def _validate_permit(self, permit):
        if (not isinstance(permit, dict) or permit.get('family') != self.family
                or type(permit.get('generation')) is not int or permit['generation'] < 0):
            raise ValueError('Permit belongs to a different family or invalid generation')

    def operator_recover(self, *, acknowledgement, reason, expected_generation, expected_error_sha256):
        if acknowledgement != 'operator_repaired_authentication_or_configuration' or not isinstance(reason, str) or not reason.strip():
            raise ValueError('Operator recovery requires explicit acknowledgement and a recorded reason')
        with file_lock(str(self.path) + '.lock'):
            document = self._read()
            state = document['families'].get(self.family, _family())
            if (state['state'] != 'blocked' or state['reason']['kind'] not in ('authentication', 'configuration')
                    or state['generation'] != expected_generation or state['reason']['error_sha256'] != expected_error_sha256):
                raise ValueError('Operator recovery must acknowledge the current auth/configuration block')
            previous = state['reason']
            state.update(state='open', generation=state['generation'] + 1,
                         not_before_epoch=self.clock(), probe=None,
                         reason={**previous, 'operator_acknowledgement': acknowledgement,
                                 'operator_reason': reason, 'operator_recovered_at_epoch': self.clock()})
            self._save(document, 'operator_recovery', state)
            return self.status_unlocked(state)

    def status_unlocked(self, state):
        return {**state, 'family': self.family, 'ready': state['state'] == 'open' and
                state['not_before_epoch'] <= self.clock()}


class GlobalCLISlots:
    """Ten advisory file locks cap CLI processes across judge processes."""
    def __init__(self, directory, limit=10):
        if not 1 <= limit <= 10:
            raise ValueError('CLI slot limit must be within 1..10')
        self.directory, self.limit = Path(directory), limit

    @contextmanager
    def acquire(self, circuit=None):
        self.directory.mkdir(parents=True, exist_ok=True)
        while True:
            if circuit:
                state = circuit.status()
                if not state['ready']:
                    raise CircuitOpen(state)
            for index in range(self.limit):
                stream = (self.directory / f'{index}.lock').open('a+')
                try:
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    stream.close()
                    continue
                try:
                    yield
                finally:
                    fcntl.flock(stream, fcntl.LOCK_UN)
                    stream.close()
                return
            time.sleep(.05)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--family', default='codex')
    parser.add_argument('operation', choices=['status', 'admit', 'success', 'failure', 'abandon', 'operator-recover'])
    parser.add_argument('--permit', help='JSON returned by admit')
    parser.add_argument('--kind', choices=['quota', 'headroom', 'authentication', 'configuration', 'rate_limit', 'transport'])
    parser.add_argument('--error', default='')
    parser.add_argument('--scope', default='collector')
    parser.add_argument('--lease-seconds', type=int, default=1260)
    parser.add_argument('--owner-pid', type=int, default=os.getppid(), help='Long-lived collector owner, not this short CLI bridge')
    parser.add_argument('--request-stdin', action='store_true', help='Read permit/error/kind/scope/owner_pid/lease_seconds as JSON; avoids sensitive argv')
    args = parser.parse_args()
    request = {}
    if args.request_stdin:
        request = json.load(sys.stdin)
        allowed = {'permit', 'error', 'kind', 'scope', 'owner_pid', 'lease_seconds', 'acknowledgement',
                   'reason', 'expected_generation', 'expected_error_sha256'}
        if not isinstance(request, dict) or set(request) - allowed:
            parser.error('Unexpected stdin request fields')
        for name, value in request.items():
            setattr(args, name, json.dumps(value) if name == 'permit' and isinstance(value, dict) else value)
    circuit = CodexCircuit(args.state, args.family)
    try:
        if args.operation == 'admit':
            value = circuit.before_spawn(args.scope, args.lease_seconds, args.owner_pid)
        elif args.operation == 'status':
            value = circuit.status()
        elif args.operation == 'operator-recover':
            value = circuit.operator_recover(**{key: request.get(key) for key in
                ('acknowledgement', 'reason', 'expected_generation', 'expected_error_sha256')})
        else:
            if not args.permit:
                parser.error('--permit is required for completion transitions')
            permit = json.loads(args.permit)
            if args.operation == 'success':
                circuit.success(permit)
            elif args.operation == 'abandon':
                circuit.abandon(permit)
            else:
                circuit.failure(permit, args.error, args.kind)
            value = circuit.status()
        print(json.dumps(value))
        return 0
    except CircuitOpen as error:
        print(json.dumps(error.state))
        return 75


if __name__ == '__main__':
    raise SystemExit(main())

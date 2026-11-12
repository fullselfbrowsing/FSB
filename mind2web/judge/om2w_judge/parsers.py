"""Structured response fields for the explicitly versioned local judge protocol."""
import re

PARSER_ID = 'scorefield-v2'


class FormatError(ValueError):
    pass


def _field(reply, name):
    if not isinstance(reply, str) or not reply.strip():
        raise FormatError(f'Missing {name} field')
    lines = reply.splitlines()
    # Count label-shaped fields before validating the value. A malformed first
    # field must not disappear merely because a later field has a valid value.
    label = re.compile(r'^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*)?' + name +
                       r'(?:\*\*)?\s*:(?:\*\*)?\s*(.*?)\s*$', re.I)
    candidate = re.compile(r'^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*' + name +
                           r'(?:\*\*)?(?=\s|:|$)|' + name + r'(?=\s*:|\s*$|\s+[+\-]?\d))', re.I)
    candidates = [(i, line) for i, line in enumerate(lines) if candidate.match(line)]
    fields = [(i, match.group(1)) for i, line in candidates if (match := label.fullmatch(line))]
    if len(candidates) != 1 or len(fields) != 1:
        raise FormatError(f'Expected exactly one {name} field')
    index, value = fields[0]
    if any(line.strip() for line in lines[index + 1:]):
        raise FormatError(f'Trailing text after {name} field')
    if any(line.lstrip().startswith('```') for line in lines):
        raise FormatError('Response fields must not be fenced')
    return value


def parse_image_score(reply):
    value = _field(reply, 'Score')
    if value.startswith('**') and value.endswith('**'):
        value = value[2:-2]
    if not re.fullmatch(r'[1-5]', value):
        raise FormatError('Score must be one integer from 1 to 5')
    return int(value)


def parse_status(reply):
    value = _field(reply, 'Status')
    if value.startswith('**') and value.endswith('**'):
        value = value[2:-2]
    if value in ('success', '"success"', "'success'"):
        return 1
    if value in ('failure', '"failure"', "'failure'"):
        return 0
    raise FormatError('Status must be the exact success or failure enum')


def validate_reply(reply, stage):
    if stage == 'image':
        parse_image_score(reply)
    elif stage == 'final':
        parse_status(reply)
    elif not isinstance(reply, str) or not reply.strip():
        raise FormatError('Empty key-points reply')

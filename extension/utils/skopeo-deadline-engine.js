(function(global) {
  'use strict';

  var VERSION = 'skopeo-deadline-engine/1';
  var MIN_ORDINAL = 0;
  var MAX_ORDINAL = 3652058;
  var MAX_DAY_OFFSET = 36600;
  var MAX_ASSERTIONS = 2048;
  var MAX_CITATIONS = 2048;
  var MAX_CALENDARS = 32;
  var MAX_HOLIDAYS = 4096;
  var MONTH_STARTS = Object.freeze([
    0,
    0,
    31,
    59,
    90,
    120,
    151,
    181,
    212,
    243,
    273,
    304,
    334
  ]);
  var RULE_KEYS = Object.freeze([
    'schemaVersion',
    'partitionKey',
    'familyId',
    'operator',
    'anchorAssertionVersionId',
    'amount',
    'boundary',
    'timezone',
    'businessCalendarId',
    'businessCalendarVersionId',
    'consequence',
    'citedInputAssertionVersionIds',
    'citationIds',
    'deadlineRuleId'
  ]);

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === null || prototype === Object.prototype;
    } catch (_error) {
      return false;
    }
  }

  function dataValues(value, keys) {
    if (!isPlainRecord(value)) return null;
    var ownKeys;
    try {
      ownKeys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if (ownKeys.length !== keys.length || ownKeys.some(function(key) {
      return typeof key !== 'string' || keys.indexOf(key) < 0;
    })) {
      return null;
    }
    var output = Object.create(null);
    for (var index = 0; index < keys.length; index += 1) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
      } catch (_error) {
        return null;
      }
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) {
        return null;
      }
      output[keys[index]] = descriptor.value;
    }
    return output;
  }

  function dataArrayValues(value, maximum, minimum) {
    if (!Array.isArray(value)) return null;
    var keys;
    try {
      keys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if (value.length < minimum || value.length > maximum ||
        keys.some(function(key) {
          if (key === 'length') return false;
          return typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) ||
            Number(key) >= value.length;
        })) {
      return null;
    }
    var output = [];
    for (var index = 0; index < value.length; index += 1) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      } catch (_error) {
        return null;
      }
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) {
        return null;
      }
      output.push(descriptor.value);
    }
    return output;
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function frozenArray(values) {
    return Object.freeze(values.slice());
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  }

  function parseCivilDate(value) {
    if (typeof value !== 'string' ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
      return null;
    }
    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    if (!Number.isSafeInteger(year) || year < 1 || year > 9999 ||
        !Number.isSafeInteger(month) || month < 1 || month > 12 ||
        !Number.isSafeInteger(day) || day < 1 || day > daysInMonth(year, month)) {
      return null;
    }
    return frozenRecord([
      ['year', year],
      ['month', month],
      ['day', day],
      ['value', value]
    ]);
  }

  function toOrdinal(value) {
    var fields = dataValues(value, ['year', 'month', 'day', 'value']);
    var parsed = fields && parseCivilDate(fields.value);
    if (!parsed || parsed.year !== fields.year || parsed.month !== fields.month ||
        parsed.day !== fields.day) {
      return null;
    }
    var priorYear = fields.year - 1;
    var ordinal = priorYear * 365 +
      Math.floor(priorYear / 4) -
      Math.floor(priorYear / 100) +
      Math.floor(priorYear / 400) +
      MONTH_STARTS[fields.month] +
      fields.day - 1;
    if (fields.month > 2 && isLeapYear(fields.year)) ordinal += 1;
    return ordinal >= MIN_ORDINAL && ordinal <= MAX_ORDINAL ? ordinal : null;
  }

  function fourDigit(value) {
    return String(value).padStart(4, '0');
  }

  function twoDigit(value) {
    return String(value).padStart(2, '0');
  }

  function fromOrdinal(value) {
    if (!Number.isSafeInteger(value) || value < MIN_ORDINAL || value > MAX_ORDINAL) {
      return null;
    }
    var low = 1;
    var high = 9999;
    var year = 1;
    while (low <= high) {
      var middle = Math.floor((low + high) / 2);
      var prior = middle - 1;
      var yearStart = prior * 365 +
        Math.floor(prior / 4) -
        Math.floor(prior / 100) +
        Math.floor(prior / 400);
      var nextPrior = middle;
      var nextStart = nextPrior * 365 +
        Math.floor(nextPrior / 4) -
        Math.floor(nextPrior / 100) +
        Math.floor(nextPrior / 400);
      if (value < yearStart) {
        high = middle - 1;
      } else if (value >= nextStart) {
        low = middle + 1;
      } else {
        year = middle;
        break;
      }
    }
    var yearPrior = year - 1;
    var dayOfYear = value - (
      yearPrior * 365 +
      Math.floor(yearPrior / 4) -
      Math.floor(yearPrior / 100) +
      Math.floor(yearPrior / 400)
    );
    var month = 1;
    while (month <= 12) {
      var monthDays = daysInMonth(year, month);
      if (dayOfYear < monthDays) break;
      dayOfYear -= monthDays;
      month += 1;
    }
    if (month > 12) return null;
    return parseCivilDate(
      fourDigit(year) + '-' + twoDigit(month) + '-' + twoDigit(dayOfYear + 1)
    );
  }

  function validDigestId(value, prefix) {
    return typeof value === 'string' &&
      value.slice(0, prefix.length) === prefix &&
      /^[0-9a-f]{64}$/.test(value.slice(prefix.length));
  }

  function validOpaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validTimezone(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      (value === 'UTC' ||
        /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value));
  }

  function stringSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return output;
  }

  function sortedUnique(values) {
    var set = stringSet(values);
    return Object.keys(set).sort();
  }

  function addBlocker(blockers, code) {
    blockers[code] = true;
  }

  async function parseCitations(schema, values) {
    var inputs = dataArrayValues(values, MAX_CITATIONS, 1);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var citation = await schema.parseCitation(inputs[index]);
      if (!citation || own(seen, citation.citationId)) return null;
      seen[citation.citationId] = citation;
      output.push(citation);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byId', Object.freeze(seen)]
    ]);
  }

  async function parseAssertions(schema, values, citations) {
    var inputs = dataArrayValues(values, MAX_ASSERTIONS, 0);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var assertion = await schema.parseAssertion(inputs[index], citations.items);
      if (!assertion || own(seen, assertion.assertionVersionId)) return null;
      seen[assertion.assertionVersionId] = assertion;
      output.push(assertion);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byId', Object.freeze(seen)]
    ]);
  }

  function parseRuleFields(value) {
    var fields = dataValues(value, RULE_KEYS);
    if (!fields || !validOpaque(fields.partitionKey, 1024) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validDigestId(fields.anchorAssertionVersionId, 'stav1:') ||
        !validDigestId(fields.deadlineRuleId, 'str1:')) {
      return null;
    }
    return fields;
  }

  function calendarLookup(context, calendarId, calendarVersionId) {
    var sameId = null;
    for (var index = 0; index < context.calendars.length; index += 1) {
      var calendar = context.calendars[index];
      if (calendar.calendarId === calendarId) {
        sameId = calendar;
        if (calendar.calendarVersionId === calendarVersionId) {
          return frozenRecord([
            ['status', 'exact'],
            ['calendar', calendar]
          ]);
        }
      }
    }
    return frozenRecord([
      ['status', sameId ? 'stale' : 'missing'],
      ['calendar', null]
    ]);
  }

  function weekdayCode(ordinal) {
    return (ordinal + 1) % 7;
  }

  function businessTarget(anchorOrdinal, amount, direction, calendar) {
    var weekend = stringSet(calendar.weekendDays.map(function(day) {
      return String(day);
    }));
    if (Object.keys(weekend).length >= 7) return null;
    var holidays = stringSet(calendar.holidays);
    var remaining = amount;
    var current = anchorOrdinal;
    var iterations = 0;
    var maximumIterations = amount * 7 + calendar.holidays.length * 7 + 7;
    while (remaining > 0 && iterations < maximumIterations) {
      current += direction;
      iterations += 1;
      if (current < MIN_ORDINAL || current > MAX_ORDINAL) return null;
      var date = fromOrdinal(current);
      if (!date) return null;
      if (!weekend[String(weekdayCode(current))] && !holidays[date.value]) {
        remaining -= 1;
      }
    }
    return remaining === 0 ? current : null;
  }

  function consequenceFields(value) {
    if (value === null) return null;
    var fields = dataValues(value, ['assertionVersionId', 'citationIds']);
    var citationIds = fields && dataArrayValues(fields.citationIds, MAX_CITATIONS, 1);
    if (!fields || !validDigestId(fields.assertionVersionId, 'stav1:') ||
        !citationIds || citationIds.some(function(id) {
          return !validDigestId(id, 'stc1:');
        })) {
      return undefined;
    }
    return frozenRecord([
      ['assertionVersionId', fields.assertionVersionId],
      ['citationIds', frozenArray(sortedUnique(citationIds))]
    ]);
  }

  async function evaluateRule(ruleValue, assertionValues, citationValues, contextValue) {
    var schema = global && global.FsbSkopeoTruthSchema;
    if (!schema || schema.VERSION !== 'skopeo-truth-schema/1' ||
        typeof schema.parseCitation !== 'function' ||
        typeof schema.parseAssertion !== 'function' ||
        typeof schema.parseDeadlineRule !== 'function' ||
        typeof schema.parseDeadlineResult !== 'function') {
      return null;
    }
    var citations = await parseCitations(schema, citationValues);
    if (!citations) return null;
    var assertions = await parseAssertions(schema, assertionValues, citations);
    if (!assertions) return null;
    var rule = await schema.parseDeadlineRule(
      ruleValue,
      assertions.items,
      citations.items
    );
    var fields = rule && parseRuleFields(rule);
    if (!fields) return null;
    var anchor = assertions.byId[fields.anchorAssertionVersionId];
    if (!anchor || anchor.familyId !== fields.familyId ||
        anchor.partitionKey !== fields.partitionKey ||
        !anchor.typedValue || anchor.typedValue.kind !== 'civil-date') {
      return null;
    }
    var anchorDate = parseCivilDate(anchor.typedValue.value);
    if (!anchorDate) return null;

    var blockers = Object.create(null);
    var parsedContext = schema.parseEvaluationContext(contextValue, citations.items);
    var inputAssertionIds = [];
    var inputCitationIds = [];
    var citedAssertions = dataArrayValues(
      fields.citedInputAssertionVersionIds,
      MAX_ASSERTIONS,
      1
    );
    var citedCitations = dataArrayValues(fields.citationIds, MAX_CITATIONS, 1);
    if (!citedAssertions || !citedCitations ||
        citedAssertions.some(function(id) {
          return !validDigestId(id, 'stav1:');
        }) ||
        citedCitations.some(function(id) {
          return !validDigestId(id, 'stc1:');
        })) {
      return null;
    }
    for (var inputIndex = 0; inputIndex < citedAssertions.length; inputIndex += 1) {
      var inputAssertion = assertions.byId[citedAssertions[inputIndex]];
      if (!inputAssertion) addBlocker(blockers, 'fact-missing');
      else inputAssertionIds.push(inputAssertion.assertionVersionId);
    }
    if (inputAssertionIds.indexOf(anchor.assertionVersionId) < 0) {
      inputAssertionIds.push(anchor.assertionVersionId);
    }
    inputCitationIds = inputCitationIds.concat(citedCitations, anchor.citationIds);
    for (var assertionIndex = 0; assertionIndex < assertions.items.length;
      assertionIndex += 1) {
      var currentAssertion = assertions.items[assertionIndex];
      if (currentAssertion.assertionId === anchor.assertionId &&
          currentAssertion.assertionVersionId !== anchor.assertionVersionId) {
        addBlocker(blockers, 'fact-conflict');
        inputAssertionIds.push(currentAssertion.assertionVersionId);
        inputCitationIds = inputCitationIds.concat(currentAssertion.citationIds);
      }
    }
    if (anchor.trustState !== 'extracted') addBlocker(blockers, 'input-not-exact');

    var consequence = consequenceFields(fields.consequence);
    if (consequence === undefined) return null;
    if (consequence === null) {
      addBlocker(blockers, 'consequence-missing');
    } else {
      inputCitationIds = inputCitationIds.concat(consequence.citationIds);
      if (!assertions.byId[consequence.assertionVersionId]) {
        addBlocker(blockers, 'consequence-missing');
      }
    }

    if (fields.boundary !== 'inclusive' && fields.boundary !== 'exclusive') {
      addBlocker(blockers, 'boundary-ambiguous');
    }
    if (!validTimezone(fields.timezone)) {
      addBlocker(blockers, 'timezone-missing');
    }
    if (!parsedContext) {
      addBlocker(
        blockers,
        fields.operator === 'add-business-days' ||
          fields.operator === 'subtract-business-days'
          ? 'unsupported-business-day-rule'
          : 'evaluation-context-missing'
      );
    } else if (validTimezone(fields.timezone) &&
        parsedContext.governingTimezoneBinding.timezone !== fields.timezone) {
      addBlocker(blockers, 'evaluation-context-mismatch');
    }

    var direction = 0;
    var business = false;
    switch (fields.operator) {
      case 'add-calendar-days':
        direction = 1;
        break;
      case 'subtract-calendar-days':
        direction = -1;
        break;
      case 'add-business-days':
        direction = 1;
        business = true;
        break;
      case 'subtract-business-days':
        direction = -1;
        business = true;
        break;
      default:
        addBlocker(blockers, 'unsupported-rule');
    }
    if (!Number.isSafeInteger(fields.amount) ||
        fields.amount < 1 || fields.amount > MAX_DAY_OFFSET) {
      addBlocker(blockers, 'unsupported-rule');
    }

    var selectedCalendar = null;
    if (business) {
      if (!validOpaque(fields.businessCalendarId, 256) ||
          !validOpaque(fields.businessCalendarVersionId, 256)) {
        addBlocker(blockers, 'business-calendar-missing');
      } else if (parsedContext) {
        var lookup = calendarLookup(
          parsedContext,
          fields.businessCalendarId,
          fields.businessCalendarVersionId
        );
        if (lookup.status === 'exact') selectedCalendar = lookup.calendar;
        else if (lookup.status === 'stale') {
          addBlocker(blockers, 'unsupported-business-day-rule');
        } else {
          addBlocker(blockers, 'business-calendar-missing');
        }
      }
    } else if (fields.businessCalendarId !== null ||
        fields.businessCalendarVersionId !== null) {
      addBlocker(blockers, 'unsupported-rule');
    }

    var targetDate = null;
    if (Object.keys(blockers).length === 0) {
      var anchorOrdinal = toOrdinal(anchorDate);
      var targetOrdinal = business
        ? businessTarget(anchorOrdinal, fields.amount, direction, selectedCalendar)
        : anchorOrdinal + direction * fields.amount;
      targetDate = fromOrdinal(targetOrdinal);
      if (!targetDate) addBlocker(blockers, 'unsupported-rule');
    }

    var blockerCodes = Object.keys(blockers).sort();
    inputAssertionIds = sortedUnique(inputAssertionIds);
    inputCitationIds = sortedUnique(inputCitationIds);
    for (var citationIndex = 0; citationIndex < inputCitationIds.length;
      citationIndex += 1) {
      if (!citations.byId[inputCitationIds[citationIndex]]) {
        addBlocker(blockers, 'citation-stale');
      }
    }
    blockerCodes = Object.keys(blockers).sort();
    if (blockerCodes.length > 0) targetDate = null;

    var boundary = fields.boundary === 'inclusive' || fields.boundary === 'exclusive'
      ? fields.boundary
      : null;
    var timezone = validTimezone(fields.timezone) ? fields.timezone : null;
    var input = {
      schemaVersion: schema.VERSION,
      partitionKey: fields.partitionKey,
      familyId: fields.familyId,
      deadlineRuleId: fields.deadlineRuleId,
      anchorAssertionVersionId: anchor.assertionVersionId,
      anchorCivilDate: anchorDate.value,
      windowStartCivilDate: targetDate ? targetDate.value : null,
      deadlineCivilDate: targetDate ? targetDate.value : null,
      boundary: boundary,
      timezone: timezone,
      consequence: consequence,
      ruleVersion: schema.DEADLINE_RULE_VERSION,
      calendarId: business ? fields.businessCalendarId : null,
      calendarVersionId: business ? fields.businessCalendarVersionId : null,
      inputAssertionVersionIds: inputAssertionIds,
      inputCitationIds: inputCitationIds,
      trustState: 'inferred',
      inputsCurrent: parsedContext !== null,
      inputsExact: blockerCodes.length === 0,
      eligibility: blockerCodes.length === 0 ? 'eligible' : 'ineligible',
      blockerCodes: blockerCodes
    };
    var derivationId = await schema.deriveDeadlineDerivationId(input);
    if (!derivationId) return null;
    var complete = Object.create(null);
    var inputKeys = Object.keys(input);
    for (var keyIndex = 0; keyIndex < inputKeys.length; keyIndex += 1) {
      complete[inputKeys[keyIndex]] = input[inputKeys[keyIndex]];
    }
    complete.deadlineDerivationId = derivationId;
    var parsed = await schema.parseDeadlineResult(
      complete,
      [rule],
      assertions.items,
      citations.items
    );
    return parsed;
  }

  var api = Object.freeze({
    VERSION: VERSION,
    parseCivilDate: parseCivilDate,
    toOrdinal: toOrdinal,
    fromOrdinal: fromOrdinal,
    evaluateRule: evaluateRule
  });

  global.FsbSkopeoDeadlineEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

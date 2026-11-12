(function(global) {
  'use strict';

  var VERSION = 'skopeo-alert-runtime/1';
  var ALARM_PREFIX = 'skopeoAlert:';
  var NOTIFICATION_PREFIX = 'skopeoAlertNotification:';

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) { return false; }
  }

  function exact(value, keys) {
    if (!plain(value)) return null;
    var actual;
    try { actual = Reflect.ownKeys(value); } catch (_error) { return null; }
    if (actual.length !== keys.length || actual.some(function(key) {
      return typeof key !== 'string' || keys.indexOf(key) < 0;
    })) return null;
    var output = Object.create(null);
    for (var index = 0; index < keys.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
      output[keys[index]] = descriptor.value;
    }
    return output;
  }

  function validAlertKey(value) {
    return typeof value === 'string' && /^sa1:[0-9a-f]{64}$/.test(value);
  }

  function partsAt(epoch, timezone, IntlDateTimeFormat) {
    if (!Number.isFinite(epoch) || typeof timezone !== 'string' ||
        typeof IntlDateTimeFormat !== 'function') return null;
    var formatter;
    try {
      formatter = new IntlDateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      });
    } catch (_error) { return null; }
    var parts;
    try { parts = formatter.formatToParts(new Date(epoch)); } catch (_error) { return null; }
    var values = Object.create(null);
    for (var index = 0; index < parts.length; index += 1) {
      var part = parts[index];
      if (['year', 'month', 'day', 'hour', 'minute', 'second'].indexOf(part.type) >= 0) {
        if (own(values, part.type) || !/^\d+$/.test(part.value)) return null;
        values[part.type] = Number(part.value);
      }
    }
    return Object.keys(values).length === 6 ? values : null;
  }

  function civilDateAt(epoch, timezone, IntlDateTimeFormat) {
    var parts = partsAt(epoch, timezone, IntlDateTimeFormat);
    if (!parts) return null;
    return String(parts.year).padStart(4, '0') + '-' +
      String(parts.month).padStart(2, '0') + '-' +
      String(parts.day).padStart(2, '0');
  }

  function resolveScheduledTime(civilDate, timezone, IntlDateTimeFormat) {
    if (typeof civilDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) return null;
    var year = Number(civilDate.slice(0, 4));
    var month = Number(civilDate.slice(5, 7));
    var day = Number(civilDate.slice(8, 10));
    var desired = Date.UTC(year, month - 1, day, 9, 0, 0);
    var guess = desired;
    for (var iteration = 0; iteration < 4; iteration += 1) {
      var observed = partsAt(guess, timezone, IntlDateTimeFormat);
      if (!observed) return null;
      var observedWall = Date.UTC(
        observed.year, observed.month - 1, observed.day,
        observed.hour, observed.minute, observed.second);
      guess += desired - observedWall;
    }
    var finalParts = partsAt(guess, timezone, IntlDateTimeFormat);
    return finalParts && finalParts.year === year && finalParts.month === month &&
      finalParts.day === day && finalParts.hour === 9 && finalParts.minute === 0 &&
      finalParts.second === 0 ? guess : null;
  }

  function frozenStatus(status) {
    return Object.freeze({ status: status });
  }

  function create(dependencies) {
    var fields = exact(dependencies, [
      'alertSchema', 'store', 'alarms', 'notifications', 'now', 'IntlDateTimeFormat',
      'iconUrl', 'revalidate', 'openEvidence'
    ]);
    if (!fields || !fields.alertSchema || !fields.store ||
        typeof fields.store.schedule !== 'function' ||
        typeof fields.store.transition !== 'function' ||
        typeof fields.store.list !== 'function' || typeof fields.store.listAll !== 'function' ||
        typeof fields.store.getByAlertKey !== 'function' || !fields.alarms ||
        typeof fields.alarms.get !== 'function' || typeof fields.alarms.getAll !== 'function' ||
        typeof fields.alarms.create !== 'function' || typeof fields.alarms.clear !== 'function' ||
        !fields.notifications || typeof fields.notifications.create !== 'function' ||
        typeof fields.now !== 'function' || typeof fields.IntlDateTimeFormat !== 'function' ||
        typeof fields.iconUrl !== 'string' || fields.iconUrl.length === 0 ||
        typeof fields.revalidate !== 'function' || typeof fields.openEvidence !== 'function') return null;

    var schema = fields.alertSchema;
    var reconcilePromise = null;

    function alarmName(alertKey) {
      return validAlertKey(alertKey) ? ALARM_PREFIX + alertKey.slice(4) : null;
    }

    function notificationId(alertKey) {
      return validAlertKey(alertKey) ? NOTIFICATION_PREFIX + alertKey.slice(4) : null;
    }

    function alertKeyFromName(value, prefix) {
      if (typeof value !== 'string' || value.slice(0, prefix.length) !== prefix) return null;
      var suffix = value.slice(prefix.length);
      return /^[0-9a-f]{64}$/.test(suffix) ? 'sa1:' + suffix : null;
    }

    function nowValue() {
      var value;
      try { value = fields.now(); } catch (_error) { return null; }
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }

    async function clearAlarm(alertKey) {
      var name = alarmName(alertKey);
      if (!name) return false;
      try { await fields.alarms.clear(name); } catch (_error) { return false; }
      return true;
    }

    async function ensureAlarm(entry) {
      var name = alarmName(entry.candidate.alertKey);
      var now = nowValue();
      if (!name || now === null) return false;
      var target = Math.max(entry.scheduledFor, now);
      var current;
      try { current = await fields.alarms.get(name); } catch (_error) { current = null; }
      if (current && current.name === name && current.scheduledTime === target) return true;
      try { await fields.alarms.create(name, { when: target }); } catch (_error) { return false; }
      return true;
    }

    async function transition(entry, to, reason) {
      return fields.store.transition({
        partition: entry.candidate.partition,
        alertKey: entry.candidate.alertKey,
        from: entry.state,
        to: to,
        reason: reason
      });
    }

    function relativeDate(entry, now) {
      var current = civilDateAt(
        now, entry.candidate.deadline.timezone, fields.IntlDateTimeFormat);
      var expected = entry.candidate.deadline.alertCivilDate;
      return current === null ? 'unknown' : current < expected ? 'before' : current > expected ? 'after' : 'same';
    }

    async function supersedeRelated(candidate) {
      var values = await fields.store.list(candidate.partition);
      for (var index = 0; index < values.length; index += 1) {
        var entry = values[index];
        if (entry.candidate.alertKey === candidate.alertKey ||
            entry.candidate.agreementStableId !== candidate.agreementStableId ||
            entry.candidate.familyId !== candidate.familyId || entry.state === 'superseded' ||
            entry.state === 'missed') continue;
        var result = await transition(entry, 'superseded', 'evidence-superseded');
        if (!result || result.ok !== true) return false;
        await clearAlarm(entry.candidate.alertKey);
        if (typeof fields.notifications.clear === 'function') {
          try { await fields.notifications.clear(notificationId(entry.candidate.alertKey)); }
          catch (_error) {}
        }
      }
      return true;
    }

    async function consider(candidateValue) {
      var candidate = schema.parseCandidate(candidateValue);
      var now = nowValue();
      if (!candidate || now === null || !await supersedeRelated(candidate)) {
        return frozenStatus('closed');
      }
      var scheduledFor = resolveScheduledTime(
        candidate.deadline.alertCivilDate,
        candidate.deadline.timezone,
        fields.IntlDateTimeFormat);
      if (!Number.isSafeInteger(scheduledFor) || scheduledFor < 0) return frozenStatus('closed');
      var scheduled = await fields.store.schedule(candidate, scheduledFor);
      if (!scheduled || scheduled.ok !== true || !scheduled.entry) return frozenStatus('closed');
      var entry = scheduled.entry;
      if (entry.state === 'failed') {
        var retry = await transition(entry, 'scheduled', null);
        if (!retry || retry.ok !== true) return frozenStatus('failed');
        entry = retry.entry;
      }
      var relation = relativeDate(entry, now);
      if (relation === 'after' && entry.state === 'scheduled') {
        var missed = await transition(entry, 'missed', 'alert-date-passed');
        await clearAlarm(candidate.alertKey);
        return frozenStatus(missed && missed.ok === true ? 'missed' : 'closed');
      }
      if (entry.state !== 'scheduled') return frozenStatus(entry.state);
      return frozenStatus(await ensureAlarm(entry) ? 'scheduled' : 'failed');
    }

    async function reconcileNow() {
      var entries = await fields.store.listAll();
      var byName = new Map();
      entries.forEach(function(entry) {
        byName.set(alarmName(entry.candidate.alertKey), entry);
      });
      var alarms;
      try { alarms = await fields.alarms.getAll(); } catch (_error) { alarms = []; }
      if (!Array.isArray(alarms)) alarms = [];
      for (var alarmIndex = 0; alarmIndex < alarms.length; alarmIndex += 1) {
        var alarm = alarms[alarmIndex];
        if (alarm && typeof alarm.name === 'string' &&
            alarm.name.slice(0, ALARM_PREFIX.length) === ALARM_PREFIX && !byName.has(alarm.name)) {
          try { await fields.alarms.clear(alarm.name); } catch (_error) {}
        }
      }
      var now = nowValue();
      if (now === null) return frozenStatus('closed');
      for (var index = 0; index < entries.length; index += 1) {
        var entry = entries[index];
        if (entry.state === 'attempted') {
          await transition(entry, 'failed', 'attempt-interrupted');
          await clearAlarm(entry.candidate.alertKey);
        } else if (entry.state === 'scheduled') {
          if (relativeDate(entry, now) === 'after') {
            await transition(entry, 'missed', 'alert-date-passed');
            await clearAlarm(entry.candidate.alertKey);
          } else {
            await ensureAlarm(entry);
          }
        } else {
          await clearAlarm(entry.candidate.alertKey);
        }
      }
      return frozenStatus('reconciled');
    }

    function reconcile() {
      if (reconcilePromise) return reconcilePromise;
      reconcilePromise = Promise.resolve().then(reconcileNow).finally(function() {
        reconcilePromise = null;
      });
      return reconcilePromise;
    }

    function sameCandidate(left, right) {
      try { return JSON.stringify(left) === JSON.stringify(right); } catch (_error) { return false; }
    }

    async function currentCandidate(entry) {
      var result;
      try { result = await fields.revalidate(entry.candidate); } catch (_error) { result = null; }
      var data = result && exact(result, ['status', 'candidate']);
      var candidate = data && data.candidate !== null ? schema.parseCandidate(data.candidate) : null;
      if (!data || (data.status !== 'current' && data.status !== 'superseded' &&
          data.status !== 'closed') || (data.status === 'current' && !candidate) ||
          (data.status !== 'current' && data.candidate !== null)) return null;
      return { status: data.status, candidate: candidate };
    }

    function notificationOptions(candidate) {
      return {
        type: 'basic',
        iconUrl: fields.iconUrl,
        title: candidate.vendorLabel + ' · notice deadline',
        message: candidate.deadline.deadlineCivilDate + ' · ' + candidate.deadline.consequence,
        contextMessage: 'Owner: ' + candidate.owner.label +
          ' · Governing evidence: ' + candidate.evidence.label,
        buttons: [{ title: 'Open governing evidence' }],
        priority: 1
      };
    }

    async function handleAlarm(alarm) {
      var alertKey = alarm && alertKeyFromName(alarm.name, ALARM_PREFIX);
      if (!alertKey) return false;
      var entry = await fields.store.getByAlertKey(alertKey);
      if (!entry || entry.state !== 'scheduled') return false;
      var now = nowValue();
      if (now === null) return false;
      var relation = relativeDate(entry, now);
      if (relation === 'before') {
        await ensureAlarm(entry);
        return true;
      }
      if (relation === 'after') {
        await transition(entry, 'missed', 'alert-date-passed');
        await clearAlarm(alertKey);
        return true;
      }
      var current = await currentCandidate(entry);
      if (!current || current.status === 'closed') {
        await transition(entry, 'failed', 'authority-unavailable');
        await clearAlarm(alertKey);
        return true;
      }
      if (current.status === 'superseded' || !sameCandidate(entry.candidate, current.candidate)) {
        await transition(entry, 'superseded', 'evidence-superseded');
        await clearAlarm(alertKey);
        if (current.candidate) await consider(current.candidate);
        return true;
      }
      if (typeof fields.notifications.getPermissionLevel === 'function') {
        var permission;
        try { permission = await fields.notifications.getPermissionLevel(); }
        catch (_error) { permission = 'denied'; }
        if (permission !== 'granted') {
          await transition(entry, 'failed', 'notification-unavailable');
          await clearAlarm(alertKey);
          return true;
        }
      }
      var attempted = await transition(entry, 'attempted', null);
      if (!attempted || attempted.ok !== true) return false;
      try {
        await fields.notifications.create(notificationId(alertKey), notificationOptions(current.candidate));
      } catch (_error) {
        await transition(attempted.entry, 'failed', 'notification-failed');
        await clearAlarm(alertKey);
        return true;
      }
      var delivered = await transition(attempted.entry, 'delivered', null);
      await clearAlarm(alertKey);
      return !!delivered && delivered.ok === true;
    }

    async function handleNotificationClick(value) {
      var alertKey = alertKeyFromName(value, NOTIFICATION_PREFIX);
      if (!alertKey) return false;
      var entry = await fields.store.getByAlertKey(alertKey);
      if (!entry || entry.state !== 'delivered') return false;
      var current = await currentCandidate(entry);
      if (!current || current.status !== 'current' ||
          !sameCandidate(entry.candidate, current.candidate)) return false;
      try { return await fields.openEvidence(current.candidate) === true; }
      catch (_error) { return false; }
    }

    return Object.freeze({
      VERSION: VERSION,
      ALARM_PREFIX: ALARM_PREFIX,
      NOTIFICATION_PREFIX: NOTIFICATION_PREFIX,
      alarmName: alarmName,
      notificationId: notificationId,
      consider: consider,
      reconcile: reconcile,
      handleAlarm: handleAlarm,
      handleNotificationClick: handleNotificationClick
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    ALARM_PREFIX: ALARM_PREFIX,
    NOTIFICATION_PREFIX: NOTIFICATION_PREFIX,
    civilDateAt: civilDateAt,
    resolveScheduledTime: resolveScheduledTime,
    create: create
  });
  global.FsbSkopeoAlertRuntime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

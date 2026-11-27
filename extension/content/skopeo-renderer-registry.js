// Closed, bundled Skopeo result renderers that emit bounded data atoms only.
(function (global) {
  'use strict';

  var MAX_ATOMS = 12;
  var MAX_ITEMS = 50;
  var MAX_COLUMNS = 8;
  var MAX_TEXT = 512;
  var NARROW_BREAKPOINT = 480;
  var ATOM_TYPES = Object.freeze([
    'section-heading',
    'status-row',
    'capability-row',
    'fact-list',
    'item-list',
    'compact-table',
    'timeline',
    'diff',
    'notice'
  ]);
  var ATOM_SET = new Set(ATOM_TYPES);
  var RESULT_KEYS = Object.freeze(['status', 'actionLabel', 'sections']);
  var ERROR_KEYS = Object.freeze(['status', 'actionLabel', 'errorCode']);
  var OPTIONS_KEYS = Object.freeze(['width']);
  var RENDERER_GENRE = Object.freeze({
    'generic-default-v1': 'generic-app',
    'reader-knowledge-v1': 'reader-knowledge',
    'communication-v1': 'communication',
    'document-editor-v1': 'document-editor',
    'worklist-record-v1': 'worklist-record',
    'dashboard-admin-v1': 'dashboard-admin',
    'transactional-v1': 'transactional',
    'media-feed-v1': 'media-feed',
    'drive-docs-deep-pack-v1': 'drive-docs-deep-pack'
  });
  var ALLOWED_ATOMS = Object.freeze({
    'generic-app': new Set(['section-heading', 'status-row', 'notice']),
    'reader-knowledge': new Set(['section-heading', 'fact-list', 'item-list', 'notice']),
    communication: new Set(['section-heading', 'item-list', 'timeline', 'notice']),
    'document-editor': new Set(['section-heading', 'fact-list', 'diff', 'notice']),
    'worklist-record': new Set(['section-heading', 'fact-list', 'item-list', 'timeline', 'notice']),
    'dashboard-admin': new Set(['section-heading', 'status-row', 'fact-list', 'compact-table', 'notice']),
    transactional: new Set(['section-heading', 'fact-list', 'compact-table', 'notice']),
    'media-feed': new Set(['section-heading', 'item-list', 'fact-list', 'notice']),
    'drive-docs-deep-pack': new Set(ATOM_TYPES)
  });

  function schemaApi() {
    if (global.FsbSkopeoProfileSchema) return global.FsbSkopeoProfileSchema;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('../utils/skopeo-profile-schema.js');
    }
    throw new TypeError('Skopeo profile schema is required');
  }

  var schema = schemaApi();
  var RENDERER_IDS = Object.freeze(Array.from(schema.RENDERER_IDS));
  var RENDERER_SET = new Set(RENDERER_IDS);

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Reflect.ownKeys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some(function (key) { return typeof key !== 'string'; })) {
      return false;
    }
    var allowed = new Set(expected);
    return keys.every(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      return allowed.has(key) && descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.enumerable === true;
    });
  }

  function isClosedData(value, state) {
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean') {
      return true;
    }
    if (!value || typeof value !== 'object') return false;
    var tracking = state || { visiting: new Set(), complete: new Set() };
    if (tracking.complete.has(value)) return true;
    if (tracking.visiting.has(value)) return false;
    if (!Array.isArray(value) && !isPlainObject(value)) return false;
    tracking.visiting.add(value);
    var keys = Reflect.ownKeys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (Array.isArray(value) && key === 'length') continue;
      if (typeof key !== 'string') return false;
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true || !isClosedData(descriptor.value, tracking)) {
        return false;
      }
    }
    tracking.visiting.delete(value);
    tracking.complete.add(value);
    return true;
  }

  function isClosedArray(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) return false;
    var keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || keys.some(function (key) { return typeof key !== 'string'; })) {
      return false;
    }
    for (var index = 0; index < value.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) return false;
    }
    return keys.includes('length');
  }

  function containsRemoteAddress(value) {
    return /(?:https?:\/\/)|(?:data:)|(?:javascript:)/i.test(value);
  }

  function outputText(value, optional) {
    if (optional && value === null) return true;
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value) &&
      !containsRemoteAddress(value);
  }

  function cleanText(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      value = String(value);
    } else if (typeof value === 'boolean') {
      value = value ? 'true' : 'false';
    } else if (typeof value !== 'string') {
      return null;
    }
    var normalized = value
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+/g, ' ')
      .replace(/(?:https?:\/\/|data:|javascript:)\S*/gi, '[external value omitted]')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return null;
    return normalized.slice(0, MAX_TEXT);
  }

  function cleanOptionalText(value) {
    return value === null ? null : cleanText(value);
  }

  function validOptions(value) {
    return hasExactKeys(value, OPTIONS_KEYS) && typeof value.width === 'number' &&
      Number.isFinite(value.width) && value.width > 0;
  }

  function noticeFor(actionLabel) {
    var action = cleanText(actionLabel);
    var message = action
      ? action.slice(0, 80) + ' didn’t finish. Review the target and try the action again.'
      : 'The action didn’t finish. Review the target and try the action again.';
    return deepFreeze([{
      type: 'notice',
      tone: 'error',
      heading: 'Action not completed',
      message: message,
      nextStep: 'Review the target and try again.'
    }]);
  }

  function exactSectionKeys(section) {
    if (!isPlainObject(section) || typeof section.kind !== 'string') return null;
    if (section.kind === 'heading') return ['kind', 'text'];
    if (section.kind === 'status' || section.kind === 'capability') {
      return ['kind', 'label', 'status', 'detail'];
    }
    if (section.kind === 'facts' || section.kind === 'items') return ['kind', 'heading', 'items'];
    if (section.kind === 'table') return ['kind', 'heading', 'columns', 'rows'];
    if (section.kind === 'timeline') return ['kind', 'heading', 'events'];
    if (section.kind === 'diff') {
      return ['kind', 'heading', 'beforeLabel', 'before', 'afterLabel', 'after'];
    }
    if (section.kind === 'notice') return ['kind', 'tone', 'heading', 'message', 'nextStep'];
    return null;
  }

  function sectionAtomType(kind) {
    if (kind === 'heading') return 'section-heading';
    if (kind === 'status') return 'status-row';
    if (kind === 'capability') return 'capability-row';
    if (kind === 'facts') return 'fact-list';
    if (kind === 'items') return 'item-list';
    if (kind === 'table') return 'compact-table';
    return kind;
  }

  function normalizePairItems(items) {
    if (!isClosedArray(items, MAX_ITEMS)) return null;
    var normalized = [];
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      if (!hasExactKeys(item, ['label', 'value'])) return null;
      var label = cleanText(item.label);
      var value = cleanText(item.value);
      if (!label || !value) return null;
      normalized.push({ label: label, value: value });
    }
    return normalized;
  }

  function normalizeListItems(items) {
    if (!isClosedArray(items, MAX_ITEMS)) return null;
    var normalized = [];
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      if (!hasExactKeys(item, ['text', 'metadata'])) return null;
      var text = cleanText(item.text);
      var metadata = cleanOptionalText(item.metadata);
      if (!text || (item.metadata !== null && !metadata)) return null;
      normalized.push({ text: text, metadata: metadata });
    }
    return normalized;
  }

  function normalizeTable(section) {
    if (!isClosedArray(section.columns, MAX_COLUMNS) || section.columns.length === 0 ||
        !isClosedArray(section.rows, MAX_ITEMS)) {
      return null;
    }
    var columns = section.columns.map(cleanText);
    if (columns.some(function (column) { return !column; })) return null;
    var rows = [];
    for (var rowIndex = 0; rowIndex < section.rows.length; rowIndex += 1) {
      var sourceRow = section.rows[rowIndex];
      if (!isClosedArray(sourceRow, MAX_COLUMNS) || sourceRow.length !== columns.length) {
        return null;
      }
      var row = sourceRow.map(cleanText);
      if (row.some(function (cell) { return !cell; })) return null;
      rows.push(row);
    }
    return { columns: columns, rows: rows };
  }

  function normalizeTimeline(events) {
    if (!isClosedArray(events, MAX_ITEMS)) return null;
    var normalized = [];
    for (var index = 0; index < events.length; index += 1) {
      var event = events[index];
      if (!hasExactKeys(event, ['time', 'text'])) return null;
      var time = cleanText(event.time);
      var text = cleanText(event.text);
      if (!time || !text) return null;
      normalized.push({ time: time, text: text });
    }
    return normalized;
  }

  function normalizeSection(section) {
    var keys = exactSectionKeys(section);
    if (!keys || !hasExactKeys(section, keys)) return null;
    if (section.kind === 'heading') {
      var text = cleanText(section.text);
      return text ? { type: 'section-heading', text: text } : null;
    }
    if (section.kind === 'status' || section.kind === 'capability') {
      var label = cleanText(section.label);
      var status = cleanText(section.status);
      var detail = cleanOptionalText(section.detail);
      if (!label || !status || (section.detail !== null && !detail)) return null;
      return {
        type: section.kind === 'status' ? 'status-row' : 'capability-row',
        label: label,
        status: status,
        detail: detail
      };
    }
    var heading = cleanText(section.heading);
    if (!heading) return null;
    if (section.kind === 'facts') {
      var facts = normalizePairItems(section.items);
      return facts ? { type: 'fact-list', heading: heading, items: facts } : null;
    }
    if (section.kind === 'items') {
      var items = normalizeListItems(section.items);
      return items ? { type: 'item-list', heading: heading, items: items } : null;
    }
    if (section.kind === 'table') {
      var table = normalizeTable(section);
      return table ? {
        type: 'compact-table',
        heading: heading,
        columns: table.columns,
        rows: table.rows
      } : null;
    }
    if (section.kind === 'timeline') {
      var events = normalizeTimeline(section.events);
      return events ? { type: 'timeline', heading: heading, events: events } : null;
    }
    if (section.kind === 'diff') {
      var beforeLabel = cleanText(section.beforeLabel);
      var before = cleanText(section.before);
      var afterLabel = cleanText(section.afterLabel);
      var after = cleanText(section.after);
      return beforeLabel && before && afterLabel && after ? {
        type: 'diff',
        heading: heading,
        beforeLabel: beforeLabel,
        before: before,
        afterLabel: afterLabel,
        after: after
      } : null;
    }
    if (!['info', 'warning', 'error'].includes(section.tone)) return null;
    var message = cleanText(section.message);
    var nextStep = cleanText(section.nextStep);
    return message && nextStep ? {
      type: 'notice',
      tone: section.tone,
      heading: heading,
      message: message,
      nextStep: nextStep
    } : null;
  }

  function narrowTable(atom) {
    return atom.rows.map(function (row, rowIndex) {
      var suffix = ' · Row ' + String(rowIndex + 1);
      return {
        type: 'fact-list',
        heading: atom.heading.slice(0, MAX_TEXT - suffix.length) + suffix,
        items: atom.columns.map(function (column, columnIndex) {
          return { label: column, value: row[columnIndex] };
        })
      };
    });
  }

  function validAtom(atom) {
    if (!isPlainObject(atom) || !ATOM_SET.has(atom.type)) return false;
    if (atom.type === 'section-heading') {
      return hasExactKeys(atom, ['type', 'text']) && outputText(atom.text);
    }
    if (atom.type === 'status-row' || atom.type === 'capability-row') {
      return hasExactKeys(atom, ['type', 'label', 'status', 'detail']) &&
        outputText(atom.label) && outputText(atom.status) && outputText(atom.detail, true);
    }
    if (atom.type === 'fact-list') {
      return hasExactKeys(atom, ['type', 'heading', 'items']) && outputText(atom.heading) &&
        isClosedArray(atom.items, MAX_ITEMS) && atom.items.every(function (item) {
          return hasExactKeys(item, ['label', 'value']) && outputText(item.label) && outputText(item.value);
        });
    }
    if (atom.type === 'item-list') {
      return hasExactKeys(atom, ['type', 'heading', 'items']) && outputText(atom.heading) &&
        isClosedArray(atom.items, MAX_ITEMS) && atom.items.every(function (item) {
          return hasExactKeys(item, ['text', 'metadata']) && outputText(item.text) &&
            outputText(item.metadata, true);
        });
    }
    if (atom.type === 'compact-table') {
      return hasExactKeys(atom, ['type', 'heading', 'columns', 'rows']) && outputText(atom.heading) &&
        isClosedArray(atom.columns, MAX_COLUMNS) && atom.columns.length > 0 &&
        atom.columns.every(function (column) { return outputText(column); }) &&
        isClosedArray(atom.rows, MAX_ITEMS) && atom.rows.every(function (row) {
          return isClosedArray(row, MAX_COLUMNS) && row.length === atom.columns.length &&
            row.every(function (cell) { return outputText(cell); });
        });
    }
    if (atom.type === 'timeline') {
      return hasExactKeys(atom, ['type', 'heading', 'events']) && outputText(atom.heading) &&
        isClosedArray(atom.events, MAX_ITEMS) && atom.events.every(function (event) {
          return hasExactKeys(event, ['time', 'text']) && outputText(event.time) && outputText(event.text);
        });
    }
    if (atom.type === 'diff') {
      return hasExactKeys(atom, ['type', 'heading', 'beforeLabel', 'before', 'afterLabel', 'after']) &&
        outputText(atom.heading) && outputText(atom.beforeLabel) && outputText(atom.before) &&
        outputText(atom.afterLabel) && outputText(atom.after);
    }
    return hasExactKeys(atom, ['type', 'tone', 'heading', 'message', 'nextStep']) &&
      ['info', 'warning', 'error'].includes(atom.tone) && outputText(atom.heading) &&
      outputText(atom.message) && outputText(atom.nextStep);
  }

  function validateAtoms(value) {
    return isClosedArray(value, MAX_ATOMS) && value.every(validAtom);
  }

  function render(rendererId, typedResult, options) {
    if (typeof rendererId !== 'string' || !RENDERER_SET.has(rendererId)) return null;
    if (!validOptions(options) || !isClosedData(typedResult)) return noticeFor(null);
    if (hasExactKeys(typedResult, ERROR_KEYS) && typedResult.status === 'error' &&
        cleanText(typedResult.errorCode)) {
      return noticeFor(typedResult.actionLabel);
    }
    if (!hasExactKeys(typedResult, RESULT_KEYS) || typedResult.status !== 'success' ||
        !cleanText(typedResult.actionLabel) || !isClosedArray(typedResult.sections, MAX_ATOMS)) {
      return noticeFor(null);
    }
    var allowed = ALLOWED_ATOMS[RENDERER_GENRE[rendererId]];
    var atoms = [];
    for (var index = 0; index < typedResult.sections.length; index += 1) {
      var section = typedResult.sections[index];
      var expectedType = section && sectionAtomType(section.kind);
      var atom = normalizeSection(section);
      if (!atom) return noticeFor(typedResult.actionLabel);
      if (!allowed.has(expectedType)) continue;
      var additions = atom.type === 'compact-table' && options.width < NARROW_BREAKPOINT
        ? narrowTable(atom)
        : [atom];
      for (var addIndex = 0; addIndex < additions.length && atoms.length < MAX_ATOMS; addIndex += 1) {
        atoms.push(additions[addIndex]);
      }
    }
    if (!atoms.length || !validateAtoms(atoms)) return noticeFor(typedResult.actionLabel);
    return deepFreeze(atoms);
  }

  var api = deepFreeze({
    RENDERER_IDS: RENDERER_IDS,
    render: render,
    validateAtoms: validateAtoms
  });

  global.FSBSkopeoRendererRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

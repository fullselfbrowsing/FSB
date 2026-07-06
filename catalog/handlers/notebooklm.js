(function (global) {
  'use strict';

  var ORIGIN = 'https://notebooklm.google.com';
  var SERVICE = 'notebooklm.google.com';
  var RPC_URL = ORIGIN + '/_/LabsTailwindUi/data/batchexecute';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var FEATURE_FLAGS = [2];
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var NOTEBOOK_ID_PARAMS = schema({
    notebook_id: stringField('Notebook UUID')
  }, ['notebook_id']);
  var LIST_CHAT_SESSIONS_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results' }
  }, ['notebook_id']);
  var ADD_SOURCE_TEXT_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    title: stringField('Title for the text source'),
    text: stringField('Text content to add as a source')
  }, ['notebook_id', 'title', 'text']);
  var ADD_SOURCE_URL_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    url: stringField('Website URL to add as a source')
  }, ['notebook_id', 'url']);
  var COPY_NOTEBOOK_PARAMS = NOTEBOOK_ID_PARAMS;
  var CREATE_NOTE_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    content: stringField('Note content')
  }, ['notebook_id', 'content']);
  var CREATE_NOTEBOOK_PARAMS = schema({
    title: { type: 'string', description: 'Notebook title' }
  }, []);
  var DELETE_NOTEBOOK_PARAMS = schema({
    notebook_ids: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Notebook UUIDs to delete' }
  }, ['notebook_ids']);
  var DELETE_NOTES_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    note_ids: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Note UUIDs to delete' }
  }, ['notebook_id', 'note_ids']);
  var DELETE_SOURCES_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    source_ids: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Source UUIDs to delete' }
  }, ['notebook_id', 'source_ids']);
  var RENAME_NOTEBOOK_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    title: stringField('New notebook title')
  }, ['notebook_id', 'title']);
  var UPDATE_NOTE_PARAMS = schema({
    notebook_id: stringField('Notebook UUID'),
    note_id: stringField('Note UUID'),
    content: stringField('New note content')
  }, ['notebook_id', 'note_id', 'content']);

  var SOURCE_TYPES = {
    1: 'website',
    2: 'text',
    3: 'pdf',
    4: 'google_doc',
    5: 'google_slides',
    6: 'youtube',
    7: 'audio'
  };

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function stringField(description) {
    return { type: 'string', minLength: 1, description: description };
  }

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function fallback(slug, reason) {
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'notebooklm-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value) {
    return value === true;
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function formEncode(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      parts.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(str(pairs[i][1])));
    }
    return parts.join('&');
  }

  function bootstrapSpec(path) {
    return {
      url: ORIGIN + (path || '/'),
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function rpcSpec(rpcId, params, sourcePath, auth) {
    var query = buildQuery([
      ['rpcids', rpcId],
      ['source-path', sourcePath || '/'],
      ['bl', auth.bl],
      ['hl', 'en']
    ]);
    var body = formEncode([
      ['f.req', JSON.stringify([[[rpcId, JSON.stringify(params || []), null, 'generic']]])],
      ['at', auth.at]
    ]);
    return {
      url: RPC_URL + query,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1'
      },
      body: body,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (isObject(result.data) || Array.isArray(result.data)) {
      try { return JSON.stringify(result.data); } catch (e) { return ''; }
    }
    return '';
  }

  function jsString(value) {
    var s = String(value || '');
    try { return JSON.parse('"' + s.replace(/"/g, '\\"') + '"'); } catch (e) { return s; }
  }

  function readWizField(text, key) {
    var source = String(text || '');
    var escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(?:["\\\']' + escapedKey + '["\\\']|' + escapedKey + ')\\s*:\\s*(["\\\'])([\\s\\S]*?)\\1');
    var match = re.exec(source);
    return match && match[2] ? jsString(match[2]) : '';
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  async function bootstrapAuth(slug, ctx, path) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'notebooklm-execute-bound-spec-unavailable') };
    }
    var boot = await ctx.executeBoundSpec(bootstrapSpec(path || '/'), ctx.tabId);
    if (resultFailed(boot)) { return { error: fallback(slug, 'notebooklm-bootstrap-auth-failed') }; }
    var text = textFromResult(boot);
    var at = readWizField(text, 'SNlM0e');
    if (!at) { return { error: fallback(slug, 'notebooklm-bootstrap-auth-missing') }; }
    return {
      auth: {
        at: at,
        bl: readWizField(text, 'cfb2h'),
        userId: readWizField(text, 'S06Grb'),
        email: readWizField(text, 'oPEP7c'),
        sid: readWizField(text, 'FdrFJe')
      }
    };
  }

  function rpcErrorReason(code) {
    if (code === 3) { return 'notebooklm-rpc-invalid-request'; }
    if (code === 5) { return 'notebooklm-rpc-not-found'; }
    if (code === 7 || code === 16) { return 'notebooklm-rpc-not-authenticated'; }
    return 'notebooklm-rpc-error-' + code;
  }

  function parseBatchResponse(text, slug) {
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (!trimmed || trimmed === ")]}'" || /^\d+$/.test(trimmed)) { continue; }
      var parsed;
      try { parsed = JSON.parse(trimmed); } catch (e) { continue; }
      if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) { continue; }
      var inner = parsed[0];
      if (inner[0] !== 'wrb.fr') { continue; }
      var dataStr = inner[2];
      if (dataStr === null || dataStr === undefined) {
        var errorCode = inner[5];
        var code = Array.isArray(errorCode) ? Number(errorCode[0]) : Number(errorCode);
        return { error: fallback(slug, rpcErrorReason(code)) };
      }
      try {
        return { data: JSON.parse(dataStr) };
      } catch (e2) {
        return { error: fallback(slug, 'notebooklm-rpc-data-parse-failed') };
      }
    }
    return { error: fallback(slug, 'notebooklm-rpc-response-parse-failed') };
  }

  async function readRpc(slug, rpcId, params, sourcePath, ctx, mapper) {
    var boot = await bootstrapAuth(slug, ctx, sourcePath || '/');
    if (boot.error) { return boot.error; }
    var res = await ctx.executeBoundSpec(rpcSpec(rpcId, params, sourcePath || '/', boot.auth), ctx.tabId);
    if (resultFailed(res)) { return fallback(slug, 'notebooklm-rpc-http-error'); }
    var parsed = parseBatchResponse(textFromResult(res), slug);
    if (parsed.error) { return parsed.error; }
    try {
      var mapped = mapper(parsed.data);
      if (!mapped) { return fallback(slug, 'notebooklm-rpc-shape-mismatch'); }
      return { success: true, status: res.status, finalUrl: res.finalUrl, redirected: res.redirected, data: mapped };
    } catch (e) {
      return fallback(slug, 'notebooklm-rpc-shape-mismatch');
    }
  }

  function mapNotebook(n) {
    n = Array.isArray(n) ? n : [];
    var meta = Array.isArray(n[5]) ? n[5] : [];
    var createdAt = Array.isArray(meta[8]) ? meta[8] : [];
    var updatedAt = Array.isArray(meta[5]) ? meta[5] : [];
    return {
      id: str(n[2]),
      title: str(n[3]),
      is_owner: num(meta[0]) === 1,
      has_sources: bool(meta[2]),
      source_count: num(meta[6]),
      created_at_seconds: num(createdAt[0]),
      updated_at_seconds: num(updatedAt[0])
    };
  }

  function mapNote(n) {
    var noteData = Array.isArray(n && n[1]) ? n[1] : (Array.isArray(n) ? n : []);
    var versionInfo = Array.isArray(noteData[2]) ? noteData[2] : [];
    var timestamp = Array.isArray(versionInfo[2]) ? versionInfo[2] : [];
    return {
      id: str(noteData[0]),
      content: str(noteData[1]),
      created_at_seconds: num(timestamp[0])
    };
  }

  function mapSource(s) {
    s = Array.isArray(s) ? s : [];
    var meta = Array.isArray(s[2]) ? s[2] : [];
    var typeField = Array.isArray(s[3]) ? s[3] : [];
    var typeNum = num(typeField[1]);
    var idField = Array.isArray(s[0]) ? s[0] : [];
    return {
      id: str(idField[0]),
      title: str(s[1]),
      type: SOURCE_TYPES[typeNum] || ('unknown_' + typeNum),
      word_count: num(meta[8])
    };
  }

  function listNotebooks(data) {
    var notebooks = Array.isArray(data && data[0]) ? data[0] : [];
    return { notebooks: notebooks.map(mapNotebook) };
  }

  function getNotebook(data) {
    var inner = Array.isArray(data && data[0]) ? data[0] : null;
    if (!inner) { return null; }
    return { notebook: mapNotebook(inner) };
  }

  function listSources(data) {
    var project = Array.isArray(data && data[0]) ? data[0] : [];
    var rawSources = Array.isArray(project[1]) ? project[1] : [];
    return { sources: rawSources.map(mapSource) };
  }

  function getNotes(data) {
    var notesList = Array.isArray(data && data[0]) ? data[0] : [];
    var syncToken = Array.isArray(data && data[1]) ? data[1] : [];
    return {
      notes: notesList.map(mapNote).filter(function(note) { return note.created_at_seconds > 0; }),
      sync_token_seconds: num(syncToken[0])
    };
  }

  function getNotebookGuide(data) {
    var inner = Array.isArray(data && data[0]) ? data[0] : [];
    var summaryBlock = Array.isArray(inner[0]) ? inner[0] : [];
    var questionsBlock = Array.isArray(inner[1]) ? inner[1] : [];
    var questionPairs = Array.isArray(questionsBlock[0]) ? questionsBlock[0] : [];
    return {
      summary: str(summaryBlock[0]),
      suggested_questions: questionPairs.map(function(q) {
        q = Array.isArray(q) ? q : [];
        return { question: str(q[0]), prompt: str(q[1]) };
      }),
      guide_id: str(data && data[1])
    };
  }

  function getProjectDetails(data) {
    var collabList = Array.isArray(data && data[0]) ? data[0] : [];
    return {
      collaborators: collabList.map(function(c) {
        c = Array.isArray(c) ? c : [];
        var profile = Array.isArray(c[3]) ? c[3] : [];
        return {
          email: str(c[0]),
          name: str(profile[0]),
          avatar_url: str(profile[1])
        };
      }),
      max_sources: num(data && data[2]),
      is_public: bool(data && data[3])
    };
  }

  function listChatSessions(data) {
    var sessionsList = Array.isArray(data && data[0]) ? data[0] : [];
    return {
      sessions: sessionsList.map(function(s) {
        s = Array.isArray(s) ? s : [];
        return { id: str(s[0]) };
      })
    };
  }

  async function getCurrentUser(args, ctx) {
    var slug = 'notebooklm.get_current_user';
    var boot = await bootstrapAuth(slug, ctx, '/');
    if (boot.error) { return boot.error; }
    var email = str(boot.auth.email);
    return {
      success: true,
      status: 200,
      data: {
        user: {
          user_id: str(boot.auth.userId),
          email: email,
          name: email ? email.split('@')[0] : '',
          avatar_url: ''
        }
      }
    };
  }

  async function navigateToNotebook(args, ctx) {
    var slug = 'notebooklm.navigate_to_notebook';
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'notebooklm-execute-bound-spec-unavailable');
    }
    var path = '/notebook/' + encodeSegment(args && args.notebook_id);
    var res = await ctx.executeBoundSpec(bootstrapSpec(path), ctx.tabId);
    if (resultFailed(res)) { return fallback(slug, 'notebooklm-navigation-url-unavailable'); }
    return {
      success: true,
      status: res.status,
      data: {
        url: ORIGIN + path,
        navigated: false
      }
    };
  }

  function guarded(slug, params, sideEffectClass) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass || 'write',
      params: params,
      async handle() {
        return fallback(slug, 'unverified-' + slug.replace(/\./g, '-') + '-mutation');
      }
    };
  }

  function readHandler(params, fn) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: fn
    };
  }

  function notebookPath(args) {
    return '/notebook/' + encodeSegment(args && args.notebook_id);
  }

  var handlers = {
    'notebooklm.get_current_user': readHandler(EMPTY_PARAMS, getCurrentUser),
    'notebooklm.list_notebooks': readHandler(EMPTY_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.list_notebooks', 'wXbhsf', [null, 1, null, FEATURE_FLAGS.slice()], '/', ctx, listNotebooks);
    }),
    'notebooklm.get_notebook': readHandler(NOTEBOOK_ID_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.get_notebook', 'rLM1Ne',
        [args.notebook_id, null, FEATURE_FLAGS.slice(), null, 0], notebookPath(args), ctx, getNotebook);
    }),
    'notebooklm.get_notebook_guide': readHandler(NOTEBOOK_ID_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.get_notebook_guide', 'VfAZjd',
        [args.notebook_id, FEATURE_FLAGS.slice()], notebookPath(args), ctx, getNotebookGuide);
    }),
    'notebooklm.get_notes': readHandler(NOTEBOOK_ID_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.get_notes', 'cFji9',
        [args.notebook_id, null, null, FEATURE_FLAGS.slice()], notebookPath(args), ctx, getNotes);
    }),
    'notebooklm.get_project_details': readHandler(NOTEBOOK_ID_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.get_project_details', 'JFMDGd',
        [args.notebook_id, FEATURE_FLAGS.slice()], notebookPath(args), ctx, getProjectDetails);
    }),
    'notebooklm.list_chat_sessions': readHandler(LIST_CHAT_SESSIONS_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.list_chat_sessions', 'hPTbtc',
        [[], null, args.notebook_id, args.limit || 20], notebookPath(args), ctx, listChatSessions);
    }),
    'notebooklm.list_sources': readHandler(NOTEBOOK_ID_PARAMS, function(args, ctx) {
      return readRpc('notebooklm.list_sources', 'rLM1Ne',
        [args.notebook_id, null, FEATURE_FLAGS.slice(), null, 0], notebookPath(args), ctx, listSources);
    }),
    'notebooklm.navigate_to_notebook': readHandler(NOTEBOOK_ID_PARAMS, navigateToNotebook),

    'notebooklm.add_source_text': guarded('notebooklm.add_source_text', ADD_SOURCE_TEXT_PARAMS, 'write'),
    'notebooklm.add_source_url': guarded('notebooklm.add_source_url', ADD_SOURCE_URL_PARAMS, 'write'),
    'notebooklm.copy_notebook': guarded('notebooklm.copy_notebook', COPY_NOTEBOOK_PARAMS, 'write'),
    'notebooklm.create_note': guarded('notebooklm.create_note', CREATE_NOTE_PARAMS, 'write'),
    'notebooklm.create_notebook': guarded('notebooklm.create_notebook', CREATE_NOTEBOOK_PARAMS, 'write'),
    'notebooklm.rename_notebook': guarded('notebooklm.rename_notebook', RENAME_NOTEBOOK_PARAMS, 'write'),
    'notebooklm.update_note': guarded('notebooklm.update_note', UPDATE_NOTE_PARAMS, 'write'),
    'notebooklm.delete_notebook': guarded('notebooklm.delete_notebook', DELETE_NOTEBOOK_PARAMS, 'destructive'),
    'notebooklm.delete_notes': guarded('notebooklm.delete_notes', DELETE_NOTES_PARAMS, 'destructive'),
    'notebooklm.delete_sources': guarded('notebooklm.delete_sources', DELETE_SOURCES_PARAMS, 'destructive')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ORIGIN,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerNotebooklm = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

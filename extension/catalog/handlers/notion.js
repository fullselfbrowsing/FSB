(function (global) {
  'use strict';

  /**
   * Phase 29 Plan 03 (v0.9.99 Native Capability Catalog) -- catalog/handlers/notion.js
   *
   * Notion bundled-head handler module (CAT-02, T1a -- the /api/v3 RPC case). Reviewed
   * imperative CODE shipped in the extension bundle. Notion powers its UI with an
   * internal POST-only RPC the closed declarative recipe schema cannot express cleanly
   * (loading a page is a multi-call record-fetch sequence), so it is a handler:
   *   - notion.getSpaces  (read) : list the user's spaces (the head's first slug).
   *   - notion.loadPage   (read) : load a page's cached chunk (multi-call RPC).
   *
   * THE RPC (RESEARCH Head-Service Selection row #4, web-search-verified mechanics):
   * Notion's own internal API is POST /api/v3/<op> (getSpaces, loadCachedPageChunk,
   * ...). The `token_v2` HttpOnly cookie rides the same-origin request automatically
   * (the handler sets NO cookie header -- the browser attaches it). No page-scraped
   * token is needed for these reads (the cookie alone authenticates).
   *
   * THE ORIGIN-PIN (D-09 + D-12, Pitfall 3 credential-replay): every spec targets
   * Notion's OWN first-party origin https://www.notion.so so token_v2 attaches. The
   * handler NEVER injects into a page itself (no browser-extension scripting/tabs
   * APIs); it builds bound spec(s) and calls ctx.executeBoundSpec, which re-pins the
   * active tab before any side effect. No separate-origin API host appears (asserted
   * by the test).
   *
   * [ASSUMED] -- the /api/v3 op PATHS and the request body shapes below are training/
   * inference-derived and MUST be confirmed against a live authenticated www.notion.so
   * tab before the head is trusted (29-03 Task 4, recorded as human_needed live-UAT in
   * 29-HUMAN-UAT.md). The /api/v3 + token_v2 mechanics ARE web-search-verified; the
   * exact request shape is not.
   *
   * GUARDED WRITES (Phase 41, DEPTH-02): 3 fail-closed write slugs were APPENDED --
   * notion.create_page / update_page / create_database_item (each UPGRADES its
   * opentabs__notion__*.json breadth WRITE descriptor dom->T1a). Each ships FAIL-CLOSED
   * (the github.issues.create pattern): handle() returns the dual-field
   * RECIPE_DOM_FALLBACK_PENDING and NEVER calls buildRpcSpec or ctx.executeBoundSpec --
   * NO mutation fires. The real mutating path is a POST /api/v3 submitTransaction RPC
   * whose op + body are [ASSUMED-ENDPOINT]; the writes are inert until 41-HUMAN-UAT.md
   * is satisfied. notion.append_block is sideEffectClass:'read' in its descriptor and
   * stays a READ (NOT a write head).
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js:372-385 --
   * the service worker reads global.FsbHandlerNotion after importScripts and the
   * module self-registers its slugs into FsbCapabilityCatalog at load; Node tests
   * require() the module.exports slug-keyed object. Eval-free, no browser scripting/
   * tabs APIs, no network of its own. NO EMOJIS, ASCII-only source.
   */

  var NOTION_ORIGIN = 'https://www.notion.so';
  var GET_SPACES_PARAMS = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };
  var LOAD_PAGE_PARAMS = {
    type: 'object',
    properties: {
      pageId: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      cursor: { type: 'object' }
    },
    required: ['pageId'],
    additionalProperties: false
  };
  // ---- Phase 40 (DEPTH-01) closed params schemas for the 2 new READ slugs ----
  // From the opentabs__notion__*.json descriptor props. additionalProperties:false.
  var SEARCH_PARAMS = {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    },
    required: ['query'],
    additionalProperties: false
  };
  var GET_DATABASE_PARAMS = {
    type: 'object',
    properties: {
      database_id: { type: 'string', minLength: 1 }
    },
    required: ['database_id'],
    additionalProperties: false
  };

  // ---- Phase 41 (DEPTH-02) GUARDED-WRITE params schemas ---------------------
  // Props mirrored EXACTLY from the opentabs__notion__create_page/update_page/
  // create_database_item.json descriptors (the breadth write descriptors these slugs
  // UPGRADE dom->T1a). The required fields are set; additionalProperties:false
  // everywhere -- the AI cannot smuggle extra fields into a credentialed same-origin
  // RPC. These schemas scaffold the params a single live-capture flips to executable;
  // the handlers below are fail-closed today (they NEVER call buildRpcSpec or
  // ctx.executeBoundSpec). NOTE: notion.append_block is sideEffectClass:'read' in its
  // descriptor -> it is NOT a write head; create_database_item (verified write) is used.
  var CREATE_PAGE_PARAMS = {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      parent_page_id: { type: 'string' },
      icon: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['title'],
    additionalProperties: false
  };
  var UPDATE_PAGE_PARAMS = {
    type: 'object',
    properties: {
      page_id: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      icon: { type: 'string' },
      cover: { type: 'string' }
    },
    required: ['page_id'],
    additionalProperties: false
  };
  var CREATE_DATABASE_ITEM_PARAMS = {
    type: 'object',
    properties: {
      database_id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      properties: {
        type: 'object',
        propertyNames: { type: 'string' },
        additionalProperties: { type: 'string' }
      }
    },
    required: ['database_id', 'title'],
    additionalProperties: false
  };

  // Build a POST /api/v3/<op> RPC spec. The token_v2 cookie rides same-origin; the
  // body is the op's JSON request. [ASSUMED] op path + body shape -- captured in Task 4.
  function buildRpcSpec(op, requestBody) {
    return {
      // [ASSUMED-ENDPOINT: capture live in 29-03 Task 4] -- Notion's same-origin
      // internal RPC op path (e.g. /api/v3/getSpaces).
      url: NOTION_ORIGIN + '/api/v3/' + op,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(requestBody || {}),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: NOTION_ORIGIN,
      extract: '@'
    };
  }

  // ---- Phase 40 (DEPTH-01) typed-error helper + logged-out guard ------------
  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // The logged-out guard (CONTEXT Top Risk, "200-with-logged-out-body"): a
  // logged-out www.notion.so tab can answer an /api/v3 RPC with a 200 carrying a
  // sign-in/redirect body. executeBoundSpec returns { success, data, ... } where
  // `data` is the parsed RPC payload. The RPC reads return a non-null object/array
  // (search -> a results object; a record fetch -> a recordMap object). On a wrong
  // shape (null / primitive), return the dual-field RECIPE_DOM_FALLBACK_PENDING so
  // the breadth DOM path serves; otherwise return the result verbatim.
  function guardRpcShape(result, slug) {
    if (!result || result.success !== true) {
      return result;   // pin / fetch failure -> return verbatim; do NOT mask it.
    }
    var data = result.data;
    var ok = !!data && (typeof data === 'object');   // object or array; not null/primitive
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'notion-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  var handlers = {
    // ---- notion.getSpaces (read) -------------------------------------------
    'notion.getSpaces': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: GET_SPACES_PARAMS,
      async handle(args, ctx) {
        // getSpaces takes an empty body; token_v2 authenticates.
        return await ctx.executeBoundSpec(buildRpcSpec('getSpaces', {}), ctx.tabId);
      }
    },

    // ---- notion.loadPage (read) --------------------------------------------
    // A multi-call record fetch in the real client; the head ships the first call.
    'notion.loadPage': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: LOAD_PAGE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        // [ASSUMED] loadCachedPageChunk request body -- the real shape (pageId,
        // limit, cursor, ...) is captured in Task 4.
        return await ctx.executeBoundSpec(buildRpcSpec('loadCachedPageChunk', {
          pageId: a.pageId,
          limit: a.limit || 30,
          cursor: a.cursor || { stack: [] }
        }), ctx.tabId);
      }
    },

    // ---- Phase 40 (DEPTH-01) -- the 2 opentabs READ slugs ------------------
    // EXACT opentabs dot-form slugs so resolve() UPGRADES each breadth descriptor
    // dom->T1a (distinct from notion.getSpaces/loadPage above -- no collision). Each
    // reuses buildRpcSpec: POST same-origin /api/v3 RPC, the token_v2 HttpOnly cookie
    // rides automatically (no scraped token). A logged-out body is rejected by
    // guardRpcShape. READ-only; notion writes (create/update/delete) are Phase 41.

    // ---- notion.search (read) ----------------------------------------------
    'notion.search': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: SEARCH_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        // [ASSUMED] the /api/v3 search RPC op + body shape (search query + limit) --
        // carried-forward live UAT debt, exactly like notion.getSpaces/loadPage.
        var res = await ctx.executeBoundSpec(buildRpcSpec('search', {
          query: a.query,
          limit: a.limit || 20
        }), ctx.tabId);
        return guardRpcShape(res, 'notion.search');
      }
    },

    // ---- notion.get_database (read) ----------------------------------------
    'notion.get_database': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: GET_DATABASE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        // [ASSUMED] the /api/v3 record-fetch RPC op + body keyed by database_id --
        // carried-forward live UAT debt, exactly like notion.getSpaces/loadPage.
        var res = await ctx.executeBoundSpec(buildRpcSpec('getRecordValues', {
          requests: [{ id: a.database_id, table: 'block' }]
        }), ctx.tabId);
        return guardRpcShape(res, 'notion.get_database');
      }
    },

    // ======================================================================
    // Phase 41 (DEPTH-02) -- the 3 GUARDED WRITE slugs (FAIL-CLOSED).
    // ----------------------------------------------------------------------
    // EXACT opentabs dot-form write slugs so resolve() UPGRADES each breadth
    // descriptor (backing:'dom', sideEffectClass:'write') dom->T1a -- the
    // correctness keystone, distinct from the read slugs above (no collision).
    //
    // EACH SHIPS FAIL-CLOSED, the github.issues.create pattern (github.js:111-123):
    // handle() returns the dual-field RECIPE_DOM_FALLBACK_PENDING (reason
    // unverified-notion-<verb>-mutation, fellBackToDom:true) and NEVER calls
    // buildRpcSpec or ctx.executeBoundSpec -- so NO mutation fires. Behaviorally
    // identical to its T3-DOM descriptor today; the VALUE is the scaffolded
    // params+endpoint+gating a single live-capture flips to executable.
    //
    // [ASSUMED-ENDPOINT] -- Notion mutations are POST /api/v3 submitTransaction RPCs
    // (www.notion.so/api/v3 is the SAME-ORIGIN PATH, notion-api.ts:102; the token_v2
    // HttpOnly cookie authenticates same-origin). The exact submitTransaction op + body
    // shape require a live-captured body; the writes ship FAIL-CLOSED until
    // 41-HUMAN-UAT.md (the notion rows recorded in Plan 04) is satisfied. The handler
    // builds NO spec and reads NO token (it fails closed before any RPC).
    //
    // NOTE: notion.append_block is sideEffectClass:'read' in its descriptor and stays a
    // READ (notion.search/get_database/append_block reads). create_database_item is the
    // genuine WRITE used here to keep 3 verified writes.

    // ---- notion.create_page (write -- fail-closed) -------------------------
    'notion.create_page': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_PAGE_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'notion.create_page',
          reason: 'unverified-notion-create-page-mutation',
          fellBackToDom: true
        });
      }
    },

    // ---- notion.update_page (write -- fail-closed) -------------------------
    'notion.update_page': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: UPDATE_PAGE_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'notion.update_page',
          reason: 'unverified-notion-update-page-mutation',
          fellBackToDom: true
        });
      }
    },

    // ---- notion.create_database_item (write -- fail-closed) ----------------
    'notion.create_database_item': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_DATABASE_ITEM_PARAMS,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: 'notion.create_database_item',
          reason: 'unverified-notion-create-database-item-mutation',
          fellBackToDom: true
        });
      }
    }
  };

  // ---- Self-registration into the catalog (shipped SW path) ----------------
  // IN-03 note: the head registers descriptor.service as the app subdomain
  // 'www.notion.so' (the first-party origin the spec pins), whereas the breadth
  // opentabs__notion__*.json descriptor records the bare registrable domain
  // 'notion.so'. These are intentionally different fields -- resolve() upgrades
  // dom->T1a on the byte-exact SLUG (not the service string), and the origin-pin
  // uses the spec's origin, so the distinction is cosmetic, not a mismatch.
  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: { slug: slug, service: 'www.notion.so', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerNotion = handlers;   // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;          // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

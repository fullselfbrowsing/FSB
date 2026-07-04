(function (global) {
  'use strict';

  /**
   * MiniMax Agent same-origin page-read + guarded mutation head.
   *
   * MiniMax signs API requests through the app's webpack-loaded Axios instance.
   * The executable read below stays behind the bounded MAIN-world page-read
   * primitive so signing remains in the page. POST and mutation-labeled rows are
   * guarded fail-closed until live mutation-body UAT records exact request shapes.
   */

  var ORIGIN = 'https://agent.minimax.io';
  var SERVICE = 'agent.minimax.io';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var NUMBER = { type: 'number' };
  var BOOLEAN = { type: 'boolean' };
  var INTEGER = { type: 'integer', minimum: -INT_LIMIT, maximum: INT_LIMIT };
  var POSITIVE_INTEGER = { type: 'integer', minimum: 1, maximum: INT_LIMIT };
  var PAGE_SIZE = { type: 'integer', minimum: 1, maximum: 50 };
  var STRING_MAP = {
    type: 'object',
    propertyNames: { type: 'string' },
    additionalProperties: { type: 'string' }
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

  var EMPTY_PARAMS = schema({}, []);
  var ADD_MCP_SERVER_PARAMS = schema({
    name: STRING,
    url: STRING,
    env: STRING_MAP,
    args: STRING_MAP
  }, ['name', 'url']);
  var CREATE_CRON_JOB_PARAMS = schema({
    name: STRING,
    prompt: STRING,
    cron_expression: STRING
  }, ['name', 'prompt', 'cron_expression']);
  var CHAT_ID_PARAMS = schema({ chat_id: NUMBER }, ['chat_id']);
  var ID_NUMBER_PARAMS = schema({ id: NUMBER }, ['id']);
  var ID_STRING_PARAMS = schema({ id: STRING }, ['id']);
  var CREDIT_PARAMS = schema({
    page: POSITIVE_INTEGER,
    per_page: PAGE_SIZE
  }, []);
  var LIST_CHATS_PARAMS = schema({
    page_num: POSITIVE_INTEGER,
    page_size: PAGE_SIZE,
    chat_type: INTEGER
  }, []);
  var LIST_CRON_EXECUTIONS_PARAMS = schema({
    job_id: STRING,
    page_num: INTEGER,
    page_size: INTEGER
  }, ['job_id']);
  var LIST_PAGE_PARAMS = schema({
    page_num: POSITIVE_INTEGER,
    page_size: PAGE_SIZE
  }, []);
  var LIST_GALLERY_FEED_PARAMS = schema({
    page_num: POSITIVE_INTEGER,
    page_size: PAGE_SIZE,
    category: STRING,
    sub_category: STRING
  }, []);
  var NEW_SESSION_PARAMS = schema({ chat_type: INTEGER }, []);
  var PIN_EXPERT_PARAMS = schema({
    id: NUMBER,
    is_pinned: BOOLEAN
  }, ['id', 'is_pinned']);
  var RENAME_CHAT_PARAMS = schema({
    chat_id: NUMBER,
    name: STRING
  }, ['chat_id', 'name']);
  var SEARCH_CHATS_PARAMS = schema({ keyword: STRING }, ['keyword']);
  var SEND_MESSAGE_PARAMS = schema({
    chat_id: NUMBER,
    text: STRING,
    chat_type: INTEGER
  }, ['chat_id', 'text']);
  var UPDATE_CRON_JOB_PARAMS = schema({
    id: STRING,
    name: STRING,
    prompt: STRING,
    cron_expression: STRING,
    status: INTEGER
  }, ['id']);
  var VOTE_EXPERT_PARAMS = schema({
    id: NUMBER,
    vote_status: INTEGER
  }, ['id', 'vote_status']);

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
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'minimax-logged-out-or-rot',
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'minimax-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'minimax',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || ('unverified-' + slug.replace(/\./g, '-') + '-mutation'));
      }
    };
  }

  var handlers = {
    'minimax.get_current_user': readHandler('minimax.get_current_user', EMPTY_PARAMS, 'get_current_user'),

    'minimax.add_mcp_server': guarded('minimax.add_mcp_server', 'write', ADD_MCP_SERVER_PARAMS, 'unverified-minimax-add-mcp-server-mutation'),
    'minimax.create_cron_job': guarded('minimax.create_cron_job', 'write', CREATE_CRON_JOB_PARAMS, 'unverified-minimax-create-cron-job-mutation'),
    'minimax.delete_chat': guarded('minimax.delete_chat', 'destructive', CHAT_ID_PARAMS, 'unverified-minimax-delete-chat-mutation'),
    'minimax.delete_expert': guarded('minimax.delete_expert', 'destructive', ID_NUMBER_PARAMS, 'unverified-minimax-delete-expert-mutation'),
    'minimax.execute_cron_job': guarded('minimax.execute_cron_job', 'write', ID_STRING_PARAMS, 'unverified-minimax-execute-cron-job-mutation'),
    'minimax.get_chat_detail': guarded('minimax.get_chat_detail', 'write', CHAT_ID_PARAMS, 'unverified-minimax-get-chat-detail-post-read'),
    'minimax.get_credit_details': guarded('minimax.get_credit_details', 'write', CREDIT_PARAMS, 'unverified-minimax-get-credit-details-post-read'),
    'minimax.get_cron_job': guarded('minimax.get_cron_job', 'write', ID_STRING_PARAMS, 'unverified-minimax-get-cron-job-post-read'),
    'minimax.get_expert': guarded('minimax.get_expert', 'write', ID_NUMBER_PARAMS, 'unverified-minimax-get-expert-post-read'),
    'minimax.get_gallery_detail': guarded('minimax.get_gallery_detail', 'write', ID_NUMBER_PARAMS, 'unverified-minimax-get-gallery-detail-post-read'),
    'minimax.get_membership_info': guarded('minimax.get_membership_info', 'write', EMPTY_PARAMS, 'unverified-minimax-get-membership-info-post-read'),
    'minimax.get_workspace': guarded('minimax.get_workspace', 'write', EMPTY_PARAMS, 'unverified-minimax-get-workspace-post-read'),
    'minimax.list_chats': guarded('minimax.list_chats', 'write', LIST_CHATS_PARAMS, 'unverified-minimax-list-chats-post-read'),
    'minimax.list_cron_executions': guarded('minimax.list_cron_executions', 'write', LIST_CRON_EXECUTIONS_PARAMS, 'unverified-minimax-list-cron-executions-post-read'),
    'minimax.list_cron_jobs': guarded('minimax.list_cron_jobs', 'write', LIST_PAGE_PARAMS, 'unverified-minimax-list-cron-jobs-post-read'),
    'minimax.list_expert_tags': guarded('minimax.list_expert_tags', 'write', EMPTY_PARAMS, 'unverified-minimax-list-expert-tags-post-read'),
    'minimax.list_experts': guarded('minimax.list_experts', 'write', LIST_PAGE_PARAMS, 'unverified-minimax-list-experts-post-read'),
    'minimax.list_gallery_categories': guarded('minimax.list_gallery_categories', 'write', EMPTY_PARAMS, 'unverified-minimax-list-gallery-categories-post-read'),
    'minimax.list_gallery_feed': guarded('minimax.list_gallery_feed', 'write', LIST_GALLERY_FEED_PARAMS, 'unverified-minimax-list-gallery-feed-post-read'),
    'minimax.list_homepage_experts': guarded('minimax.list_homepage_experts', 'write', LIST_PAGE_PARAMS, 'unverified-minimax-list-homepage-experts-post-read'),
    'minimax.list_mcp_servers': guarded('minimax.list_mcp_servers', 'write', EMPTY_PARAMS, 'unverified-minimax-list-mcp-servers-post-read'),
    'minimax.list_workspace_members': guarded('minimax.list_workspace_members', 'write', EMPTY_PARAMS, 'unverified-minimax-list-workspace-members-post-read'),
    'minimax.new_session': guarded('minimax.new_session', 'write', NEW_SESSION_PARAMS, 'unverified-minimax-new-session-mutation'),
    'minimax.pin_expert': guarded('minimax.pin_expert', 'write', PIN_EXPERT_PARAMS, 'unverified-minimax-pin-expert-mutation'),
    'minimax.remove_mcp_server': guarded('minimax.remove_mcp_server', 'destructive', ID_STRING_PARAMS, 'unverified-minimax-remove-mcp-server-mutation'),
    'minimax.rename_chat': guarded('minimax.rename_chat', 'write', RENAME_CHAT_PARAMS, 'unverified-minimax-rename-chat-mutation'),
    'minimax.search_chats': guarded('minimax.search_chats', 'write', SEARCH_CHATS_PARAMS, 'unverified-minimax-search-chats-post-read'),
    'minimax.send_message': guarded('minimax.send_message', 'write', SEND_MESSAGE_PARAMS, 'unverified-minimax-send-message-mutation'),
    'minimax.update_cron_job': guarded('minimax.update_cron_job', 'write', UPDATE_CRON_JOB_PARAMS, 'unverified-minimax-update-cron-job-mutation'),
    'minimax.vote_expert': guarded('minimax.vote_expert', 'write', VOTE_EXPERT_PARAMS, 'unverified-minimax-vote-expert-mutation')
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

  global.FsbHandlerMinimax = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

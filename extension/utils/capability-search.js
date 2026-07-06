(function(global) {
  'use strict';

  /**
   * Phase 28 plan 01 (v0.9.99 Native Capability Catalog) -- capability-search.js
   *
   * The capability-search index layer (SURF-04 / SURF-01). Owns the single
   * MiniSearch instance and the slug -> recipe map. Built from the NEW separate
   * capability-descriptor documents (D-01; the Phase 26 closed recipe schema is
   * byte-untouched). Snapshots the index to chrome.storage.local under
   * 'fsbCapabilityIndex' alongside a catalogVersion stamp and restores it on a
   * service-worker wake when the version matches (D-05) -- never rebuilding on
   * every wake (cold-start + SW-eviction regression).
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js -- the
   * service worker reads global.FsbCapabilitySearch after importScripts; Node
   * tests require() the module.exports. Every vendored global (MiniSearch, chrome,
   * the build-time FsbRecipeIndex catalog) is reached only through a typeof-guarded
   * accessor so the module loads cleanly under the Node test harness (the global
   * may be absent -> degrade, never throw).
   *
   * Locked decisions implemented here (28-CONTEXT.md):
   *   - D-02 sideEffectClass derives from the frozen recipe method (GET/HEAD=read,
   *          POST/PUT/PATCH=mutate, DELETE=destructive), mirroring MUTATING_METHODS
   *          at capability-fetch.js:228; the descriptor's authored sideEffectClass
   *          is cross-checked against the derived value at index-build time.
   *   - D-03 sideEffectClass is surfaced in every search hit.
   *   - D-04 this is the NEW service-worker module; it is on the recipe-path
   *          allowlist and is free of dynamic-code constructs even in comments.
   *   - D-05 toJSON/loadJSON snapshot under 'fsbCapabilityIndex' with catalogVersion.
   *   - D-08 schema-on-hit: every hit carries the matched recipe's params schema.
   *   - D-11 owned-tab origin bias via a per-document boost; the origin is resolved
   *          service-worker-side in the dispatcher and passed IN as an arg (this
   *          module never reads chrome.tabs).
   *
   * LOAD-BEARING (Pitfall 3): MiniSearch.loadJSON(json, options) THROWS
   * 'loadJSON should be given the same options used when serializing the index'
   * unless given the SAME options object used at construction. INDEX_OPTIONS is a
   * single module-level constant passed to BOTH new MiniSearch(INDEX_OPTIONS) and
   * MiniSearch.loadJSON(json, INDEX_OPTIONS), and is EXPORTED so the eval test
   * reuses it (no options drift). toJSON() returns an object; loadJSON wants a JSON
   * string -> JSON.stringify the snapshot before restoring.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- The load-bearing construction options (reused verbatim at loadJSON) ----
  var INDEX_OPTIONS = {
    idField: 'slug',
    fields: ['intentSynonyms', 'description', 'service', 'actionVerb'], // searchable
    // returned on hit. `backing` (BRDTH-03) is the canonical seam enum
    // (recipe/handler/learn/dom) search() annotates invocable-vs-discovery-pending by.
    storeFields: ['slug', 'service', 'sideEffectClass', 'description', 'backing']
  };

  var STORAGE_KEY = 'fsbCapabilityIndex';
  var ORIGIN_BOOST = 4; // Claude's Discretion -- tuned via the eval harness

  // ---- typeof-guarded vendored-global accessors -----------------------------
  function _getMiniSearch() {
    return (typeof MiniSearch !== 'undefined' && MiniSearch) ? MiniSearch : null; // UMD global (background.js:120)
  }
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
  // The catalog source is the build-time generated dual-export IIFE (D-16). Absent
  // under the Node test harness -> degrade to an empty catalog.
  function _getCatalog() {
    return (typeof FsbRecipeIndex !== 'undefined' && FsbRecipeIndex)
      ? FsbRecipeIndex
      : { recipes: [], descriptors: [] };
  }

  var _ms = null;              // MiniSearch instance
  var _slugToRecipe = {};      // slug -> recipe (invoke lookup + schema-on-hit params)
  var _slugToDescriptor = {};  // slug -> descriptor (handler schema-on-hit params)

  // ---- Learned-recipe snapshot bookkeeping (LEARN-03 / D-14) ----------------
  // The descriptors fed by addLearnedRecipe AFTER the base build, plus a strictly
  // monotonic learned-add counter. The counter is appended (as '+learnedN') to the
  // re-snapshot's catalogVersion so the stored value differs from the prior snapshot
  // even on a re-promotion that adds no new slug. CRITICAL (HI-01 fix): the suffix is
  // appended to the BASE-catalog version (computed over cat.descriptors only), so on
  // restart buildOrRestore can compare the base PREFIX and re-attach the persisted
  // index (which already carries the learned docs) -- the learned slugs survive the
  // SW restart. After such a restore _learnedAddSeq is re-seeded from the stored
  // suffix (see _reseedLearnedFromSnapshot) to stay monotonic across the restart.
  var _learnedDescriptors = [];
  var _learnedAddSeq = 0;

  // ---- D-02: derive sideEffectClass from the recipe method -------------------
  function deriveSideEffect(method) {
    var m = String(method || '').toUpperCase();
    if (m === 'DELETE') return 'destructive';
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'mutate';
    return 'read'; // GET / HEAD / unknown
  }

  function normalizeSideEffectClass(value) {
    var c = String(value || '').toLowerCase();
    if (c === 'destructive' || c === 'delete') { return 'destructive'; }
    if (c === 'mutate' || c === 'mutating' || c === 'write' || c === 'writes') { return 'mutate'; }
    return 'read';
  }

  // ---- BRDTH-03 / Phase 44: readiness status + invocable annotation ----------
  // The CANONICAL backing field value is one of recipe/handler/learn/dom (the value
  // resolve() in capability-catalog.js routes to a seam tier; 'learn' -> T2, 'dom'
  // -> T3). A descriptor with no backing defaults to 'dom' (the safe DOM-fallback
  // seam, matching the resolve() else-branch). readinessStatus/backingStatus are
  // DISPLAY LABELS only -- never the field value -> no resolve() change.
  //
  // Phase 44 adds a narrow status override for the current T1 handler slugs whose
  // descriptors still carry backing:'dom' from the breadth import. This keeps
  // search_capabilities honest without changing invoke routing: proven handler/recipe
  // slugs display t1-ready, known guarded writes display t1-guarded-fail-closed, and
  // the rest of the catalog tail remains learn-pending or discovery-pending. Denied
  // app slices that remain searchable for catalog completeness are explicitly labeled
  // blocked so they are not mistaken for ordinary discovery work.
  var BLOCKED_SERVICE_HOSTS = {
    'netflix.com': true,
    'www.netflix.com': true,
    'onlyfans.com': true,
    'www.onlyfans.com': true
  };

  var T1_READY_SLUGS = {
    'github.issues.list': true,
    'github.notifications': true,
    'reddit.inbox': true,
    'notion.loadPage': true,
    'notion.getSpaces': true,
    'notion.get_database': true,
    'notion.search': true,
    'notion.create_page': true,
    'notion.update_page': true,
    'notion.create_database': true,
    'notion.create_database_item': true,
    'gitlab.list_projects': true,
    'gitlab.get_project': true,
    'gitlab.list_issues': true,
    'gitlab.get_issue': true,
    'gitlab.list_merge_requests': true,
    'netlify.list_sites': true,
    'netlify.get_site': true,
    'netlify.list_deploys': true,
    'netlify.list_forms': true,
    'bitbucket.list_workspaces': true,
    'bitbucket.list_repositories': true,
    'bitbucket.get_repository': true,
    'circleci.get_current_user': true,
    'circleci.list_pipelines': true,
    'circleci.get_project': true,
    'circleci.get_pipeline': true,
    'circleci.get_pipeline_workflows': true,
    'circleci.get_workflow': true,
    'circleci.get_workflow_jobs': true,
    'circleci.get_job': true,
    'circleci.get_job_artifacts': true,
    'circleci.get_job_tests': true,
    'vercel.get_user': true,
    'vercel.list_teams': true,
    'vercel.list_projects': true,
    'vercel.get_project': true,
    'vercel.list_deployments': true,
    'vercel.get_deployment': true,
    'vercel.list_domains': true,
    'slack.conversations.list': true,
    'slack.chat.postMessage': true,
    'slack.list_channels': true,
    'slack.list_members': true,
    'slack.get_channel_info': true,
    'doordash.get_current_user': true,
    'doordash.get_notifications': true,
    'doordash.get_order': true,
    'doordash.list_addresses': true,
    'doordash.list_orders': true,
    'doordash.list_payment_methods': true,
    'ubereats.list_restaurants': true,
    'ubereats.get_menu': true,
    'ubereats.list_orders': true,
    'uber.get_current_user': true,
    'uber.search_locations': true,
    'uber.get_travel_status': true,
    'uber.get_membership': true,
    'uber.get_past_activities': true,
    'uber.get_enabled_products': true,
    'uber.get_upcoming_activities': true,
    'uber.get_product_suggestions': true,
    'airbnb.get_current_user': true,
    'airbnb.get_header_info': true,
    'airbnb.get_inbox_filters': true,
    'airbnb.get_listing_from_page': true,
    'airbnb.get_map_viewport_info': true,
    'airbnb.get_message_thread': true,
    'airbnb.get_search_results': true,
    'airbnb.get_user_thumbnail': true,
    'airbnb.get_wishlist_items': true,
    'airbnb.is_host': true,
    'airbnb.list_message_threads': true,
    'airbnb.list_wishlists': true,
    'airbnb.search_suggestions': true,
    'airtable.get_base_schema': true,
    'airtable.get_field_choices': true,
    'airtable.get_record': true,
    'airtable.get_record_activity': true,
    'airtable.list_records': true,
    'airtable.list_workspaces': true,
    'amazon.get_product': true,
    'amazon.list_orders': true,
    'amazon.search_products': true,
    'amazon.track_order': true,
    'amplitude.get_color_palettes': true,
    'amplitude.get_current_user': true,
    'amplitude.get_entitlements': true,
    'amplitude.get_event_volumes': true,
    'amplitude.get_mtu_volumes': true,
    'amplitude.get_org_data': true,
    'amplitude.get_personal_space': true,
    'amplitude.get_report_quota': true,
    'amplitude.get_session_replay_volumes': true,
    'amplitude.list_events': true,
    'amplitude.list_orgs': true,
    'amplitude.list_spaces': true,
    'amplitude.list_users': true,
    'amplitude.search_content': true,
    'asana.get_current_user': true,
    'asana.get_project': true,
    'asana.get_stories_for_task': true,
    'asana.get_subtasks': true,
    'asana.get_task': true,
    'asana.get_tasks_for_project': true,
    'asana.get_tasks_for_section': true,
    'asana.get_user': true,
    'asana.list_projects': true,
    'asana.list_sections': true,
    'asana.list_tags': true,
    'asana.list_teams': true,
    'asana.list_users_for_workspace': true,
    'asana.list_workspaces': true,
    'asana.search_tasks': true,
    'aws.describe_instance': true,
    'aws.get_current_user': true,
    'aws.get_function': true,
    'aws.list_alarms': true,
    'aws.list_functions': true,
    'aws.list_iam_roles': true,
    'aws.list_iam_users': true,
    'aws.list_instances': true,
    'aws.list_log_groups': true,
    'aws.list_regions': true,
    'aws.list_security_groups': true,
    'aws.list_subnets': true,
    'aws.list_vpcs': true,
    'azure.get_current_user': true,
    'azure.get_deployment': true,
    'azure.get_policy_assignment': true,
    'azure.get_resource': true,
    'azure.get_resource_group': true,
    'azure.get_subscription': true,
    'azure.list_activity_logs': true,
    'azure.list_deployments': true,
    'azure.list_locations': true,
    'azure.list_locks': true,
    'azure.list_policy_assignments': true,
    'azure.list_resource_groups': true,
    'azure.list_resource_providers': true,
    'azure.list_resources': true,
    'azure.list_role_assignments': true,
    'azure.list_subscription_locations': true,
    'azure.list_subscriptions': true,
    'azure.list_tags': true,
    'azure.list_tenants': true,
    'bitbucket.get_commit': true,
    'bitbucket.get_file_content': true,
    'bitbucket.get_pipeline': true,
    'bitbucket.get_pull_request': true,
    'bitbucket.get_pull_request_diff': true,
    'bitbucket.get_user_profile': true,
    'bitbucket.list_branches': true,
    'bitbucket.list_commits': true,
    'bitbucket.list_pipeline_steps': true,
    'bitbucket.list_pipelines': true,
    'bitbucket.list_pr_comments': true,
    'bitbucket.list_pull_requests': true,
    'bitbucket.list_tags': true,
    'bitbucket.list_workspace_members': true,
    'bitbucket.search_code': true,
    'booking.get_property': true,
    'booking.get_property_reviews': true,
    'booking.navigate_to_property': true,
    'booking.navigate_to_search': true,
    'booking.search_destinations': true,
    'booking.search_properties': true,
    'bsky.get_author_feed': true,
    'bsky.get_feed': true,
    'bsky.get_followers': true,
    'bsky.get_follows': true,
    'bsky.get_list_feed': true,
    'bsky.get_post_thread': true,
    'bsky.get_posts': true,
    'bsky.get_user_profile': true,
    'bsky.get_user_profiles': true,
    'bsky.search_posts': true,
    'bsky.search_users': true,
    'bsky.search_users_typeahead': true,
    'calendly.get_current_user': true,
    'calendly.get_event_type': true,
    'calendly.get_organization': true,
    'calendly.get_organization_statistics': true,
    'calendly.get_user_busy_times': true,
    'calendly.get_user_permissions': true,
    'calendly.list_calendar_accounts': true,
    'calendly.list_event_types': true,
    'calendly.list_scheduled_events': true,
    'carta.check_favourite': true,
    'carta.get_company_profile': true,
    'carta.get_current_user': true,
    'carta.get_entities': true,
    'carta.get_holdings_dashboard': true,
    'carta.get_inbox_count': true,
    'carta.get_qsbs_eligibility': true,
    'carta.get_tasks': true,
    'carta.get_tax_documents': true,
    'carta.get_witness_signatures': true,
    'carta.list_accounts': true,
    'carta.list_companies': true,
    'carta.list_convertibles': true,
    'carta.list_equity_grants': true,
    'carta.list_options': true,
    'carta.list_pius': true,
    'carta.list_rsus': true,
    'carta.list_sars': true,
    'carta.list_shares': true,
    'carta.list_warrants': true,
    'chatgpt.discover_gpts': true,
    'chatgpt.get_account_info': true,
    'chatgpt.get_beta_features': true,
    'chatgpt.get_conversation': true,
    'chatgpt.get_current_user': true,
    'chatgpt.get_custom_instructions': true,
    'chatgpt.get_gpt': true,
    'chatgpt.get_memories': true,
    'chatgpt.get_prompt_library': true,
    'chatgpt.list_conversations': true,
    'chatgpt.list_models': true,
    'chatgpt.list_shared_conversations': true,
    'chatgpt.search_conversations': true,
    'chipotle.get_menu': true,
    'chipotle.get_ordering_status': true,
    'chipotle.get_preconfigured_meals': true,
    'chipotle.get_restaurant': true,
    'circleci.get_context': true,
    'circleci.get_flaky_tests': true,
    'circleci.get_pipeline_config': true,
    'circleci.get_project_workflow_metrics': true,
    'circleci.get_workflow_job_metrics': true,
    'circleci.get_workflow_runs': true,
    'circleci.list_context_env_vars': true,
    'circleci.list_contexts': true,
    'circleci.list_env_vars': true,
    'circleci.list_schedules': true,
    'claude.get_conversation': true,
    'claude.get_current_user': true,
    'claude.get_project': true,
    'claude.list_conversations': true,
    'claude.list_models': true,
    'claude.list_organizations': true,
    'claude.list_projects': true,
    'clickhouse.get_organization': true,
    'clickhouse.get_private_endpoint_config': true,
    'clickhouse.get_scaling_limits': true,
    'clickhouse.get_service': true,
    'clickhouse.get_status': true,
    'clickhouse.list_backups': true,
    'clickhouse.list_organization_members': true,
    'clickhouse.list_services': true,
    'clickhouse.query_metrics': true,
    'clickup.get_current_user': true,
    'clickup.get_custom_fields': true,
    'clickup.get_folder': true,
    'clickup.get_folders': true,
    'clickup.get_goals': true,
    'clickup.get_list': true,
    'clickup.get_lists': true,
    'clickup.get_space': true,
    'clickup.get_spaces': true,
    'clickup.get_workspace': true,
    'clickup.get_workspace_members': true,
    'cloudflare.get_ruleset': true,
    'cloudflare.get_user': true,
    'cloudflare.get_zone': true,
    'cloudflare.get_zone_settings': true,
    'cloudflare.graphql_query': true,
    'cloudflare.list_ai_models': true,
    'cloudflare.list_alerting_policies': true,
    'cloudflare.list_d1_databases': true,
    'cloudflare.list_dns_records': true,
    'cloudflare.list_email_addresses': true,
    'cloudflare.list_email_routing_rules': true,
    'cloudflare.list_firewall_rules': true,
    'cloudflare.list_kv_namespaces': true,
    'cloudflare.list_page_rules': true,
    'cloudflare.list_pages_projects': true,
    'cloudflare.list_queues': true,
    'cloudflare.list_rules_lists': true,
    'cloudflare.list_rulesets': true,
    'cloudflare.list_ssl_certificates': true,
    'cloudflare.list_tunnels': true,
    'cloudflare.list_vectorize_indexes': true,
    'cloudflare.list_waiting_rooms': true,
    'cloudflare.list_worker_routes': true,
    'cloudflare.list_workers': true,
    'cloudflare.list_zones': true,
    'cockroachdb.get_cluster': true,
    'cockroachdb.get_cluster_usage': true,
    'cockroachdb.get_credit_trial_status': true,
    'cockroachdb.get_networking_config': true,
    'cockroachdb.get_organization': true,
    'cockroachdb.get_resource_count': true,
    'cockroachdb.get_user_profile': true,
    'cockroachdb.list_cluster_nodes': true,
    'cockroachdb.list_clusters': true,
    'cockroachdb.list_database_names': true,
    'cockroachdb.list_database_users': true,
    'cockroachdb.list_invoices': true,
    'cockroachdb.list_org_users': true,
    'coinbase.compare_asset_prices': true,
    'coinbase.get_asset_by_slug': true,
    'coinbase.get_asset_by_symbol': true,
    'coinbase.get_asset_by_uuid': true,
    'coinbase.get_asset_categories': true,
    'coinbase.get_asset_networks': true,
    'coinbase.get_asset_price': true,
    'coinbase.get_current_user': true,
    'coinbase.list_portfolios': true,
    'coinbase.list_price_alerts': true,
    'coinbase.list_watchlists': true,
    'confluence.get_page': true,
    'confluence.get_page_children': true,
    'confluence.get_space': true,
    'confluence.get_user_profile': true,
    'confluence.list_comment_replies': true,
    'confluence.list_comments': true,
    'confluence.list_inline_comments': true,
    'confluence.list_labels': true,
    'confluence.list_page_attachments': true,
    'confluence.list_page_versions': true,
    'confluence.list_pages': true,
    'confluence.list_spaces': true,
    'confluence.search': true,
    'costco.get_product': true,
    'costco.get_product_availability': true,
    'costco.get_products': true,
    'craigslist.get_chat_messages': true,
    'craigslist.get_current_user': true,
    'craigslist.get_saved_search_counts': true,
    'craigslist.list_chat_conversations': true,
    'craigslist.list_payment_cards': true,
    'craigslist.list_renewable_postings': true,
    'datadog.get_current_user': true,
    'datadog.get_dashboard': true,
    'datadog.get_downtime': true,
    'datadog.get_host_info': true,
    'datadog.get_host_totals': true,
    'datadog.get_incident': true,
    'datadog.get_metric_metadata': true,
    'datadog.get_monitor': true,
    'datadog.get_monitor_groups': true,
    'datadog.get_notebook': true,
    'datadog.get_org_config': true,
    'datadog.get_permissions': true,
    'datadog.get_service_definition': true,
    'datadog.get_service_dependencies': true,
    'datadog.get_slo': true,
    'datadog.get_slo_history': true,
    'datadog.get_synthetics_results': true,
    'datadog.get_synthetics_test': true,
    'datadog.get_trace': true,
    'datadog.get_usage_summary': true,
    'datadog.get_user': true,
    'datadog.list_api_keys': true,
    'datadog.list_dashboards': true,
    'datadog.list_downtimes': true,
    'datadog.list_host_tags': true,
    'datadog.list_hosts': true,
    'datadog.list_incidents': true,
    'datadog.list_metric_tags': true,
    'datadog.list_metrics': true,
    'datadog.list_monitor_downtimes': true,
    'datadog.list_monitor_tags': true,
    'datadog.list_monitors': true,
    'datadog.list_notebooks': true,
    'datadog.list_services': true,
    'datadog.list_slo_corrections': true,
    'datadog.list_slos': true,
    'datadog.list_synthetics_tests': true,
    'datadog.list_teams': true,
    'datadog.list_users': true,
    'datadog.query_metrics': true,
    'datadog.search_dashboards': true,
    'datadog.search_dashboards_advanced': true,
    'datadog.search_monitors': true,
    'datadog.search_notebooks': true,
    'datadog.search_services': true,
    'datadog.search_slos': true,
    'discord.get_channel_info': true,
    'discord.get_guild_info': true,
    'discord.get_message': true,
    'discord.get_user_profile': true,
    'discord.list_channels': true,
    'discord.list_dms': true,
    'discord.list_guilds': true,
    'discord.list_members': true,
    'discord.list_pinned_messages': true,
    'discord.list_roles': true,
    'discord.read_messages': true,
    'discord.read_thread': true,
    'discord.search_messages': true,
    'dockerhub.get_current_user': true,
    'dockerhub.get_repository': true,
    'dockerhub.get_tag': true,
    'dockerhub.get_user_profile': true,
    'dockerhub.list_organizations': true,
    'dockerhub.list_repositories': true,
    'dockerhub.list_tags': true,
    'dockerhub.search_catalog': true,
    'dockerhub.search_repositories': true,
    'dominos.find_stores_by_address': true,
    'dominos.get_category_products': true,
    'dominos.get_deal': true,
    'dominos.get_menu_categories': true,
    'dominos.get_product': true,
    'dominos.search_address': true,
    'ebay.get_current_user': true,
    'ebay.get_deals': true,
    'ebay.get_item': true,
    'ebay.get_seller_profile': true,
    'ebay.get_watchlist': true,
    'ebay.search_items': true,
    'ebay.search_suggestions': true,
    'etsy.get_listing': true,
    'etsy.list_orders': true,
    'etsy.search_listings': true,
    'fiverr.draft_message': true,
    'fiverr.get_conversation': true,
    'fiverr.get_current_page_context': true,
    'fiverr.get_gig_details': true,
    'fiverr.get_seller_profile': true,
    'fiverr.list_conversations': true,
    'fiverr.search_gigs': true,
    'eventbrite.get_event': true,
    'eventbrite.list_orders': true,
    'eventbrite.search_events': true,
    'excel.get_current_user': true,
    'excel.get_range': true,
    'excel.get_table_columns': true,
    'excel.get_table_rows': true,
    'excel.get_used_range': true,
    'excel.get_workbook_info': true,
    'excel.list_charts': true,
    'excel.list_named_items': true,
    'excel.list_tables': true,
    'excel.list_worksheets': true,
    'expedia.navigate_to_hotel': true,
    'expedia.search_activities': true,
    'expedia.search_car_rentals': true,
    'expedia.search_cruises': true,
    'expedia.search_flights': true,
    'expedia.search_packages': true,
    'facebook.get_current_user': true,
    'facebook.search_marketplace': true,
    'fidelity.get_advisor_info': true,
    'fidelity.get_balance_history': true,
    'fidelity.get_contribution_data': true,
    'fidelity.get_customer_orders': true,
    'fidelity.get_investment_news': true,
    'fidelity.get_market_movers': true,
    'fidelity.get_portfolio_events': true,
    'fidelity.get_portfolio_summary': true,
    'fidelity.get_positions': true,
    'fidelity.get_quotes': true,
    'fidelity.get_service_messages': true,
    'fidelity.get_top_news': true,
    'fidelity.list_accounts': true,
    'figma.get_current_user': true,
    'figma.get_file': true,
    'figma.get_file_components': true,
    'figma.get_team_info': true,
    'figma.list_comments': true,
    'figma.list_file_versions': true,
    'figma.list_files': true,
    'figma.list_recent_files': true,
    'figma.list_team_projects': true,
    'figma.list_teams': true,
    'glama.get_chat_session': true,
    'glama.get_current_user': true,
    'glama.get_server': true,
    'glama.get_server_score': true,
    'glama.list_available_models': true,
    'glama.list_gateway_models': true,
    'glama.list_mcp_clients': true,
    'glama.list_popular_servers': true,
    'glama.list_projects': true,
    'glama.list_recent_chats': true,
    'glama.list_server_categories': true,
    'glama.list_server_tools': true,
    'glama.list_servers_by_category': true,
    'glama.search_servers': true,
    'glama.search_tools': true,
    'ganalytics.check_compatibility': true,
    'ganalytics.get_active_property': true,
    'ganalytics.get_current_user': true,
    'ganalytics.get_metadata': true,
    'ganalytics.list_accounts': true,
    'ganalytics.run_batch_report': true,
    'ganalytics.run_realtime_report': true,
    'ganalytics.run_report': true,
    'gcal.get_calendar': true,
    'gcal.get_colors': true,
    'gcal.get_event': true,
    'gcal.get_setting': true,
    'gcal.list_calendars': true,
    'gcal.list_event_instances': true,
    'gcal.list_events': true,
    'gcal.list_settings': true,
    'gcal.search_events': true,
    'gcloud.get_billing_info': true,
    'gcloud.get_bucket': true,
    'gcloud.get_cloud_run_service': true,
    'gcloud.get_cluster': true,
    'gcloud.get_current_project': true,
    'gcloud.get_function': true,
    'gcloud.get_instance': true,
    'gcloud.get_project': true,
    'gcloud.get_sql_instance': true,
    'gcloud.list_billing_accounts': true,
    'gcloud.list_buckets': true,
    'gcloud.list_cloud_run_services': true,
    'gcloud.list_clusters': true,
    'gcloud.list_disks': true,
    'gcloud.list_enabled_services': true,
    'gcloud.list_firewalls': true,
    'gcloud.list_functions': true,
    'gcloud.list_iam_roles': true,
    'gcloud.list_instances': true,
    'gcloud.list_networks': true,
    'gcloud.list_objects': true,
    'gcloud.list_projects': true,
    'gcloud.list_service_accounts': true,
    'gcloud.list_sql_instances': true,
    'gmaps.get_current_view': true,
    'gmaps.get_directions_info': true,
    'gmaps.get_directions_url': true,
    'gmaps.get_map_url': true,
    'gmaps.get_place_details': true,
    'gmaps.get_place_url': true,
    'gmaps.navigate_to_directions': true,
    'gmaps.navigate_to_location': true,
    'gmaps.navigate_to_place': true,
    'gmaps.navigate_to_search': true,
    'gmaps.search_nearby': true,
    'gmaps.search_places': true,
    'gmaps.share_location': true,
    'gmaps.toggle_layer': true,
    'gmaps.zoom_map': true,
    'gdocs.get_current_document': true,
    'gdocs.get_current_user': true,
    'gdocs.get_document': true,
    'gdocs.get_document_text': true,
    'gdocs.list_comments': true,
    'gdocs.list_recent_documents': true,
    'gdocs.search_documents': true,
    'gdrive.get_current_user': true,
    'gdrive.get_file': true,
    'gdrive.get_storage_quota': true,
    'gdrive.list_files': true,
    'gdrive.list_permissions': true,
    'gdrive.search_files': true,
    'gemini.get_conversation': true,
    'gemini.get_current_user': true,
    'gemini.list_conversations': true,
    'gemini.list_models': true,
    'gitlab.get_file_content': true,
    'gitlab.get_job_log': true,
    'gitlab.get_merge_request': true,
    'gitlab.get_merge_request_diff': true,
    'gitlab.get_user_profile': true,
    'gitlab.list_branches': true,
    'gitlab.list_commits': true,
    'gitlab.list_notes': true,
    'gitlab.list_pipeline_jobs': true,
    'gitlab.list_pipelines': true,
    'gitlab.search_projects': true,
    'grafana.get_dashboard': true,
    'grafana.list_dashboards': true,
    'grafana.query_metrics': true,
    'grubhub.get_restaurant': true,
    'grubhub.list_orders': true,
    'grubhub.list_restaurants': true,
    'hack2hire.get_comment': true,
    'hack2hire.get_company_question_stats': true,
    'hack2hire.get_completed_question_count': true,
    'hack2hire.get_current_user': true,
    'hack2hire.get_question': true,
    'hack2hire.get_question_neighbors': true,
    'hack2hire.get_subscription': true,
    'hack2hire.list_comment_replies': true,
    'hack2hire.list_companies': true,
    'hack2hire.list_my_bookmarks': true,
    'hack2hire.list_my_visits': true,
    'hack2hire.list_question_coding_problems': true,
    'hack2hire.list_question_comments': true,
    'hack2hire.list_questions': true,
    'hackernews.get_item': true,
    'hackernews.get_story_comments': true,
    'hackernews.get_user': true,
    'hackernews.list_ask_stories': true,
    'hackernews.list_best_stories': true,
    'hackernews.list_job_stories': true,
    'hackernews.list_new_stories': true,
    'hackernews.list_show_stories': true,
    'hackernews.list_top_stories': true,
    'homedepot.get_cart': true,
    'homedepot.get_product': true,
    'homedepot.get_saved_items': true,
    'homedepot.get_store_context': true,
    'homedepot.search_products': true,
    'homedepot.search_stores': true,
    'instacart.get_cart': true,
    'instacart.get_current_user': true,
    'instacart.get_order': true,
    'instacart.list_active_carts': true,
    'instacart.list_addresses': true,
    'instacart.list_orders': true,
    'instagram.get_post': true,
    'instagram.get_user_profile': true,
    'instagram.search': true,
    'instagram.search_hashtags': true,
    'instagram.search_users': true,
    'jira.get_issue': true,
    'jira.get_myself': true,
    'jira.get_project': true,
    'jira.get_transitions': true,
    'jira.list_boards': true,
    'jira.list_comments': true,
    'jira.list_issue_types': true,
    'jira.list_priorities': true,
    'jira.list_projects': true,
    'jira.list_sprints': true,
    'jira.search_issues': true,
    'jira.search_users': true,
    'kayak.get_price_alert': true,
    'kayak.search_flights': true,
    'kayak.search_hotels': true,
    'leetcode.get_code_snippets': true,
    'leetcode.get_contest_history': true,
    'leetcode.get_contest_ranking': true,
    'leetcode.get_current_user': true,
    'leetcode.get_daily_challenge': true,
    'leetcode.get_problem': true,
    'leetcode.get_problem_hints': true,
    'leetcode.get_problem_solution': true,
    'leetcode.get_problem_stats': true,
    'leetcode.get_similar_problems': true,
    'leetcode.get_submission': true,
    'leetcode.get_user_badges': true,
    'leetcode.get_user_calendar': true,
    'leetcode.get_user_language_stats': true,
    'leetcode.get_user_profile': true,
    'leetcode.get_user_progress': true,
    'leetcode.get_user_skill_stats': true,
    'leetcode.get_user_submit_stats': true,
    'leetcode.list_discussions': true,
    'leetcode.list_favorites': true,
    'leetcode.list_problems': true,
    'leetcode.list_recent_submissions': true,
    'leetcode.list_submissions': true,
    'leetcode.list_topic_tags': true,
    'linear.get_attachment': true,
    'linear.get_cycle': true,
    'linear.get_document': true,
    'linear.get_initiative': true,
    'linear.get_issue': true,
    'linear.get_milestone': true,
    'linear.get_project': true,
    'linear.get_team': true,
    'linear.get_user': true,
    'linear.get_viewer': true,
    'linear.list_attachments': true,
    'linear.list_comments': true,
    'linear.list_cycles': true,
    'linear.list_documents': true,
    'linear.list_initiatives': true,
    'linear.list_issue_history': true,
    'linear.list_issue_relations': true,
    'linear.list_labels': true,
    'linear.list_milestones': true,
    'linear.list_project_labels': true,
    'linear.list_project_updates': true,
    'linear.list_projects': true,
    'linear.list_sub_issues': true,
    'linear.list_team_members': true,
    'linear.list_teams': true,
    'linear.list_users': true,
    'linear.list_workflow_states': true,
    'linear.search_issues': true,
    'linkedin.get_conversation_messages': true,
    'linkedin.get_current_user': true,
    'linkedin.get_mailbox_counts': true,
    'linkedin.get_user_profile': true,
    'linkedin.list_conversations': true,
    'lucid.get_account': true,
    'lucid.get_current_user': true,
    'lucid.get_document': true,
    'lucid.get_document_count': true,
    'lucid.get_document_pages': true,
    'lucid.get_document_role': true,
    'lucid.get_document_status': true,
    'lucid.get_folder_entry': true,
    'lucid.get_user_permissions': true,
    'lucid.list_account_users': true,
    'lucid.list_documents': true,
    'lucid.list_folder_entries': true,
    'lucid.list_groups': true,
    'lucid.search_documents': true,
    'lyft.get_ride_estimate': true,
    'lyft.list_ride_types': true,
    'lyft.list_rides': true,
    'mastodon.get_status': true,
    'mastodon.list_timeline': true,
    'medium.get_collection': true,
    'medium.get_current_user': true,
    'medium.get_notification_count': true,
    'medium.get_post': true,
    'medium.get_post_responses': true,
    'medium.get_reading_list': true,
    'medium.get_recommended_publishers': true,
    'medium.get_tag_feed': true,
    'medium.get_user_profile': true,
    'medium.list_followers': true,
    'medium.list_following': true,
    'medium.list_recommended_tags': true,
    'medium.search_collections': true,
    'medium.search_posts': true,
    'medium.search_tags': true,
    'meticulous.get_current_user': true,
    'meticulous.get_project': true,
    'meticulous.get_project_pull_request': true,
    'meticulous.get_replay': true,
    'meticulous.get_replay_screenshots': true,
    'meticulous.get_session': true,
    'meticulous.get_session_events': true,
    'meticulous.get_test_run': true,
    'meticulous.get_test_run_coverage': true,
    'meticulous.get_test_run_diffs': true,
    'meticulous.get_test_run_pr_description': true,
    'meticulous.get_test_run_screenshots': true,
    'meticulous.get_test_run_source_code': true,
    'meticulous.get_test_run_test_cases': true,
    'meticulous.list_github_repositories': true,
    'meticulous.list_organization_members': true,
    'meticulous.list_organizations': true,
    'meticulous.list_projects': true,
    'meticulous.list_replays': true,
    'meticulous.list_sessions': true,
    'meticulous.search_sessions': true,
    'minimax.get_current_user': true,
    'mongodb.get_billing_plan': true,
    'mongodb.get_cluster': true,
    'mongodb.get_current_user': true,
    'mongodb.get_deployment_status': true,
    'mongodb.get_organization': true,
    'mongodb.get_project': true,
    'mongodb.get_user_security': true,
    'mongodb.list_alert_configs': true,
    'mongodb.list_alerts': true,
    'mongodb.list_clusters': true,
    'mongodb.list_database_users': true,
    'mongodb.list_ip_access_list': true,
    'mongodb.list_network_peering': true,
    'mongodb.list_organization_members': true,
    'mongodb.list_organization_projects': true,
    'mongodb.list_organization_teams': true,
    'msword.get_active_document': true,
    'msword.get_current_user': true,
    'msword.get_document_text': true,
    'msword.get_drive': true,
    'msword.get_file_content': true,
    'msword.get_item': true,
    'msword.list_children': true,
    'msword.list_permissions': true,
    'msword.list_recent_documents': true,
    'msword.list_shared_with_me': true,
    'msword.list_versions': true,
    'msword.search_files': true,
    'netlify.get_account': true,
    'netlify.get_deploy': true,
    'netlify.get_dns_zone': true,
    'netlify.get_env_var': true,
    'netlify.get_member': true,
    'netlify.list_accounts': true,
    'netlify.list_audit_events': true,
    'netlify.list_build_hooks': true,
    'netlify.list_builds': true,
    'netlify.list_deploy_keys': true,
    'netlify.list_dns_records': true,
    'netlify.list_dns_zones': true,
    'netlify.list_env_vars': true,
    'netlify.list_form_submissions': true,
    'netlify.list_hooks': true,
    'netlify.list_members': true,
    'newrelic.get_current_user': true,
    'newrelic.get_dashboard': true,
    'newrelic.get_entity': true,
    'newrelic.get_organization': true,
    'newrelic.list_accounts': true,
    'newrelic.list_alert_policies': true,
    'newrelic.list_dashboards': true,
    'newrelic.list_entity_tags': true,
    'newrelic.list_event_types': true,
    'newrelic.list_nrql_conditions': true,
    'newrelic.run_nrql_query': true,
    'newrelic.search_entities': true,
    'notebooklm.get_current_user': true,
    'notebooklm.get_notebook': true,
    'notebooklm.get_notebook_guide': true,
    'notebooklm.get_notes': true,
    'notebooklm.get_project_details': true,
    'notebooklm.list_chat_sessions': true,
    'notebooklm.list_notebooks': true,
    'notebooklm.list_sources': true,
    'notebooklm.navigate_to_notebook': true,
    'npm.get_organization': true,
    'npm.get_package': true,
    'npm.get_package_dependencies': true,
    'npm.get_package_dependents': true,
    'npm.get_package_downloads': true,
    'npm.get_package_readme': true,
    'npm.get_package_version': true,
    'npm.get_package_versions': true,
    'npm.get_user_packages': true,
    'npm.get_user_profile': true,
    'npm.search_packages': true,
    'onenote.get_current_user': true,
    'onenote.get_notebook': true,
    'onenote.get_recent_notebooks': true,
    'onenote.get_section': true,
    'onenote.get_section_group': true,
    'onenote.list_notebooks': true,
    'onenote.list_section_groups': true,
    'onenote.list_sections': true,
    'opentable.get_restaurant': true,
    'opentable.list_reservations': true,
    'opentable.search_restaurants': true,
    'outlook.download_attachment': true,
    'outlook.get_attachment_content': true,
    'outlook.get_calendar_view': true,
    'outlook.get_current_user': true,
    'outlook.get_event': true,
    'outlook.get_message': true,
    'outlook.list_attachments': true,
    'outlook.list_calendars': true,
    'outlook.list_events': true,
    'outlook.list_folders': true,
    'outlook.list_messages': true,
    'outlook.search_messages': true,
    'pandaexpress.find_restaurants': true,
    'pandaexpress.get_product_modifiers': true,
    'pandaexpress.get_restaurant': true,
    'pandaexpress.get_restaurant_menu': true,
    'pinterest.get_board_pins': true,
    'pinterest.get_board_sections': true,
    'pinterest.get_current_user': true,
    'pinterest.get_home_feed': true,
    'pinterest.get_notification_counts': true,
    'pinterest.get_pin': true,
    'pinterest.get_related_pins': true,
    'pinterest.get_user_pins': true,
    'pinterest.get_user_profile': true,
    'pinterest.list_boards': true,
    'pinterest.list_followers': true,
    'pinterest.list_following': true,
    'pinterest.search_boards': true,
    'pinterest.search_pins': true,
    'posthog.get_action': true,
    'posthog.get_cohort': true,
    'posthog.get_current_user': true,
    'posthog.get_dashboard': true,
    'posthog.get_experiment': true,
    'posthog.get_feature_flag': true,
    'posthog.get_insight': true,
    'posthog.get_organization': true,
    'posthog.get_person': true,
    'posthog.get_project': true,
    'posthog.get_survey': true,
    'posthog.list_actions': true,
    'posthog.list_annotations': true,
    'posthog.list_cohorts': true,
    'posthog.list_dashboards': true,
    'posthog.list_event_definitions': true,
    'posthog.list_events': true,
    'posthog.list_experiments': true,
    'posthog.list_feature_flags': true,
    'posthog.list_insights': true,
    'posthog.list_persons': true,
    'posthog.list_projects': true,
    'posthog.list_property_definitions': true,
    'posthog.list_surveys': true,
    'powerpoint.get_current_user': true,
    'powerpoint.get_download_url': true,
    'powerpoint.get_drive': true,
    'powerpoint.get_item': true,
    'powerpoint.get_slide_content': true,
    'powerpoint.get_slide_notes': true,
    'powerpoint.get_slides': true,
    'powerpoint.get_thumbnails': true,
    'powerpoint.list_children': true,
    'powerpoint.list_permissions': true,
    'powerpoint.list_recent': true,
    'powerpoint.list_shared_with_me': true,
    'powerpoint.list_versions': true,
    'powerpoint.search_files': true,
    'priceline.search_airports': true,
    'priceline.search_locations': true,
    'priceline.search_points_of_interest': true,
    'reddit.get_comment_thread': true,
    'reddit.get_me': true,
    'reddit.get_post': true,
    'reddit.get_subreddit': true,
    'reddit.get_user': true,
    'reddit.list_flairs': true,
    'reddit.list_popular_subreddits': true,
    'reddit.list_posts': true,
    'reddit.list_subscriptions': true,
    'reddit.list_user_content': true,
    'reddit.read_inbox': true,
    'reddit.search_posts': true,
    'reddit.search_subreddits': true,
    'robinhood.get_account': true,
    'robinhood.get_current_user': true,
    'robinhood.get_earnings': true,
    'robinhood.get_fundamentals': true,
    'robinhood.get_historicals': true,
    'robinhood.get_instrument': true,
    'robinhood.get_market_hours': true,
    'robinhood.get_news_feed': true,
    'robinhood.get_portfolio': true,
    'robinhood.get_portfolio_historicals': true,
    'robinhood.get_quote': true,
    'robinhood.get_ratings': true,
    'robinhood.get_watchlist': true,
    'robinhood.list_crypto_holdings': true,
    'robinhood.list_dividends': true,
    'robinhood.list_notifications': true,
    'robinhood.list_orders': true,
    'robinhood.list_positions': true,
    'robinhood.list_transfers': true,
    'robinhood.list_watchlists': true,
    'robinhood.search_instruments': true,
    'redfin.get_comparable_rentals': true,
    'redfin.get_current_user': true,
    'redfin.get_favorites': true,
    'redfin.get_property_amenities': true,
    'redfin.get_property_details': true,
    'redfin.get_property_estimate': true,
    'redfin.get_property_history': true,
    'redfin.get_property_parcel_info': true,
    'redfin.get_property_risk_factors': true,
    'redfin.get_property_schools': true,
    'redfin.search_locations': true,
    'redfin.search_properties': true,
    'retool.get_app': true,
    'retool.get_app_docs': true,
    'retool.get_app_state': true,
    'retool.get_current_user': true,
    'retool.get_organization': true,
    'retool.get_resource': true,
    'retool.get_source_control_settings': true,
    'retool.get_workflow': true,
    'retool.get_workflow_releases': true,
    'retool.get_workflow_run': true,
    'retool.get_workflow_run_count': true,
    'retool.get_workflow_run_log': true,
    'retool.get_workflows_config': true,
    'retool.list_agents': true,
    'retool.list_app_tags': true,
    'retool.list_apps': true,
    'retool.list_branches': true,
    'retool.list_components': true,
    'retool.list_environments': true,
    'retool.list_experiments': true,
    'retool.list_grids': true,
    'retool.list_page_names': true,
    'retool.list_page_saves': true,
    'retool.list_playground_queries': true,
    'retool.list_resources': true,
    'retool.list_user_spaces': true,
    'retool.list_workflow_triggers': true,
    'retool.list_workflows': true,
    'sentry.get_event': true,
    'sentry.get_issue': true,
    'sentry.get_organization': true,
    'sentry.get_project': true,
    'sentry.get_project_keys': true,
    'sentry.get_release': true,
    'sentry.list_alerts': true,
    'sentry.list_comments': true,
    'sentry.list_issue_events': true,
    'sentry.list_issue_tags': true,
    'sentry.list_members': true,
    'sentry.list_monitors': true,
    'sentry.list_organizations': true,
    'sentry.list_project_environments': true,
    'sentry.list_projects': true,
    'sentry.list_releases': true,
    'sentry.list_replays': true,
    'sentry.list_teams': true,
    'sentry.search_issues': true,
    'shopify.get_product': true,
    'shopify.list_orders': true,
    'shopify.list_products': true,
    'shortcut.get_current_user': true,
    'shortcut.list_epics': true,
    'shortcut.list_iterations': true,
    'shortcut.list_labels': true,
    'shortcut.list_members': true,
    'shortcut.list_objectives': true,
    'shortcut.list_teams': true,
    'shortcut.list_workflows': true,
    'slack.get_user_profile': true,
    'slack.list_files': true,
    'slack.list_users': true,
    'slack.read_messages': true,
    'slack.read_thread': true,
    'slack.search_messages': true,
    'snowflake.browse_data': true,
    'snowflake.diagnose': true,
    'snowflake.get_object_details': true,
    'snowflake.get_query': true,
    'snowflake.get_session': true,
    'snowflake.list_dashboards': true,
    'snowflake.list_folders': true,
    'snowflake.list_schemas': true,
    'snowflake.list_shared_objects': true,
    'snowflake.list_tables': true,
    'snowflake.list_warehouses': true,
    'snowflake.list_worksheets': true,
    'snowflake.run_query': true,
    'snowflake.search_data': true,
    'spotify.get_album': true,
    'spotify.get_artist': true,
    'spotify.get_available_devices': true,
    'spotify.get_current_user': true,
    'spotify.get_currently_playing': true,
    'spotify.get_playback_state': true,
    'spotify.get_playlist': true,
    'spotify.get_queue': true,
    'spotify.get_recently_played': true,
    'spotify.get_saved_tracks': true,
    'spotify.search': true,
    'steam.get_app_details': true,
    'steam.get_app_reviews': true,
    'steam.get_app_user_details': true,
    'steam.get_current_user': true,
    'steam.get_featured': true,
    'steam.get_featured_categories': true,
    'steam.get_popular_tags': true,
    'steam.get_user_data': true,
    'steam.search_store': true,
    'twitch.get_channel_emotes': true,
    'twitch.get_current_user': true,
    'twitch.get_game': true,
    'twitch.get_game_clips': true,
    'twitch.get_stream': true,
    'twitch.get_streams_by_game': true,
    'twitch.get_top_games': true,
    'twitch.get_top_streams': true,
    'twitch.get_user_clips': true,
    'twitch.get_user_profile': true,
    'twitch.get_user_videos': true,
    'twitch.get_video': true,
    'twitch.search_categories': true,
    'twitch.search_channels': true,
    'stackoverflow.get_answer': true,
    'stackoverflow.get_question': true,
    'stackoverflow.get_question_answers': true,
    'stackoverflow.get_similar_questions': true,
    'stackoverflow.get_tag_info': true,
    'stackoverflow.list_questions': true,
    'stackoverflow.list_tags': true,
    'stackoverflow.list_unanswered_questions': true,
    'stackoverflow.search_questions': true,
    'starbucks.find_stores': true,
    'starbucks.get_cards': true,
    'starbucks.get_cart': true,
    'starbucks.get_current_user': true,
    'starbucks.get_earn_rates': true,
    'starbucks.get_favorite_products': true,
    'starbucks.get_feed': true,
    'starbucks.get_payment_methods': true,
    'starbucks.get_previous_orders': true,
    'starbucks.get_product': true,
    'starbucks.get_rewards': true,
    'starbucks.get_store_menu': true,
    'starbucks.get_store_time_slots': true,
    'starbucks.navigate_to_checkout': true,
    'starbucks.price_order': true,
    'stripe.get_account': true,
    'stripe.get_balance': true,
    'stripe.get_customer': true,
    'stripe.get_event': true,
    'stripe.get_invoice': true,
    'stripe.get_payment_intent': true,
    'stripe.get_price': true,
    'stripe.get_product': true,
    'stripe.get_subscription': true,
    'stripe.list_balance_transactions': true,
    'stripe.list_customers': true,
    'stripe.list_events': true,
    'stripe.list_invoices': true,
    'stripe.list_payment_intents': true,
    'stripe.list_prices': true,
    'stripe.list_products': true,
    'stripe.list_subscriptions': true,
    'stripe.search_customers': true,
    'stripe.search_invoices': true,
    'stripe.search_payment_intents': true,
    'stripe.search_subscriptions': true,
    'stubhub.get_listing': true,
    'stubhub.list_orders': true,
    'stubhub.search_events': true,
    'supabase.generate_types': true,
    'supabase.get_api_keys': true,
    'supabase.get_function': true,
    'supabase.get_organization': true,
    'supabase.get_performance_advisors': true,
    'supabase.get_postgrest_config': true,
    'supabase.get_project': true,
    'supabase.get_project_health': true,
    'supabase.get_project_logs': true,
    'supabase.get_security_advisors': true,
    'supabase.list_backups': true,
    'supabase.list_buckets': true,
    'supabase.list_functions': true,
    'supabase.list_migrations': true,
    'supabase.list_organization_members': true,
    'supabase.list_organizations': true,
    'supabase.list_projects': true,
    'supabase.list_secrets': true,
    'supabase.list_sql_snippets': true,
    'target.get_product': true,
    'target.search_products': true,
    'teams.get_conversation_details': true,
    'teams.get_current_user': true,
    'teams.list_conversations': true,
    'teams.read_messages': true,
    'telegram.get_chat_info': true,
    'telegram.get_chat_members': true,
    'telegram.get_conversation': true,
    'telegram.get_current_user': true,
    'telegram.get_messages': true,
    'telegram.get_user': true,
    'telegram.get_user_profile': true,
    'telegram.list_contacts': true,
    'telegram.list_conversations': true,
    'telegram.resolve_username': true,
    'telegram.search_contacts': true,
    'telegram.search_messages': true,
    'temporal.count_workflows': true,
    'temporal.get_schedule': true,
    'temporal.get_settings': true,
    'temporal.get_task_queue': true,
    'temporal.get_workflow': true,
    'temporal.get_workflow_history': true,
    'temporal.list_schedules': true,
    'temporal.list_workflows': true,
    'terraform.get_apply': true,
    'terraform.get_current_state_version': true,
    'terraform.get_current_user': true,
    'terraform.get_organization': true,
    'terraform.get_plan': true,
    'terraform.get_plan_json_output': true,
    'terraform.get_project': true,
    'terraform.get_run': true,
    'terraform.get_team': true,
    'terraform.get_variable_set': true,
    'terraform.get_workspace': true,
    'terraform.list_organization_members': true,
    'terraform.list_organizations': true,
    'terraform.list_projects': true,
    'terraform.list_runs': true,
    'terraform.list_state_versions': true,
    'terraform.list_team_access': true,
    'terraform.list_teams': true,
    'terraform.list_variable_sets': true,
    'terraform.list_workspace_variables': true,
    'terraform.list_workspaces': true,
    'threads.get_thread': true,
    'ticketmaster.get_event': true,
    'ticketmaster.list_orders': true,
    'ticketmaster.search_events': true,
    'tiktok.get_user_profile': true,
    'tiktok.get_video': true,
    'tinder.get_current_user': true,
    'tinder.get_fast_match_count': true,
    'tinder.get_fast_match_preview': true,
    'tinder.get_recommendations': true,
    'tinder.get_user': true,
    'tinder.list_matches': true,
    'todoist.get_comment': true,
    'todoist.get_label': true,
    'todoist.get_project': true,
    'todoist.get_section': true,
    'todoist.get_task': true,
    'todoist.list_collaborators': true,
    'todoist.list_comments': true,
    'todoist.list_labels': true,
    'todoist.list_projects': true,
    'todoist.list_sections': true,
    'todoist.list_shared_labels': true,
    'todoist.list_tasks': true,
    'tripadvisor.get_attraction': true,
    'tripadvisor.get_breadcrumbs': true,
    'tripadvisor.get_hotel': true,
    'tripadvisor.get_neighborhood': true,
    'tripadvisor.get_restaurant': true,
    'tripadvisor.get_restaurant_awards': true,
    'tripadvisor.get_reviews': true,
    'tripadvisor.list_attractions': true,
    'tripadvisor.list_hotels': true,
    'tripadvisor.list_restaurants': true,
    'tumblr.get_blocks': true,
    'tumblr.get_blog_followers': true,
    'tumblr.get_blog_following': true,
    'tumblr.get_blog_info': true,
    'tumblr.get_blog_likes': true,
    'tumblr.get_blog_notifications': true,
    'tumblr.get_blog_posts': true,
    'tumblr.get_current_user': true,
    'tumblr.get_dashboard': true,
    'tumblr.get_draft_posts': true,
    'tumblr.get_filtered_tags': true,
    'tumblr.get_post': true,
    'tumblr.get_post_notes': true,
    'tumblr.get_queued_posts': true,
    'tumblr.get_recommended_blogs': true,
    'tumblr.get_submissions': true,
    'tumblr.get_user_following': true,
    'tumblr.get_user_likes': true,
    'tumblr.get_user_limits': true,
    'tumblr.search_tagged': true,
    'twilio.get_current_user': true,
    'walmart.get_product': true,
    'walmart.get_product_reviews': true,
    'walmart.get_store': true,
    'walmart.search_products': true,
    'webflow.get_current_user': true,
    'webflow.get_site': true,
    'webflow.get_site_domains': true,
    'webflow.get_site_hosting': true,
    'webflow.get_site_pages': true,
    'webflow.get_site_permissions': true,
    'webflow.get_workspace': true,
    'webflow.get_workspace_billing': true,
    'webflow.get_workspace_entitlements': true,
    'webflow.get_workspace_permissions': true,
    'webflow.list_folders': true,
    'webflow.list_site_forms': true,
    'webflow.list_sites': true,
    'webflow.list_workspace_members': true,
    'webflow.list_workspaces': true,
    'whatsapp.get_chat': true,
    'whatsapp.get_contact': true,
    'whatsapp.get_current_user': true,
    'whatsapp.get_group_invite_link': true,
    'whatsapp.list_chats': true,
    'whatsapp.list_contacts': true,
    'whatsapp.list_messages': true,
    'wikipedia.compare_revisions': true,
    'wikipedia.get_article': true,
    'wikipedia.get_article_categories': true,
    'wikipedia.get_article_languages': true,
    'wikipedia.get_article_links': true,
    'wikipedia.get_article_sections': true,
    'wikipedia.get_backlinks': true,
    'wikipedia.get_category_members': true,
    'wikipedia.get_featured_content': true,
    'wikipedia.get_page_summary': true,
    'wikipedia.get_random_articles': true,
    'wikipedia.get_recent_changes': true,
    'wikipedia.get_revisions': true,
    'wikipedia.get_section_content': true,
    'wikipedia.get_user_contributions': true,
    'wikipedia.opensearch': true,
    'wikipedia.search_articles': true,
    'x.get_tweet': true,
    'x.get_user_profile': true,
    'yelp.autocomplete': true,
    'yelp.get_business': true,
    'yelp.search_businesses': true,
    'ynab.get_account': true,
    'ynab.get_current_user': true,
    'ynab.get_month': true,
    'ynab.get_plan': true,
    'ynab.get_transaction': true,
    'ynab.list_accounts': true,
    'ynab.list_categories': true,
    'ynab.list_months': true,
    'ynab.list_payees': true,
    'ynab.list_scheduled_transactions': true,
    'ynab.list_transactions': true,
    'zendesk.get_current_user': true,
    'zendesk.get_organization': true,
    'zendesk.get_ticket': true,
    'zendesk.get_user': true,
    'zendesk.get_view_tickets': true,
    'zendesk.list_groups': true,
    'zendesk.list_organizations': true,
    'zendesk.list_tags': true,
    'zendesk.list_ticket_comments': true,
    'zendesk.list_tickets': true,
    'zendesk.list_users': true,
    'zendesk.list_views': true,
    'zendesk.search': true,
    'zillow.get_market_overview': true,
    'zillow.search_by_owner': true,
    'zillow.search_for_rent': true,
    'zillow.search_for_sale': true,
    'zillow.search_foreclosures': true,
    'zillow.search_new_construction': true,
    'zillow.search_open_houses': true,
    'zillow.search_recently_sold': true,
  };
  var T1_GUARDED_FAIL_CLOSED_SLUGS = {
    'github.issues.create': true,
    'gitlab.create_issue': true,
    'gitlab.create_merge_request': true,
    'gitlab.create_note': true,
    'slack.send_message': true,
    'supabase.create_secrets': true,
    'supabase.delete_function': true,
    'supabase.delete_secrets': true,
    'supabase.pause_project': true,
    'supabase.restore_project': true,
    'supabase.run_query': true,
    'supabase.run_read_only_query': true,
    'ubereats.place_order': true,
    'ubereats.cancel_order': true,
    'fiverr.send_message': true,
    'robinhood.create_watchlist': true,
    'robinhood.delete_watchlist': true,
    'steam.add_to_wishlist': true,
    'steam.follow_app': true,
    'steam.generate_discovery_queue': true,
    'steam.ignore_app': true,
    'steam.remove_from_wishlist': true,
    'steam.unignore_app': true
  };

  function normalizeBacking(value) {
    var b = String(value || '').toLowerCase();
    if (b === 'recipe' || b === 'handler' || b === 'learn' || b === 'dom') { return b; }
    return 'dom'; // absent/unknown -> the DOM-fallback seam (resolve() else -> T3)
  }
  function normalizeServiceHost(service) {
    var text = String(service || '').toLowerCase().trim();
    if (!text) { return ''; }
    try {
      return new URL(text.indexOf('://') === -1 ? 'https://' + text : text).hostname;
    } catch (_e) {
      return text.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }
  }
  function isBlockedService(service) {
    var host = normalizeServiceHost(service);
    return !!(host && BLOCKED_SERVICE_HOSTS[host]);
  }
  function readinessStatus(slug, backing, service) {
    if (isBlockedService(service)) { return 'blocked'; }
    if (T1_GUARDED_FAIL_CLOSED_SLUGS[slug]) { return 't1-guarded-fail-closed'; }
    if (T1_READY_SLUGS[slug]) { return 't1-ready'; }
    var b = normalizeBacking(backing);
    if (b === 'recipe' || b === 'handler') { return 't1-ready'; }
    if (b === 'learn') { return 'learn-pending'; }
    return 'discovery-pending';
  }
  // A descriptor is a confident invocable hit only when it is t1-ready. Guarded
  // fail-closed writes are searchable but should not be presented as executable yet.
  function isInvocableBacking(slug, backing, service) {
    return readinessStatus(slug, backing, service) === 't1-ready';
  }
  function backingDisplayLabel(slug, backing, service) {
    return readinessStatus(slug, backing, service);
  }

  // ---- Pure index builder (the SINGLE source of truth the eval test reuses) ---
  //
  // Constructs a MiniSearch over INDEX_OPTIONS and adds the descriptor docs. The
  // authored sideEffectClass is cross-checked against the recipe-derived value
  // (D-02): when a paired recipe is present its method wins, so a mis-authored
  // descriptor cannot under-state a destructive call in a search hit.
  function buildIndex(descriptors, slugToRecipe) {
    var MS = _getMiniSearch();
    if (!MS) return null;
    var map = slugToRecipe || {};
    var ms = new MS(INDEX_OPTIONS);
    ms.addAll((descriptors || []).map(function(d) {
      var recipe = map[d.slug] || {};
      var derived = recipe.method ? deriveSideEffect(recipe.method) : null;
      return {
        slug: d.slug,
        service: d.service || '',
        intentSynonyms: d.intentSynonyms || [],
        description: d.description || '',
        actionVerb: d.actionVerb || '',
        // recipe-derived class wins when a paired recipe exists (integrity check)
        sideEffectClass: derived || normalizeSideEffectClass(d.sideEffectClass),
        // BRDTH-03: a paired recipe makes the entry recipe-backed; else carry the
        // descriptor's own backing enum (defaults to 'dom' -> the DOM-fallback seam).
        backing: (map[d.slug] ? 'recipe' : normalizeBacking(d.backing))
      };
    }));
    return ms;
  }

  // ---- D-05: build at startup, restore from a version-matched snapshot --------
  async function buildOrRestore() {
    var MS = _getMiniSearch();
    if (!MS) return false;
    var cat = _getCatalog();
    var descriptors = cat.descriptors || [];

    // slug -> recipe/descriptor maps (invoke lookup + schema-on-hit params)
    _slugToRecipe = {};
    (cat.recipes || []).forEach(function(r) { if (r && r.id) _slugToRecipe[r.id] = r; });
    _slugToDescriptor = {};
    (descriptors || []).forEach(function(d) { if (d && d.slug) _slugToDescriptor[d.slug] = d; });

    // catalogVersion stamp: a content hash over the descriptor slugs + recipe
    // count is robust against same-count edits (Assumption A5).
    var catalogVersion = _computeCatalogVersion(descriptors, cat.recipes || [], cat.version);

    var c = _getChrome();
    // 1. Restore from snapshot when the BASE version matches (HI-01 / D-14 fix).
    //
    // A snapshot written by addLearnedRecipe carries a '+learnedN' suffix on top of
    // the base-catalog version (e.g. "1:3fe8b718+learned3"); a base-only snapshot has
    // no suffix. We compare the base PREFIX (everything before '+learned') against the
    // freshly recomputed base catalogVersion. A match means the persisted index --
    // which already contains the learned docs -- is current for THIS base catalog, so
    // we restore it verbatim and the learned slugs survive the SW restart (LEARN-03).
    // A genuine base-catalog change shifts catalogVersion, the prefixes diverge, and
    // we correctly fall through to rebuild (invalidation still holds).
    if (c && c.storage && c.storage.local) {
      try {
        var stored = await c.storage.local.get(STORAGE_KEY);
        var snap = stored && stored[STORAGE_KEY];
        var storedBase = String((snap && snap.catalogVersion) || '').split('+learned')[0];
        if (snap && storedBase === catalogVersion && snap.index) {
          // loadJSON wants a JSON string and the SAME options used at serialize.
          _ms = MS.loadJSON(JSON.stringify(snap.index), INDEX_OPTIONS);
          // Re-seed the learned-add bookkeeping from the restored suffix so the next
          // addLearnedRecipe keeps the '+learnedN' counter strictly monotonic across
          // the restart (a fresh module starts _learnedAddSeq at 0 otherwise, which
          // would re-issue an already-used suffix on the next add).
          _reseedLearnedFromSnapshot(snap, _ms);
          return true;
        }
      } catch (e) { /* fall through to rebuild */ }
    }

    // 2. Rebuild + re-snapshot.
    _ms = buildIndex(descriptors, _slugToRecipe);
    if (c && c.storage && c.storage.local && _ms) {
      try {
        var payload = {};
        payload[STORAGE_KEY] = { catalogVersion: catalogVersion, index: _ms.toJSON() };
        await c.storage.local.set(payload);
      } catch (e) { /* best-effort snapshot */ }
    }
    return !!_ms;
  }

  // ---- A deterministic catalogVersion stamp (count + slug-content hash) -------
  function _computeCatalogVersion(descriptors, recipes, declaredVersion) {
    var parts = (descriptors || []).map(function(d) { return d && d.slug ? d.slug : ''; }).sort();
    // LOW-01 (37-REVIEW): fold the INDEX shape (the searchable `fields` + the
    // returned-on-hit `storeFields`) into the version seed. MiniSearch.loadJSON does
    // NOT validate storeFields, so a snapshot serialized BEFORE a storeFields-only
    // edit (e.g. before `backing` was added) whose slug set still matches would
    // restore cleanly and carry the field as `undefined` -- a stale snapshot with
    // backing===undefined mis-annotating an invocable head slug. Including the shape
    // here makes any fields/storeFields change shift the version -> the stale snapshot
    // is rejected and the index rebuilds. INV-01: ONLY the seed string widens; the
    // djb2 loop and the IIFE wrapper shape are byte-stable.
    var seed = parts.join('|') + '#' + (recipes ? recipes.length : 0) + '#' + (declaredVersion || '')
             + '#' + INDEX_OPTIONS.storeFields.join(',') + '#' + INDEX_OPTIONS.fields.join(',');
    // Simple, dependency-free 32-bit string hash (djb2). Pure arithmetic -- no
    // dynamic-code constructs on the recipe path.
    var hash = 5381;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
    }
    return (descriptors ? descriptors.length : 0) + ':' + (hash >>> 0).toString(16);
  }

  // ---- HI-01 / D-14: re-seed learned bookkeeping after a snapshot restore ------
  //
  // When buildOrRestore re-attaches a persisted snapshot whose version carried a
  // '+learnedN' suffix, the in-memory learned counters (_learnedAddSeq /
  // _learnedDescriptors) are still at their fresh-module defaults (0 / []). Left
  // unseeded, the next addLearnedRecipe would emit '+learned1' again -- a NON-
  // monotonic version that could equal a value already written before the restart.
  // We recover the prior count from the stored suffix so the next add continues the
  // sequence (e.g. restored "...+learned3" -> next add writes "...+learned4").
  function _reseedLearnedFromSnapshot(snap, ms) {
    try {
      var ver = String((snap && snap.catalogVersion) || '');
      var marker = ver.indexOf('+learned');
      if (marker !== -1) {
        var n = parseInt(ver.slice(marker + '+learned'.length), 10);
        if (isFinite(n) && n > _learnedAddSeq) { _learnedAddSeq = n; }
      }
    } catch (e) { /* best-effort -- a malformed suffix just leaves the counter at 0 */ }
  }

  // ---- SURF-01: ranked, origin-biased, schema-on-hit results (<=topN) ---------
  function search(query, ownedOrigin, topN) {
    if (!_ms) return [];
    var ownedService = null;
    try { ownedService = ownedOrigin ? new URL(ownedOrigin).host : null; } catch (e) { ownedService = null; }

    var hits = _ms.search(String(query || ''), {
      combineWith: 'OR',                          // any matching term contributes (recall)
      prefix: true,
      fuzzy: 0.2,
      boost: { intentSynonyms: 3, description: 1 },
      // D-11 origin bias. minisearch 7.2.0 invokes boostDocument(id, term, stored)
      // (confirmed: boostDocument(id, '', this._storedFields.get(shortId))).
      // Exact-or-subdomain match (mirrors capability-catalog.js:biasByOwnedOrigin's
      // strict-equality bias): substring containment would let unrelated services
      // whose name happens to contain the active host receive the same 4x boost
      // -- 'x.com' is a substring of 'netflix.com' in the shipped catalog, and
      // 'slack.com' is a substring of 'app.slack.com'. Only true same-service or
      // apex-vs-subdomain matches should ride the bias.
      boostDocument: function(id, term, stored) {
        return (ownedService && stored && stored.service && _serviceMatchesOwned(stored.service, ownedService))
          ? ORIGIN_BOOST : 1;
      }
    });

    // Defensive fallback (Open Question 1): if the boostDocument signature ever
    // drifts and the owned service did NOT float to the top, re-rank by an
    // owned-service match. A stable sort keeps minisearch's relevance order
    // within each bias bucket. Uses the same exact-or-subdomain match as the
    // boost above -- both paths must agree on what "owned" means or the
    // fallback would falsely conclude an unrelated top hit was already-owned.
    if (ownedService && hits.length > 1) {
      var topService = hits[0] && hits[0].service;
      var ownedTopAlready = topService && _serviceMatchesOwned(topService, ownedService);
      if (!ownedTopAlready) {
        hits = _stableSortByOwnedService(hits, ownedService);
      }
    }

    var k = Math.max(1, Math.min(Number(topN) || 5, 5));
    return hits.slice(0, k).map(function(h) {
      var recipe = _slugToRecipe[h.slug] || {};
      var descriptor = _slugToDescriptor[h.slug] || {};
      // BRDTH-03 / Phase 44 status annotation: a t1-ready hit is confident
      // invocable; guarded fail-closed, learn, and DOM hits return for discovery
      // but are not presented as executable. A hit with a paired recipe in the
      // slug->recipe map is recipe-backed even if its stored backing differs.
      var backing = (_slugToRecipe[h.slug]) ? 'recipe' : normalizeBacking(h.backing);
      var status = readinessStatus(h.slug, backing, h.service);
      return {
        slug: h.slug,
        service: h.service,
        sideEffectClass: normalizeSideEffectClass(h.sideEffectClass),
        description: h.description,
        score: h.score,
        params: recipe.params || descriptor.params || null, // schema-on-hit (D-08)
        backing: backing,                                    // canonical seam enum
        backingStatus: status,                               // display label
        readinessStatus: status,                             // Phase 44 status label
        invocable: isInvocableBacking(h.slug, backing, h.service) // confident-invocable flag
      };
    });
  }

  // Stable re-rank: owned-service hits first, original relative order preserved.
  function _stableSortByOwnedService(hits, ownedService) {
    var owned = [];
    var rest = [];
    for (var i = 0; i < hits.length; i++) {
      var svc = hits[i] && hits[i].service;
      if (svc && _serviceMatchesOwned(svc, ownedService)) { owned.push(hits[i]); }
      else { rest.push(hits[i]); }
    }
    return owned.concat(rest);
  }

  // Returns true iff `service` refers to the same site as `ownedService`.
  // Match rule: exact hostname equality OR `service` is a subdomain of the
  // owned host (`.<owned>` suffix). This is the same shape used by
  // capability-catalog.js's biasByOwnedOrigin. Substring containment is
  // deliberately rejected because it produces false positives across
  // unrelated first-party services (e.g. 'x.com' as a substring of
  // 'netflix.com').
  function _serviceMatchesOwned(service, ownedService) {
    if (!service || !ownedService) return false;
    if (service === ownedService) return true;
    return service.length > ownedService.length + 1
      && service.slice(service.length - ownedService.length - 1) === '.' + ownedService;
  }

  // ---- invoke lookup (used by Plan 03) ---------------------------------------
  function getRecipeBySlug(slug) {
    return _slugToRecipe[slug] || null;
  }

  // ---- LEARN-03 / D-14: feed a learned recipe into the ONE index + slug map ---
  //
  // addLearnedRecipe(recipe, descriptor) makes the learned slug findable via
  // search() AND getRecipeBySlug on this and the next visit. It MUTATES the
  // EXISTING _ms instance (built with INDEX_OPTIONS) and NEVER constructs a fresh
  // MiniSearch (Pitfall 5) -- a second index with a divergent options object would
  // make a later MiniSearch.loadJSON(snapshot, INDEX_OPTIONS) throw "loadJSON
  // should be given the same options". When _ms is not yet built it is built via
  // the same buildIndex path first; when MiniSearch is absent (Node harness without
  // the constructor) it no-op-degrades and returns false.
  //
  // The indexed document mirrors buildIndex's addAll mapper EXACTLY, including the
  // D-02 integrity rule: the recipe method derives sideEffectClass and WINS over a
  // mis-authored descriptor class. After the index mutation the snapshot under
  // STORAGE_KEY is re-persisted with a BUMPED catalogVersion (a content hash over
  // the grown descriptor set plus a strictly monotonic learned-add suffix) so an SW
  // restart restores WITH the learned entry instead of a stale snapshot that lacks
  // it (D-14). Best-effort: a missing chrome.storage.local skips only the persist.
  async function addLearnedRecipe(recipe, descriptor) {
    var MS = _getMiniSearch();
    if (!MS) return false;                         // no constructor -> degrade
    if (!recipe || typeof recipe.id !== 'string' || !recipe.id) return false;
    var desc = descriptor || {};
    var slug = recipe.id;                          // the recipe id IS the slug

    // Build the index over INDEX_OPTIONS if it does not exist yet -- REUSING the
    // single buildIndex path (no fresh options object); never a second index.
    if (!_ms) {
      _ms = buildIndex([], _slugToRecipe);
      if (!_ms) return false;
    }

    // Mirror buildIndex's addAll mapper (the recipe-derived class wins, D-02). A
    // learned recipe is recipe-backed (BRDTH-03) -> a confident invocable hit.
    var doc = {
      slug: slug,
      service: desc.service || '',
      intentSynonyms: desc.intentSynonyms || [],
      description: desc.description || '',
      actionVerb: desc.actionVerb || '',
      sideEffectClass: (recipe.method ? deriveSideEffect(recipe.method) : normalizeSideEffectClass(desc.sideEffectClass)),
      backing: 'recipe'
    };

    // Re-promotion safety: discard any existing doc with this slug before add so
    // MiniSearch does not throw on a duplicate id.
    try { _ms.discard(slug); } catch (e) { /* not present -> nothing to discard */ }
    try { _ms.add(doc); } catch (e) { return false; }

    // Wire the slug -> recipe map (getRecipeBySlug + schema-on-hit params).
    _slugToRecipe[slug] = recipe;

    // Track the learned descriptor so the re-snapshot version reflects the grown
    // catalog; bump the strictly monotonic learned-add counter unconditionally.
    _learnedDescriptors.push({ slug: slug });
    _learnedAddSeq += 1;

    // Re-persist the snapshot with a BUMPED '+learnedN' catalogVersion (D-14 /
    // HI-01) -- see _persistLearnedSnapshot for the base-prefix invalidation rule.
    await _persistLearnedSnapshot();
    return true;
  }

  // ---- Re-persist the snapshot with a BUMPED '+learnedN' catalogVersion --------
  //
  // Shared by addLearnedRecipe and removeLearnedRecipe (LO-01). The stored version
  // is the BASE-catalog version (computed over cat.descriptors ONLY -- the exact
  // input buildOrRestore recomputes on restart) plus a '+learnedN' suffix, so the
  // prefix-tolerant restore re-attaches the persisted index (which carries the
  // current learned docs) and a base-catalog change still invalidates it (HI-01).
  // Best-effort: a missing chrome.storage.local skips only the persist.
  async function _persistLearnedSnapshot() {
    var c = _getChrome();
    if (!(c && c.storage && c.storage.local && _ms)) { return; }
    try {
      var cat = _getCatalog();
      var baseDescriptors = (cat.descriptors || []);
      var baseRecipes = (cat.recipes || []);
      var bumped = _computeCatalogVersion(baseDescriptors, baseRecipes, cat.version)
        + '+learned' + _learnedAddSeq;
      var payload = {};
      payload[STORAGE_KEY] = { catalogVersion: bumped, index: _ms.toJSON() };
      await c.storage.local.set(payload);
    } catch (e) { /* best-effort snapshot -- the in-memory index is already updated */ }
  }

  // ---- LO-01: drop an evicted learned slug from the index (store/index parity) -
  //
  // removeLearnedRecipe(slug) is the inverse of addLearnedRecipe. The learned store
  // LRU-evicts the oldest slug past its per-origin cap (learned-recipe-store.promote
  // -> _evictOldestIfOverCap); without a matching index drop the evicted slug stayed
  // a DEAD search() hit (resolve() -> getLearnedSync null -> RECIPE_NOT_FOUND). This
  // discards the doc from the ONE _ms instance, drops the slug -> recipe map entry,
  // bumps the monotonic learned-add counter, and re-persists the snapshot so the
  // removal survives an SW restart. Idempotent + no-op-safe: an unknown slug, an
  // absent index, or an absent MiniSearch all degrade to false without throwing.
  async function removeLearnedRecipe(slug) {
    if (typeof slug !== 'string' || !slug) { return false; }
    if (!_ms) { return false; }   // nothing built -> nothing to remove
    var removed = false;
    try { _ms.discard(slug); removed = true; } catch (e) { /* not present -> nothing to discard */ }
    if (Object.prototype.hasOwnProperty.call(_slugToRecipe, slug)) {
      delete _slugToRecipe[slug];
      removed = true;
    }
    // Drop the tracked learned descriptor (best-effort; bookkeeping only).
    _learnedDescriptors = _learnedDescriptors.filter(function(d) { return d && d.slug !== slug; });
    // Bump the monotonic counter so the re-persisted version differs from the prior
    // snapshot (a removal is a catalog change too).
    _learnedAddSeq += 1;
    await _persistLearnedSnapshot();
    return removed;
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ------
  var exportsObj = {
    buildOrRestore: buildOrRestore,
    buildIndex: buildIndex,
    search: search,
    getRecipeBySlug: getRecipeBySlug,
    addLearnedRecipe: addLearnedRecipe,
    removeLearnedRecipe: removeLearnedRecipe,
    deriveSideEffect: deriveSideEffect,
    INDEX_OPTIONS: INDEX_OPTIONS
  };

  global.FsbCapabilitySearch = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

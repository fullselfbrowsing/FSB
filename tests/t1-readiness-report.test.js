'use strict';

/**
 * Phase 44 / Plan 01 -- T1 readiness report invariants.
 *
 * Run: node tests/t1-readiness-report.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function bySlug(rows, slug) {
  return rows.find(function(row) { return row && row.slug === slug; }) || null;
}

(async function run() {
  console.log('--- Phase 44: T1 readiness report invariants ---');

  const catalog = require(CATALOG_PATH);
  const mod = await import(pathToFileURL(REPORT_PATH).href);
  check(typeof mod.reportReadiness === 'function', 'reportReadiness() is exported');
  check(typeof mod.validateReadinessReport === 'function', 'validateReadinessReport() is exported');

  const report = mod.reportReadiness(catalog);
  const rows = report.rows;
  check(Array.isArray(rows), 'report.rows is an array');
  check(rows.length === catalog.descriptors.length,
    'row count equals descriptor count (' + rows.length + ' rows)');

  const validation = mod.validateReadinessReport(report, catalog);
  check(validation.failures.length === 0,
    'validateReadinessReport() passes the committed catalog' +
    (validation.failures.length ? ': ' + validation.failures.join(' | ') : ''));

  const required = [
    'slug',
    'app',
    'service',
    'sideEffectClass',
    'backing',
    'resolvedTier',
    'readiness',
    'originClass',
    'authPattern',
    'routeFeasibility',
    'nextAction',
  ];
  let missingRequired = [];
  for (const row of rows) {
    for (const field of required) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        missingRequired.push(row.slug + ':' + field);
      }
    }
  }
  check(missingRequired.length === 0,
    'every row has the required readiness fields' +
    (missingRequired.length ? ' -- missing: ' + missingRequired.slice(0, 10).join(', ') : ''));

  const knownReady = [
    'github.notifications',
    'reddit.inbox',
    'reddit.get_comment_thread',
    'reddit.get_me',
    'reddit.get_post',
    'reddit.get_subreddit',
    'reddit.get_user',
    'reddit.list_flairs',
    'reddit.list_popular_subreddits',
    'reddit.list_posts',
    'reddit.list_subscriptions',
    'reddit.list_user_content',
    'reddit.read_inbox',
    'reddit.search_posts',
    'reddit.search_subreddits',
    'github.issues.list',
    'gitlab.get_file_content',
    'gitlab.get_issue',
    'gitlab.get_job_log',
    'gitlab.get_merge_request',
    'gitlab.get_merge_request_diff',
    'gitlab.get_project',
    'gitlab.get_user_profile',
    'gitlab.list_branches',
    'gitlab.list_commits',
    'gitlab.list_issues',
    'gitlab.list_merge_requests',
    'gitlab.list_notes',
    'gitlab.list_pipeline_jobs',
    'gitlab.list_pipelines',
    'gitlab.list_projects',
    'gitlab.search_projects',
    'netlify.get_account',
    'netlify.get_current_user',
    'netlify.get_deploy',
    'netlify.get_dns_zone',
    'netlify.get_env_var',
    'netlify.get_member',
    'netlify.get_site',
    'netlify.list_accounts',
    'netlify.list_audit_events',
    'netlify.list_build_hooks',
    'netlify.list_builds',
    'netlify.list_deploy_keys',
    'netlify.list_deploys',
    'netlify.list_dns_records',
    'netlify.list_dns_zones',
    'netlify.list_env_vars',
    'netlify.list_form_submissions',
    'netlify.list_forms',
    'netlify.list_hooks',
    'netlify.list_members',
    'netlify.list_sites',
    'bitbucket.get_commit',
    'bitbucket.get_file_content',
    'bitbucket.get_pipeline',
    'bitbucket.get_pull_request',
    'bitbucket.get_pull_request_diff',
    'bitbucket.get_repository',
    'bitbucket.get_user_profile',
    'bitbucket.list_branches',
    'bitbucket.list_commits',
    'bitbucket.list_pipeline_steps',
    'bitbucket.list_pipelines',
    'bitbucket.list_pr_comments',
    'bitbucket.list_pull_requests',
    'bitbucket.list_repositories',
    'bitbucket.list_tags',
    'bitbucket.list_workspace_members',
    'bitbucket.list_workspaces',
    'bitbucket.search_code',
    'circleci.get_current_user',
    'circleci.get_context',
    'circleci.get_flaky_tests',
    'circleci.list_pipelines',
    'circleci.get_project',
    'circleci.get_pipeline',
    'circleci.get_pipeline_config',
    'circleci.get_pipeline_workflows',
    'circleci.get_project_workflow_metrics',
    'circleci.get_workflow',
    'circleci.get_workflow_job_metrics',
    'circleci.get_workflow_jobs',
    'circleci.get_workflow_runs',
    'circleci.get_job',
    'circleci.get_job_artifacts',
    'circleci.get_job_tests',
    'circleci.list_context_env_vars',
    'circleci.list_contexts',
    'circleci.list_env_vars',
    'circleci.list_schedules',
    'vercel.get_user',
    'vercel.list_teams',
    'vercel.list_projects',
    'vercel.get_project',
    'vercel.list_deployments',
    'vercel.get_deployment',
    'vercel.list_domains',
    'notion.getSpaces',
    'notion.create_page',
    'notion.update_page',
    'notion.create_database',
    'notion.create_database_item',
    'slack.chat.postMessage',
    'slack.conversations.list',
    'slack.get_channel_info',
    'slack.get_user_profile',
    'slack.list_channels',
    'slack.list_files',
    'slack.list_members',
    'slack.list_users',
    'slack.read_messages',
    'slack.read_thread',
    'slack.search_messages',
    'instagram.get_post',
    'instagram.get_user_profile',
    'instagram.search',
    'instagram.search_hashtags',
    'instagram.search_users',
    'tiktok.get_user_profile',
    'tiktok.get_video',
    'facebook.get_current_user',
    'facebook.search_marketplace',
    'threads.get_thread',
    'medium.get_collection',
    'medium.get_current_user',
    'medium.get_notification_count',
    'medium.get_post',
    'medium.get_post_responses',
    'medium.get_reading_list',
    'medium.get_recommended_publishers',
    'medium.get_tag_feed',
    'medium.get_user_profile',
    'medium.list_followers',
    'medium.list_following',
    'medium.list_recommended_tags',
    'medium.search_collections',
    'medium.search_posts',
    'medium.search_tags',
    'dominos.search_address',
    'dominos.find_stores_by_address',
    'dominos.get_menu_categories',
    'dominos.get_category_products',
    'dominos.get_product',
    'dominos.get_deal',
    'chipotle.get_ordering_status',
    'chipotle.get_restaurant',
    'chipotle.get_menu',
    'chipotle.get_preconfigured_meals',
    'pandaexpress.find_restaurants',
    'pandaexpress.get_restaurant',
    'pandaexpress.get_restaurant_menu',
    'pandaexpress.get_product_modifiers',
    'grubhub.list_restaurants',
    'grubhub.get_restaurant',
    'grubhub.list_orders',
    'costco.get_product',
    'costco.get_products',
    'costco.get_product_availability',
    'instacart.get_current_user',
    'instacart.list_addresses',
    'instacart.list_active_carts',
    'instacart.get_cart',
    'instacart.list_orders',
    'instacart.get_order',
    'doordash.get_current_user',
    'doordash.list_addresses',
    'doordash.list_orders',
    'doordash.get_order',
    'doordash.list_payment_methods',
    'doordash.get_notifications',
    'lucid.get_account',
    'lucid.get_current_user',
    'lucid.get_document',
    'lucid.get_document_count',
    'lucid.get_document_pages',
    'lucid.get_document_role',
    'lucid.get_document_status',
    'lucid.get_folder_entry',
    'lucid.get_user_permissions',
    'lucid.list_account_users',
    'lucid.list_documents',
    'lucid.list_folder_entries',
    'lucid.list_groups',
    'lucid.search_documents',
    'target.search_products',
    'target.get_product',
    'walmart.search_products',
    'walmart.get_product',
    'walmart.get_product_reviews',
    'walmart.get_store',
    'etsy.search_listings',
    'etsy.get_listing',
    'etsy.list_orders',
    'homedepot.search_products',
    'homedepot.get_product',
    'homedepot.search_stores',
    'homedepot.get_cart',
    'homedepot.get_saved_items',
    'homedepot.get_store_context',
    'amazon.get_product',
    'amazon.list_orders',
    'amazon.search_products',
    'amazon.track_order',
    'expedia.navigate_to_hotel',
    'expedia.search_activities',
    'expedia.search_car_rentals',
    'expedia.search_cruises',
    'expedia.search_flights',
    'expedia.search_packages',
    'booking.get_property',
    'booking.get_property_reviews',
    'booking.navigate_to_property',
    'booking.navigate_to_search',
    'booking.search_destinations',
    'booking.search_properties',
    'kayak.get_price_alert',
    'kayak.search_flights',
    'kayak.search_hotels',
    'opentable.search_restaurants',
    'opentable.get_restaurant',
    'opentable.list_reservations',
    'airbnb.get_current_user',
    'airbnb.get_header_info',
    'airbnb.get_inbox_filters',
    'airbnb.get_listing_from_page',
    'airbnb.get_map_viewport_info',
    'airbnb.get_message_thread',
    'airbnb.get_search_results',
    'airbnb.get_user_thumbnail',
    'airbnb.get_wishlist_items',
    'airbnb.is_host',
    'airbnb.list_message_threads',
    'airbnb.list_wishlists',
    'airbnb.search_suggestions',
    'airtable.get_base_schema',
    'airtable.get_field_choices',
    'airtable.get_record',
    'airtable.get_record_activity',
    'airtable.list_records',
    'airtable.list_workspaces',
    'chatgpt.discover_gpts',
    'chatgpt.get_account_info',
    'chatgpt.get_beta_features',
    'chatgpt.get_conversation',
    'chatgpt.get_current_user',
    'chatgpt.get_custom_instructions',
    'chatgpt.get_gpt',
    'chatgpt.get_memories',
    'chatgpt.get_prompt_library',
    'chatgpt.list_conversations',
    'chatgpt.list_models',
    'chatgpt.list_shared_conversations',
    'chatgpt.search_conversations',
    'claude.get_conversation',
    'claude.get_current_user',
    'claude.get_project',
    'claude.list_conversations',
    'claude.list_models',
    'claude.list_organizations',
    'claude.list_projects',
    'gemini.get_current_user',
    'gemini.list_models',
    'gemini.list_conversations',
    'gemini.get_conversation',
    'hack2hire.get_comment',
    'hack2hire.get_company_question_stats',
    'hack2hire.get_completed_question_count',
    'hack2hire.get_current_user',
    'hack2hire.get_question',
    'hack2hire.get_question_neighbors',
    'hack2hire.get_subscription',
    'hack2hire.list_comment_replies',
    'hack2hire.list_companies',
    'hack2hire.list_my_bookmarks',
    'hack2hire.list_my_visits',
    'hack2hire.list_question_coding_problems',
    'hack2hire.list_question_comments',
    'hack2hire.list_questions',
    'discord.get_channel_info',
    'discord.get_guild_info',
    'discord.get_message',
    'discord.get_user_profile',
    'discord.list_channels',
    'discord.list_dms',
    'discord.list_guilds',
    'discord.list_members',
    'discord.list_pinned_messages',
    'discord.list_roles',
    'discord.read_messages',
    'discord.read_thread',
    'discord.search_messages',
    'telegram.get_chat_info',
    'telegram.get_chat_members',
    'telegram.get_conversation',
    'telegram.get_current_user',
    'telegram.get_messages',
    'telegram.get_user',
    'telegram.get_user_profile',
    'telegram.list_contacts',
    'telegram.list_conversations',
    'telegram.resolve_username',
    'telegram.search_contacts',
    'telegram.search_messages',
    'cockroachdb.get_cluster',
    'cockroachdb.get_cluster_usage',
    'cockroachdb.get_credit_trial_status',
    'cockroachdb.get_networking_config',
    'cockroachdb.get_organization',
    'cockroachdb.get_resource_count',
    'cockroachdb.get_user_profile',
    'cockroachdb.list_cluster_nodes',
    'cockroachdb.list_clusters',
    'cockroachdb.list_database_names',
    'cockroachdb.list_database_users',
    'cockroachdb.list_invoices',
    'cockroachdb.list_org_users',
    'clickhouse.get_organization',
    'clickhouse.get_private_endpoint_config',
    'clickhouse.get_scaling_limits',
    'clickhouse.get_service',
    'clickhouse.get_status',
    'clickhouse.list_backups',
    'clickhouse.list_organization_members',
    'clickhouse.list_services',
    'clickhouse.query_metrics',
    'temporal.count_workflows',
    'temporal.get_schedule',
    'temporal.get_settings',
    'temporal.get_task_queue',
    'temporal.get_workflow',
    'temporal.get_workflow_history',
    'temporal.list_schedules',
    'temporal.list_workflows',
    'msword.get_active_document',
    'msword.get_current_user',
    'msword.get_document_text',
    'msword.get_drive',
    'msword.get_file_content',
    'msword.get_item',
    'msword.list_children',
    'msword.list_permissions',
    'msword.list_recent_documents',
    'msword.list_shared_with_me',
    'msword.list_versions',
    'msword.search_files',
    'excel.get_current_user',
    'excel.get_range',
    'excel.get_table_columns',
    'excel.get_table_rows',
    'excel.get_used_range',
    'excel.get_workbook_info',
    'excel.list_charts',
    'excel.list_named_items',
    'excel.list_tables',
    'excel.list_worksheets',
    'powerpoint.get_current_user',
    'powerpoint.get_download_url',
    'powerpoint.get_drive',
    'powerpoint.get_item',
    'powerpoint.get_slide_content',
    'powerpoint.get_slide_notes',
    'powerpoint.get_slides',
    'powerpoint.get_thumbnails',
    'powerpoint.list_children',
    'powerpoint.list_permissions',
    'powerpoint.list_recent',
    'powerpoint.list_shared_with_me',
    'powerpoint.list_versions',
    'powerpoint.search_files',
    'onenote.get_current_user',
    'onenote.get_notebook',
    'onenote.get_recent_notebooks',
    'onenote.get_section',
    'onenote.get_section_group',
    'onenote.list_notebooks',
    'onenote.list_section_groups',
    'onenote.list_sections',
    'webflow.get_current_user',
    'webflow.get_site',
    'webflow.get_site_domains',
    'webflow.get_site_hosting',
    'webflow.get_site_pages',
    'webflow.get_site_permissions',
    'webflow.get_workspace',
    'webflow.get_workspace_billing',
    'webflow.get_workspace_entitlements',
    'webflow.get_workspace_permissions',
    'webflow.list_folders',
    'webflow.list_site_forms',
    'webflow.list_sites',
    'webflow.list_workspace_members',
    'webflow.list_workspaces',
    'newrelic.get_current_user',
    'newrelic.get_dashboard',
    'newrelic.get_entity',
    'newrelic.get_organization',
    'newrelic.list_accounts',
    'newrelic.list_alert_policies',
    'newrelic.list_dashboards',
    'newrelic.list_entity_tags',
    'newrelic.list_event_types',
    'newrelic.list_nrql_conditions',
    'newrelic.run_nrql_query',
    'newrelic.search_entities',
    'datadog.get_current_user',
    'datadog.get_dashboard',
    'datadog.get_downtime',
    'datadog.get_host_info',
    'datadog.get_host_totals',
    'datadog.get_incident',
    'datadog.get_metric_metadata',
    'datadog.get_monitor',
    'datadog.get_monitor_groups',
    'datadog.get_notebook',
    'datadog.get_org_config',
    'datadog.get_permissions',
    'datadog.get_service_definition',
    'datadog.get_service_dependencies',
    'datadog.get_slo',
    'datadog.get_slo_history',
    'datadog.get_synthetics_results',
    'datadog.get_synthetics_test',
    'datadog.get_trace',
    'datadog.get_usage_summary',
    'datadog.get_user',
    'datadog.list_api_keys',
    'datadog.list_dashboards',
    'datadog.list_downtimes',
    'datadog.list_host_tags',
    'datadog.list_hosts',
    'datadog.list_incidents',
    'datadog.list_metric_tags',
    'datadog.list_metrics',
    'datadog.list_monitor_downtimes',
    'datadog.list_monitor_tags',
    'datadog.list_monitors',
    'datadog.list_notebooks',
    'datadog.list_services',
    'datadog.list_slo_corrections',
    'datadog.list_slos',
    'datadog.list_synthetics_tests',
    'datadog.list_teams',
    'datadog.list_users',
    'datadog.query_metrics',
    'datadog.search_dashboards',
    'datadog.search_dashboards_advanced',
    'datadog.search_monitors',
    'datadog.search_notebooks',
    'datadog.search_services',
    'datadog.search_slos',
    'posthog.get_current_user',
    'posthog.get_organization',
    'posthog.list_projects',
    'posthog.get_project',
    'posthog.list_dashboards',
    'posthog.get_dashboard',
    'posthog.list_insights',
    'posthog.get_insight',
    'posthog.list_feature_flags',
    'posthog.get_feature_flag',
    'posthog.list_experiments',
    'posthog.get_experiment',
    'posthog.list_annotations',
    'posthog.list_persons',
    'posthog.get_person',
    'posthog.list_cohorts',
    'posthog.get_cohort',
    'posthog.list_surveys',
    'posthog.get_survey',
    'posthog.list_actions',
    'posthog.get_action',
    'posthog.list_events',
    'posthog.list_event_definitions',
    'posthog.list_property_definitions',
    'snowflake.browse_data',
    'snowflake.diagnose',
    'snowflake.get_object_details',
    'snowflake.get_query',
    'snowflake.get_session',
    'snowflake.list_dashboards',
    'snowflake.list_folders',
    'snowflake.list_schemas',
    'snowflake.list_shared_objects',
    'snowflake.list_tables',
    'snowflake.list_warehouses',
    'snowflake.list_worksheets',
    'snowflake.run_query',
    'snowflake.search_data',
    'starbucks.find_stores',
    'starbucks.get_cards',
    'starbucks.get_cart',
    'starbucks.get_current_user',
    'starbucks.get_earn_rates',
    'starbucks.get_favorite_products',
    'starbucks.get_feed',
    'starbucks.get_payment_methods',
    'starbucks.get_previous_orders',
    'starbucks.get_product',
    'starbucks.get_rewards',
    'starbucks.get_store_menu',
    'starbucks.get_store_time_slots',
    'starbucks.navigate_to_checkout',
    'starbucks.price_order',
    'todoist.get_comment',
    'todoist.get_label',
    'todoist.get_project',
    'todoist.get_section',
    'todoist.get_task',
    'todoist.list_collaborators',
    'todoist.list_comments',
    'todoist.list_labels',
    'todoist.list_projects',
    'todoist.list_sections',
    'todoist.list_shared_labels',
    'todoist.list_tasks',
    'ynab.get_account',
    'ynab.get_current_user',
    'ynab.get_month',
    'ynab.get_plan',
    'ynab.get_transaction',
    'ynab.list_accounts',
    'ynab.list_categories',
    'ynab.list_months',
    'ynab.list_payees',
    'ynab.list_scheduled_transactions',
    'ynab.list_transactions',
    'calendly.get_current_user',
    'calendly.get_event_type',
    'calendly.get_organization',
    'calendly.get_organization_statistics',
    'calendly.get_user_busy_times',
    'calendly.get_user_permissions',
    'calendly.list_calendar_accounts',
    'calendly.list_event_types',
    'calendly.list_scheduled_events',
    'dockerhub.get_current_user',
    'dockerhub.get_repository',
    'dockerhub.get_tag',
    'dockerhub.get_user_profile',
    'dockerhub.list_organizations',
    'dockerhub.list_repositories',
    'dockerhub.list_tags',
    'dockerhub.search_catalog',
    'dockerhub.search_repositories',
    'notebooklm.get_current_user',
    'notebooklm.get_notebook',
    'notebooklm.get_notebook_guide',
    'notebooklm.get_notes',
    'notebooklm.get_project_details',
    'notebooklm.list_chat_sessions',
    'notebooklm.list_notebooks',
    'notebooklm.list_sources',
    'notebooklm.navigate_to_notebook',
    'tinder.get_current_user',
    'tinder.get_fast_match_count',
    'tinder.get_fast_match_preview',
    'tinder.get_recommendations',
    'tinder.get_user',
    'tinder.list_matches',
    'aws.describe_instance',
    'aws.get_current_user',
    'aws.get_function',
    'aws.list_alarms',
    'aws.list_functions',
    'aws.list_iam_roles',
    'aws.list_iam_users',
    'aws.list_instances',
    'aws.list_log_groups',
    'aws.list_regions',
    'aws.list_security_groups',
    'aws.list_subnets',
    'aws.list_vpcs',
    'sentry.get_event',
    'sentry.get_issue',
    'sentry.get_organization',
    'sentry.get_project',
    'sentry.get_project_keys',
    'sentry.get_release',
    'sentry.list_alerts',
    'sentry.list_comments',
    'sentry.list_issue_events',
    'sentry.list_issue_tags',
    'sentry.list_members',
    'sentry.list_monitors',
    'sentry.list_organizations',
    'sentry.list_project_environments',
    'sentry.list_projects',
    'sentry.list_releases',
    'sentry.list_replays',
    'sentry.list_teams',
    'sentry.search_issues',
    'shopify.list_products',
    'shopify.get_product',
    'shopify.list_orders',
    'craigslist.get_current_user',
    'craigslist.get_saved_search_counts',
    'craigslist.list_renewable_postings',
    'craigslist.list_payment_cards',
    'craigslist.list_chat_conversations',
    'craigslist.get_chat_messages',
    'gcal.get_calendar',
    'gcal.get_colors',
    'gcal.get_event',
    'gcal.get_setting',
    'gcal.list_calendars',
    'gcal.list_event_instances',
    'gcal.list_events',
    'gcal.list_settings',
    'gcal.search_events',
    'gmaps.get_current_view',
    'gmaps.get_directions_info',
    'gmaps.get_directions_url',
    'gmaps.get_map_url',
    'gmaps.get_place_details',
    'gmaps.get_place_url',
    'gmaps.navigate_to_directions',
    'gmaps.navigate_to_location',
    'gmaps.navigate_to_place',
    'gmaps.navigate_to_search',
    'gmaps.search_nearby',
    'gmaps.search_places',
    'gmaps.share_location',
    'gmaps.toggle_layer',
    'gmaps.zoom_map',
    'ticketmaster.get_event',
    'ticketmaster.list_orders',
    'ticketmaster.search_events',
    'eventbrite.get_event',
    'eventbrite.list_orders',
    'eventbrite.search_events',
    'stubhub.get_listing',
    'stubhub.list_orders',
    'stubhub.search_events',
    'figma.get_current_user',
    'figma.get_file',
    'figma.get_file_components',
    'figma.get_team_info',
    'figma.list_comments',
    'figma.list_file_versions',
    'figma.list_files',
    'figma.list_recent_files',
    'figma.list_team_projects',
    'figma.list_teams',
    'glama.get_chat_session',
    'glama.get_current_user',
    'glama.get_server',
    'glama.get_server_score',
    'glama.list_available_models',
    'glama.list_gateway_models',
    'glama.list_mcp_clients',
    'glama.list_popular_servers',
    'glama.list_projects',
    'glama.list_recent_chats',
    'glama.list_server_categories',
    'glama.list_server_tools',
    'glama.list_servers_by_category',
    'glama.search_servers',
    'glama.search_tools',
    'linear.get_viewer',
    'linear.search_issues',
    'mastodon.get_status',
    'mastodon.list_timeline',
    'spotify.get_album',
    'spotify.get_artist',
    'spotify.get_available_devices',
    'spotify.get_current_user',
    'spotify.get_currently_playing',
    'spotify.get_playback_state',
    'spotify.get_playlist',
    'spotify.get_queue',
    'spotify.get_recently_played',
    'spotify.get_saved_tracks',
    'spotify.search',
    'twitch.get_channel_emotes',
    'twitch.get_current_user',
    'twitch.get_game',
    'twitch.get_game_clips',
    'twitch.get_stream',
    'twitch.get_streams_by_game',
    'twitch.get_top_games',
    'twitch.get_top_streams',
    'twitch.get_user_clips',
    'twitch.get_user_profile',
    'twitch.get_user_videos',
    'twitch.get_video',
    'twitch.search_categories',
    'twitch.search_channels',
  ];
  const readyOffenders = [];
  for (const slug of knownReady) {
    const row = bySlug(rows, slug);
    if (row && row.readiness !== 't1-ready') readyOffenders.push(slug + ' -> ' + row.readiness);
  }
  check(readyOffenders.length === 0,
    'known executable recipe/head slugs are t1-ready' +
    (readyOffenders.length ? ' -- ' + readyOffenders.join(', ') : ''));

  const stubhubUnsafe = [
    'stubhub.buy_tickets'
  ];
  const stubhubUnsafeOffenders = [];
  for (const slug of stubhubUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') stubhubUnsafeOffenders.push(slug);
  }
  check(stubhubUnsafeOffenders.length === 0,
    'StubHub money-moving ticket purchase row is not marked t1-ready' +
    (stubhubUnsafeOffenders.length ? ' -- ' + stubhubUnsafeOffenders.join(', ') : ''));

  const datadogUnsafe = [
    'datadog.clone_dashboard',
    'datadog.clone_monitor',
    'datadog.get_monitor_state_history',
    'datadog.query_timeseries',
    'datadog.search_logs',
    'datadog.aggregate_rum_events',
    'datadog.aggregate_spans',
    'datadog.cancel_downtime',
    'datadog.create_downtime',
    'datadog.create_monitor',
    'datadog.create_notebook',
    'datadog.delete_dashboard',
    'datadog.delete_monitor',
    'datadog.delete_notebook',
    'datadog.mute_host',
    'datadog.mute_monitor',
    'datadog.pause_synthetics_test',
    'datadog.search_rum_events',
    'datadog.search_security_signals',
    'datadog.search_spans',
    'datadog.trigger_synthetics_test',
    'datadog.unmute_host',
    'datadog.unmute_monitor',
    'datadog.update_monitor',
    'datadog.update_notebook'
  ];
  const datadogUnsafeOffenders = [];
  for (const slug of datadogUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') datadogUnsafeOffenders.push(slug);
  }
  check(datadogUnsafeOffenders.length === 0,
    'Datadog clone, POST-search, mutation, and destructive rows are not marked t1-ready' +
    (datadogUnsafeOffenders.length ? ' -- ' + datadogUnsafeOffenders.join(', ') : ''));

  const dominosUnsafe = [
    'dominos.create_cart',
    'dominos.add_product_to_cart',
    'dominos.add_deal_to_cart',
    'dominos.update_product_quantity',
    'dominos.remove_deal_from_cart',
    'dominos.navigate_to_checkout',
    'dominos.place_order_cash',
    'dominos.get_cart',
    'dominos.get_checkout_summary',
    'dominos.get_customer',
    'dominos.get_saved_addresses',
    'dominos.get_saved_cards',
    'dominos.get_loyalty_points',
    'dominos.get_loyalty_rewards',
  ];
  const dominosUnsafeOffenders = [];
  for (const slug of dominosUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') dominosUnsafeOffenders.push(slug);
  }
  check(dominosUnsafeOffenders.length === 0,
    "Domino's cart mutation/order/navigation/payment/account rows are not marked t1-ready" +
    (dominosUnsafeOffenders.length ? ' -- ' + dominosUnsafeOffenders.join(', ') : ''));

  const chipotleUnsafe = [
    'chipotle.get_current_user',
    'chipotle.get_extras_campaigns',
    'chipotle.get_favorites',
    'chipotle.get_last_restaurant',
    'chipotle.get_loyalty_points',
    'chipotle.get_menu_groups',
    'chipotle.get_payment_methods',
    'chipotle.get_promotions',
    'chipotle.get_recent_orders',
    'chipotle.get_reward_categories',
    'chipotle.get_rewards',
    'chipotle.find_restaurants'
  ];
  const chipotleUnsafeOffenders = [];
  for (const slug of chipotleUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') chipotleUnsafeOffenders.push(slug);
  }
  check(chipotleUnsafeOffenders.length === 0,
    'Chipotle customer/payment/rewards/order/local-state/search rows are not marked t1-ready' +
    (chipotleUnsafeOffenders.length ? ' -- ' + chipotleUnsafeOffenders.join(', ') : ''));

  const pandaUnsafe = [
    'pandaexpress.add_product_to_basket',
    'pandaexpress.apply_coupon',
    'pandaexpress.cancel_order',
    'pandaexpress.create_basket',
    'pandaexpress.get_basket',
    'pandaexpress.get_billing_accounts',
    'pandaexpress.get_checkout_summary',
    'pandaexpress.get_favorites',
    'pandaexpress.get_loyalty_rewards',
    'pandaexpress.get_recent_orders',
    'pandaexpress.get_user_profile',
    'pandaexpress.navigate_to_checkout',
    'pandaexpress.remove_coupon',
    'pandaexpress.update_product_quantity'
  ];
  const pandaUnsafeOffenders = [];
  for (const slug of pandaUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') pandaUnsafeOffenders.push(slug);
  }
  check(pandaUnsafeOffenders.length === 0,
    'Panda Express basket/checkout/coupon/profile/billing/loyalty/recent-order/navigation/mutation rows are not marked t1-ready' +
    (pandaUnsafeOffenders.length ? ' -- ' + pandaUnsafeOffenders.join(', ') : ''));

  const grubhubUnsafe = [
    'grubhub.cancel_order',
    'grubhub.place_order'
  ];
  const grubhubUnsafeOffenders = [];
  for (const slug of grubhubUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') grubhubUnsafeOffenders.push(slug);
  }
  check(grubhubUnsafeOffenders.length === 0,
    'Grubhub paid-order and cancellation rows are guarded, not marked t1-ready' +
    (grubhubUnsafeOffenders.length ? ' -- ' + grubhubUnsafeOffenders.join(', ') : ''));

  const grubhubGuarded = [];
  for (const slug of grubhubUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness !== 't1-guarded-fail-closed') {
      grubhubGuarded.push(slug + ' -> ' + row.readiness);
    }
  }
  check(grubhubGuarded.length === 0,
    'Grubhub paid-order and cancellation rows are t1-guarded-fail-closed' +
    (grubhubGuarded.length ? ' -- ' + grubhubGuarded.join(', ') : ''));

  const costcoUnsafe = [
    'costco.add_to_list',
    'costco.create_list',
    'costco.delete_list',
    'costco.geocode_location',
    'costco.get_current_user',
    'costco.get_list_items',
    'costco.get_lists',
    'costco.navigate_to_cart',
    'costco.navigate_to_checkout',
    'costco.navigate_to_product',
    'costco.navigate_to_search',
    'costco.remove_list_item',
    'costco.search_products'
  ];
  const costcoUnsafeOffenders = [];
  for (const slug of costcoUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') costcoUnsafeOffenders.push(slug);
  }
  check(costcoUnsafeOffenders.length === 0,
    'Costco account/list/cart/checkout/navigation/search/geocode/write rows are not marked t1-ready' +
    (costcoUnsafeOffenders.length ? ' -- ' + costcoUnsafeOffenders.join(', ') : ''));

  const instacartUnsafe = [
    'instacart.delete_cart',
    'instacart.get_location_context',
    'instacart.get_product',
    'instacart.navigate_to_checkout',
    'instacart.search_products',
    'instacart.update_cart_items'
  ];
  const instacartUnsafeOffenders = [];
  for (const slug of instacartUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') instacartUnsafeOffenders.push(slug);
  }
  check(instacartUnsafeOffenders.length === 0,
    'Instacart location/product-search/product-detail/checkout/write/destructive rows are not marked t1-ready' +
    (instacartUnsafeOffenders.length ? ' -- ' + instacartUnsafeOffenders.join(', ') : ''));

  const doordashUnsafe = [
    'doordash.bookmark_store',
    'doordash.mark_notifications_read',
    'doordash.unbookmark_store',
    'doordash.update_default_address',
    'doordash.update_profile'
  ];
  const doordashUnsafeOffenders = [];
  for (const slug of doordashUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') doordashUnsafeOffenders.push(slug);
  }
  check(doordashUnsafeOffenders.length === 0,
    'DoorDash favorite/profile/default-address/notification mutations are not marked t1-ready' +
    (doordashUnsafeOffenders.length ? ' -- ' + doordashUnsafeOffenders.join(', ') : ''));

  const targetUnsafe = [
    'target.add_to_cart',
    'target.apply_promo_code',
    'target.find_nearby_stores',
    'target.get_cart',
    'target.get_current_user',
    'target.get_loyalty_details',
    'target.get_order',
    'target.get_savings_summary',
    'target.get_shopping_list',
    'target.get_store',
    'target.list_favorites',
    'target.list_orders',
    'target.list_shopping_lists',
    'target.navigate_to_checkout',
    'target.remove_cart_item',
    'target.update_cart_item_quantity',
  ];
  const targetUnsafeOffenders = [];
  for (const slug of targetUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') targetUnsafeOffenders.push(slug);
  }
  check(targetUnsafeOffenders.length === 0,
    'Target cart/account/order/store/list/write rows are not marked t1-ready' +
    (targetUnsafeOffenders.length ? ' -- ' + targetUnsafeOffenders.join(', ') : ''));

  const homeDepotUnsafe = [
    'homedepot.get_current_user',
    'homedepot.navigate_to_checkout',
    'homedepot.navigate_to_product'
  ];
  const homeDepotUnsafeOffenders = [];
  for (const slug of homeDepotUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') homeDepotUnsafeOffenders.push(slug);
  }
  check(homeDepotUnsafeOffenders.length === 0,
    'Home Depot current-user and browser-navigation rows are not marked t1-ready' +
    (homeDepotUnsafeOffenders.length ? ' -- ' + homeDepotUnsafeOffenders.join(', ') : ''));

  const expediaUnsafe = [
    'expedia.get_current_user',
    'expedia.list_trips',
    'expedia.navigate_to_account',
    'expedia.navigate_to_trips',
    'expedia.search_hotels',
    'expedia.search_locations',
  ];
  const expediaUnsafeOffenders = [];
  for (const slug of expediaUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') expediaUnsafeOffenders.push(slug);
  }
  check(expediaUnsafeOffenders.length === 0,
    'Expedia account/trips/typeahead/GraphQL rows are not marked t1-ready' +
    (expediaUnsafeOffenders.length ? ' -- ' + expediaUnsafeOffenders.join(', ') : ''));

  const bookingUnsafe = [
    'booking.get_current_user',
    'booking.get_genius_status',
    'booking.list_trips',
    'booking.list_wishlists',
  ];
  const bookingUnsafeOffenders = [];
  for (const slug of bookingUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') bookingUnsafeOffenders.push(slug);
  }
  check(bookingUnsafeOffenders.length === 0,
    'Booking account/Genius/trips/wishlist rows are not marked t1-ready' +
    (bookingUnsafeOffenders.length ? ' -- ' + bookingUnsafeOffenders.join(', ') : ''));

  const airbnbUnsafe = [
    'airbnb.remove_from_wishlist',
  ];
  const airbnbUnsafeOffenders = [];
  for (const slug of airbnbUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') airbnbUnsafeOffenders.push(slug);
  }
  check(airbnbUnsafeOffenders.length === 0,
    'Airbnb destructive wishlist removal row is not marked t1-ready' +
    (airbnbUnsafeOffenders.length ? ' -- ' + airbnbUnsafeOffenders.join(', ') : ''));

  const chatgptUnsafe = [
    'chatgpt.archive_conversation',
    'chatgpt.delete_conversation',
    'chatgpt.rename_conversation',
    'chatgpt.star_conversation',
    'chatgpt.unarchive_conversation',
    'chatgpt.unstar_conversation',
    'chatgpt.update_custom_instructions',
  ];
  const chatgptUnsafeOffenders = [];
  for (const slug of chatgptUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') chatgptUnsafeOffenders.push(slug);
  }
  check(chatgptUnsafeOffenders.length === 0,
    'ChatGPT write/destructive rows are not marked t1-ready' +
    (chatgptUnsafeOffenders.length ? ' -- ' + chatgptUnsafeOffenders.join(', ') : ''));

  const newrelicUnsafe = [
    'newrelic.add_entity_tags',
    'newrelic.create_alert_policy',
    'newrelic.create_dashboard',
    'newrelic.create_nrql_condition',
    'newrelic.delete_alert_policy',
    'newrelic.delete_dashboard',
    'newrelic.delete_entity_tags',
    'newrelic.delete_nrql_condition',
    'newrelic.update_dashboard',
    'newrelic.update_nrql_condition',
  ];
  const newrelicUnsafeOffenders = [];
  for (const slug of newrelicUnsafe) {
    const row = bySlug(rows, slug);
    if (row && row.readiness === 't1-ready') newrelicUnsafeOffenders.push(slug);
  }
  check(newrelicUnsafeOffenders.length === 0,
    'New Relic mutation/destructive rows are not marked t1-ready' +
    (newrelicUnsafeOffenders.length ? ' -- ' + newrelicUnsafeOffenders.join(', ') : ''));

  const posthogGuarded = [
    'posthog.create_annotation',
    'posthog.create_dashboard',
    'posthog.create_experiment',
    'posthog.create_feature_flag',
    'posthog.create_insight',
    'posthog.run_query',
    'posthog.run_trends_query',
    'posthog.update_dashboard',
    'posthog.update_feature_flag',
    'posthog.update_insight',
    'posthog.delete_annotation',
    'posthog.delete_dashboard',
    'posthog.delete_feature_flag',
    'posthog.delete_insight',
  ];
  const posthogGuardedMismatches = [];
  for (const slug of posthogGuarded) {
    const row = bySlug(rows, slug);
    if (row && row.readiness !== 't1-guarded-fail-closed') {
      posthogGuardedMismatches.push(slug + ':' + row.readiness);
    }
  }
  check(posthogGuardedMismatches.length === 0,
    'PostHog write/query/destructive rows are guarded fail-closed' +
    (posthogGuardedMismatches.length ? ' -- ' + posthogGuardedMismatches.join(', ') : ''));

  const netflixRows = rows.filter(function(row) { return row && row.app === 'netflix'; });
  const netflixWriteRows = netflixRows.filter(function(row) {
    return row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
  });
  const netflixBlockedOffenders = netflixRows.filter(function(row) {
    return row.readiness !== 'blocked' ||
      row.originClass !== 'denied' ||
      row.routeFeasibility !== 'blocked' ||
      row.nextAction !== 'keep blocked' ||
      row.proof !== 'none' ||
      row.hasHandlerProof !== false ||
      row.hasRecipeProof !== false;
  });
  check(netflixRows.length === 18 &&
      netflixWriteRows.length === 3 &&
      netflixBlockedOffenders.length === 0,
    'Netflix descriptors have a checked blocked-policy terminal state, not executable T1' +
    (netflixBlockedOffenders.length ? ' -- ' + netflixBlockedOffenders.map(function(row) { return row.slug + ':' + row.readiness + '/' + row.originClass; }).join(', ') : ''));

  const youtubeRows = rows.filter(function(row) { return row && row.app === 'youtube'; });
  const youtubeWriteRows = youtubeRows.filter(function(row) {
    return row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
  });
  const youtubeDiscoveryOffenders = youtubeRows.filter(function(row) {
    const isWrite = row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
    return row.readiness !== 'discovery-pending' ||
      row.originClass !== 'sensitive' ||
      row.routeFeasibility !== (isWrite ? 'dom-discovery-only' : 'same-origin-read-candidate') ||
      row.nextAction !== (isWrite ? 'keep DOM/discovery' : 'same-origin read candidate') ||
      row.proof !== 'none' ||
      row.hasHandlerProof !== false ||
      row.hasRecipeProof !== false;
  });
  check(youtubeRows.length === 18 &&
      youtubeWriteRows.length === 8 &&
      youtubeDiscoveryOffenders.length === 0,
    'YouTube descriptors are governed sensitive discovery-pending rows, not hard-blocked T1' +
    (youtubeDiscoveryOffenders.length ? ' -- ' + youtubeDiscoveryOffenders.map(function(row) { return row.slug + ':' + row.readiness + '/' + row.originClass; }).join(', ') : ''));

  const ytmusicRows = rows.filter(function(row) {
    return row && row.app === 'ytmusic' && row.service === 'music.youtube.com';
  });
  const ytmusicWriteRows = ytmusicRows.filter(function(row) {
    return row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
  });
  const ytmusicDiscoveryOffenders = ytmusicRows.filter(function(row) {
    const isWrite = row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
    return row.readiness !== 'discovery-pending' ||
      row.originClass !== 'sensitive' ||
      row.routeFeasibility !== (isWrite ? 'dom-discovery-only' : 'same-origin-read-candidate') ||
      row.nextAction !== (isWrite ? 'keep DOM/discovery' : 'same-origin read candidate') ||
      row.proof !== 'none' ||
      row.hasHandlerProof !== false ||
      row.hasRecipeProof !== false;
  });
  check(ytmusicRows.length === 15 &&
      ytmusicWriteRows.length === 5 &&
      ytmusicDiscoveryOffenders.length === 0,
    'YouTube Music ytmusic descriptors are governed sensitive discovery-pending rows, not hard-blocked T1' +
    (ytmusicDiscoveryOffenders.length ? ' -- ' + ytmusicDiscoveryOffenders.map(function(row) { return row.slug + ':' + row.readiness + '/' + row.originClass; }).join(', ') : ''));

  const onlyfansRows = rows.filter(function(row) { return row && row.app === 'onlyfans'; });
  const onlyfansWriteRows = onlyfansRows.filter(function(row) {
    return row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
  });
  const onlyfansBlockedOffenders = onlyfansRows.filter(function(row) {
    return row.readiness !== 'blocked' ||
      row.originClass !== 'denied' ||
      row.routeFeasibility !== 'blocked' ||
      row.nextAction !== 'keep blocked' ||
      row.proof !== 'none' ||
      row.hasHandlerProof !== false ||
      row.hasRecipeProof !== false;
  });
  check(onlyfansRows.length === 21 &&
      onlyfansWriteRows.length === 3 &&
      onlyfansBlockedOffenders.length === 0,
    'OnlyFans descriptors have a checked blocked-policy terminal state, not executable T1' +
    (onlyfansBlockedOffenders.length ? ' -- ' + onlyfansBlockedOffenders.map(function(row) { return row.slug + ':' + row.readiness + '/' + row.originClass; }).join(', ') : ''));

  const steamRows = rows.filter(function(row) {
    return row && row.app === 'steam' && row.service === 'store.steampowered.com';
  });
  const steamWriteRows = steamRows.filter(function(row) {
    return row.sideEffectClass === 'write' || row.sideEffectClass === 'destructive';
  });
  const steamGuardedSlugs = {
    'steam.add_to_wishlist': true,
    'steam.follow_app': true,
    'steam.generate_discovery_queue': true,
    'steam.ignore_app': true,
    'steam.remove_from_wishlist': true,
    'steam.unignore_app': true,
  };
  const steamGuardedRows = steamRows.filter(function(row) { return steamGuardedSlugs[row.slug]; });
  const steamReadyRows = steamRows.filter(function(row) { return !steamGuardedSlugs[row.slug]; });
  const steamStatusOffenders = steamRows.filter(function(row) {
    const expectedReadiness = steamGuardedSlugs[row.slug] ? 't1-guarded-fail-closed' : 't1-ready';
    const expectedAction = steamGuardedSlugs[row.slug]
      ? (row.sideEffectClass === 'read' ? 'live request-shape proof' : 'live mutation-body UAT')
      : 'already executable';
    return row.readiness !== expectedReadiness ||
      row.originClass !== 'sensitive' ||
      row.routeFeasibility !== 'same-origin-proven' ||
      row.nextAction !== expectedAction ||
      row.resolvedTier !== 'T1a' ||
      row.proof !== 'handler' ||
      row.hasHandlerProof !== true ||
      row.hasRecipeProof !== false;
  });
  check(steamRows.length === 15 &&
      steamWriteRows.length === 6 &&
      steamGuardedRows.length === 6 &&
      steamReadyRows.length === 9 &&
      steamStatusOffenders.length === 0,
    'Steam descriptors have sensitive-origin T1a handler proof with ready reads and guarded fail-closed writes/actions' +
    (steamStatusOffenders.length ? ' -- ' + steamStatusOffenders.map(function(row) { return row.slug + ':' + row.readiness + '/' + row.originClass + '/' + row.proof; }).join(', ') : ''));

  const guarded = [
    'github.issues.create',
    'amazon.cancel_order',
    'amazon.place_order',
    'etsy.add_to_cart',
    'etsy.checkout',
    'gitlab.create_issue',
    'gitlab.create_merge_request',
    'gitlab.create_note',
    'gitlab.merge_merge_request',
    'gitlab.update_issue',
    'gitlab.update_merge_request',
    'slack.add_reaction',
    'slack.create_channel',
    'slack.delete_message',
    'slack.edit_message',
    'slack.invite_to_channel',
    'slack.open_dm',
    'slack.pin_message',
    'slack.remove_reaction',
    'slack.send_message',
    'slack.set_channel_purpose',
    'slack.set_channel_topic',
    'slack.unpin_message',
    'slack.upload_file',
    'bitbucket.approve_pull_request',
    'bitbucket.create_branch',
    'bitbucket.create_pr_comment',
    'bitbucket.create_pull_request',
    'bitbucket.create_repository',
    'bitbucket.decline_pull_request',
    'bitbucket.delete_branch',
    'bitbucket.merge_pull_request',
    'bitbucket.update_pull_request',
    'circleci.approve_job',
    'circleci.cancel_job',
    'circleci.cancel_workflow',
    'circleci.create_context',
    'circleci.create_env_var',
    'circleci.create_schedule',
    'circleci.delete_context',
    'circleci.delete_env_var',
    'circleci.delete_schedule',
    'circleci.rerun_workflow',
    'circleci.trigger_pipeline',
    'circleci.update_schedule',
    'retool.add_component',
    'retool.add_query',
    'retool.change_user_name',
    'retool.clone_app',
    'retool.create_app',
    'retool.create_app_from_toolscript_archive',
    'retool.create_folder',
    'retool.create_resource',
    'retool.create_resource_folder',
    'retool.delete_app',
    'retool.delete_folder',
    'retool.delete_resource_folder',
    'retool.export_toolscript_archive',
    'retool.force_editor_save',
    'retool.list_workflow_runs',
    'retool.lookup_app',
    'retool.move_resource_to_folder',
    'retool.rename_folder',
    'retool.run_grpc',
    'retool.run_query',
    'retool.save_page',
    'retool.update_app_from_toolscript_archive',
    'instagram.create_comment',
    'instagram.follow_user',
    'instagram.get_home_feed',
    'instagram.get_suggested_users',
    'instagram.like_post',
    'instagram.save_post',
    'instagram.send_message',
    'instagram.unfollow_user',
    'instagram.unlike_post',
    'instagram.unsave_post',
    'tiktok.get_current_user',
    'tiktok.get_followers',
    'tiktok.get_following',
    'tiktok.get_for_you_feed',
    'tiktok.get_notifications',
    'tiktok.search_users',
    'tiktok.search_videos',
    'facebook.confirm_friend_request',
    'facebook.delete_friend_request',
    'facebook.react_to_post',
    'threads.create_thread',
    'medium.clap_post',
    'medium.follow_tag',
    'medium.follow_user',
    'medium.unfollow_tag',
    'medium.unfollow_user',
    'netlify.create_build',
    'netlify.create_build_hook',
    'netlify.create_deploy_key',
    'netlify.create_dns_record',
    'netlify.create_dns_zone',
    'netlify.create_env_vars',
    'netlify.create_site',
    'netlify.delete_build_hook',
    'netlify.delete_dns_record',
    'netlify.delete_env_var',
    'netlify.delete_hook',
    'netlify.delete_site',
    'netlify.delete_submission',
    'netlify.lock_deploy',
    'netlify.restore_deploy',
    'netlify.rollback_deploy',
    'netlify.unlock_deploy',
    'netlify.update_env_var',
    'netlify.update_site',
    'cockroachdb.create_database_user',
    'cockroachdb.delete_cluster',
    'cockroachdb.delete_database_user',
    'cockroachdb.execute_sql',
    'cockroachdb.set_delete_protection',
    'msword.append_to_document',
    'msword.copy_item',
    'msword.create_document',
    'msword.create_folder',
    'msword.create_sharing_link',
    'msword.delete_item',
    'msword.delete_permission',
    'msword.get_preview_url',
    'msword.move_item',
    'msword.rename_item',
    'msword.replace_text_in_document',
    'msword.restore_version',
    'msword.update_document',
    'msword.update_file_content',
    'msword.upload_file',
    'excel.add_named_item',
    'excel.add_table_column',
    'excel.add_table_row',
    'excel.add_worksheet',
    'excel.calculate_workbook',
    'excel.clear_range',
    'excel.create_chart',
    'excel.create_table',
    'excel.delete_chart',
    'excel.delete_range',
    'excel.delete_table',
    'excel.delete_table_row',
    'excel.delete_worksheet',
    'excel.evaluate_formula',
    'excel.insert_range',
    'excel.reauthenticate',
    'excel.sort_range',
    'excel.update_range',
    'excel.update_worksheet',
    'discord.add_reaction',
    'discord.create_channel',
    'discord.create_thread',
    'discord.delete_channel',
    'discord.delete_message',
    'discord.edit_channel',
    'discord.edit_message',
    'discord.open_dm',
    'discord.pin_message',
    'discord.remove_reaction',
    'discord.send_message',
    'discord.unpin_message',
    'discord.upload_file',
    'telegram.add_contact',
    'telegram.create_group',
    'telegram.delete_contact',
    'telegram.delete_messages',
    'telegram.edit_message',
    'telegram.forward_messages',
    'telegram.mark_conversation_read',
    'telegram.pin_message',
    'telegram.send_message',
    'telegram.set_typing',
    'telegram.unpin_message',
    'lucid.create_document',
    'lucid.create_folder',
    'lucid.delete_folder',
    'lucid.move_document_to_folder',
    'lucid.rename_folder',
    'lucid.trash_document',
    'starbucks.add_favorite_product',
    'starbucks.add_product_to_cart',
    'starbucks.delete_favorite_product',
    'starbucks.toggle_favorite_store',
    'starbucks.update_product_quantity',
    'grubhub.cancel_order',
    'grubhub.place_order',
    'powerpoint.copy_item',
    'powerpoint.create_folder',
    'powerpoint.create_presentation',
    'powerpoint.create_sharing_link',
    'powerpoint.delete_item',
    'powerpoint.delete_permission',
    'powerpoint.delete_slide',
    'powerpoint.get_preview_url',
    'powerpoint.move_item',
    'powerpoint.rename_item',
    'powerpoint.update_slide_notes',
    'powerpoint.update_slide_text',
    'outlook.create_draft',
    'outlook.create_event',
    'outlook.delete_event',
    'outlook.delete_message',
    'outlook.forward_message',
    'outlook.get_schedule',
    'outlook.move_message',
    'outlook.reply_to_message',
    'outlook.respond_to_event',
    'outlook.send_message',
    'outlook.update_event',
    'outlook.update_message',
    'todoist.archive_project',
    'todoist.close_task',
    'todoist.create_comment',
    'todoist.create_label',
    'todoist.create_project',
    'todoist.create_section',
    'todoist.create_task',
    'todoist.delete_comment',
    'todoist.delete_label',
    'todoist.delete_project',
    'todoist.delete_section',
    'todoist.delete_task',
    'todoist.remove_shared_label',
    'todoist.rename_shared_label',
    'todoist.reopen_task',
    'todoist.unarchive_project',
    'todoist.update_comment',
    'todoist.update_label',
    'todoist.update_project',
    'todoist.update_section',
    'todoist.update_task',
    'ynab.create_category',
    'ynab.create_category_group',
    'ynab.create_transaction',
    'ynab.delete_category',
    'ynab.delete_category_group',
    'ynab.delete_transaction',
    'ynab.move_category_budget',
    'ynab.snooze_category_goal',
    'ynab.update_category',
    'ynab.update_category_budget',
    'ynab.update_transaction',
    'airtable.create_comment',
    'airtable.update_cell',
    'calendly.activate_event_type',
    'calendly.clone_event_type',
    'calendly.create_event_type',
    'calendly.deactivate_event_type',
    'calendly.delete_event_type',
    'calendly.update_event_type',
    'notebooklm.add_source_text',
    'notebooklm.add_source_url',
    'notebooklm.copy_notebook',
    'notebooklm.create_note',
    'notebooklm.create_notebook',
    'notebooklm.delete_notebook',
    'notebooklm.delete_notes',
    'notebooklm.delete_sources',
    'notebooklm.rename_notebook',
    'notebooklm.update_note',
    'tinder.get_metadata',
    'tinder.get_updates',
    'tinder.like_message',
    'tinder.like_user',
    'tinder.pass_user',
    'tinder.send_message',
    'tinder.super_like_user',
    'tinder.unmatch',
    'tinder.update_location',
    'tinder.update_profile',
    'sentry.create_comment',
    'sentry.update_issue',
    'posthog.create_annotation',
    'posthog.create_dashboard',
    'posthog.create_experiment',
    'posthog.create_feature_flag',
    'posthog.create_insight',
    'posthog.run_query',
    'posthog.run_trends_query',
    'posthog.update_dashboard',
    'posthog.update_feature_flag',
    'posthog.update_insight',
    'posthog.delete_annotation',
    'posthog.delete_dashboard',
    'posthog.delete_feature_flag',
    'posthog.delete_insight',
    'shopify.create_order',
    'shopify.cancel_order',
    'gcal.create_calendar',
    'gcal.create_event',
    'gcal.delete_calendar',
    'gcal.delete_event',
    'gcal.move_event',
    'gcal.query_freebusy',
    'gcal.quick_add_event',
    'gcal.update_calendar',
    'gcal.update_event',
    'claude.create_conversation',
    'claude.create_project',
    'claude.delete_conversation',
    'claude.delete_project',
    'claude.send_message',
    'claude.update_conversation',
    'claude.update_project',
    'gemini.create_conversation',
    'gemini.send_message',
    'craigslist.renew_all_postings',
    'craigslist.set_default_payment_card',
    'craigslist.delete_payment_card',
    'kayak.create_price_alert',
    'ticketmaster.buy_tickets',
    'eventbrite.register_for_event',
    'zendesk.add_ticket_comment',
    'zendesk.create_ticket',
    'zendesk.delete_ticket',
    'zendesk.update_ticket',
    'figma.create_file',
    'figma.update_file',
    'figma.trash_file',
    'figma.post_comment',
    'linear.create_issue',
    'linear.delete_issue',
    'aws.invoke_function',
    'aws.start_instance',
    'aws.stop_instance',
    'homedepot.add_to_cart',
    'mastodon.create_status',
    'mastodon.delete_status',
    'opentable.reserve_table',
    'opentable.cancel_reservation',
    'fiverr.send_message',
    'spotify.add_to_queue',
    'spotify.pause_playback',
    'spotify.seek_to_position',
    'spotify.set_repeat_mode',
    'spotify.set_volume',
    'spotify.skip_to_next',
    'spotify.skip_to_previous',
    'spotify.start_playback',
    'spotify.toggle_shuffle',
    'spotify.transfer_playback',
    'gmaps.set_travel_mode',
    'robinhood.create_watchlist',
    'robinhood.delete_watchlist',
    'steam.add_to_wishlist',
    'steam.follow_app',
    'steam.generate_discovery_queue',
    'steam.ignore_app',
    'steam.remove_from_wishlist',
    'steam.unignore_app',
  ];
  const guardedOffenders = [];
  for (const slug of guarded) {
    const row = bySlug(rows, slug);
    if (!row || row.readiness !== 't1-guarded-fail-closed') {
      guardedOffenders.push(slug + ' -> ' + (row ? row.readiness : 'missing'));
    }
  }
  check(guardedOffenders.length === 0,
    'known guarded rows are t1-guarded-fail-closed, not t1-ready' +
    (guardedOffenders.length ? ' -- ' + guardedOffenders.join(', ') : ''));

  const domResolvedT3Offenders = rows.filter(function(row) {
    return row.backing === 'dom' &&
      row.resolvedTier === 'T3' &&
      row.originClass !== 'denied' &&
      row.readiness !== 'discovery-pending';
  });
  check(domResolvedT3Offenders.length === 0,
    'backing:dom rows resolved to T3 remain discovery-pending unless a stronger state exists' +
    (domResolvedT3Offenders.length ? ' -- ' + domResolvedT3Offenders.slice(0, 5).map(function(row) { return row.slug; }).join(', ') : ''));

  const learnCatalog = {
    recipes: catalog.recipes,
    descriptors: catalog.descriptors.concat([{
      slug: 'phase44.synthetic_learn',
      service: 'example.com',
      sideEffectClass: 'read',
      backing: 'learn',
      intentSynonyms: ['phase 44 synthetic learn'],
      description: 'Synthetic learn-pending descriptor for report tests',
      actionVerb: 'read',
    }]),
  };
  const learnReport = mod.reportReadiness(learnCatalog);
  const learnRow = bySlug(learnReport.rows, 'phase44.synthetic_learn');
  check(learnRow && learnRow.readiness === 'learn-pending' && learnRow.resolvedTier === 'T2',
    'backing:learn rows are learn-pending');

  const badReady = rows.filter(function(row) {
    return row.readiness === 't1-ready' &&
      (['T0', 'T1a', 'T1b'].indexOf(row.resolvedTier) === -1 || !(row.hasHandlerProof || row.hasRecipeProof));
  });
  check(badReady.length === 0,
    'no t1-ready row lacks T0/T1a/T1b handler/recipe proof' +
    (badReady.length ? ' -- ' + badReady.map(function(row) { return row.slug; }).join(', ') : ''));

  console.log('\nt1-readiness-report: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: t1-readiness-report threw:', err && err.message ? err.message : err);
  process.exit(1);
});

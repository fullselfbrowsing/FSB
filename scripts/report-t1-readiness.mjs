#!/usr/bin/env node
/**
 * Phase 44 / Plan 01 (v1.1.0 T1 App Execution Expansion) -- T1 readiness
 * matrix generator.
 *
 * The report is generated from the shipped catalog plus the same capability
 * resolver used by invoke_capability. It is intentionally conservative: a row is
 * t1-ready only when resolve() reaches a T0/T1a/T1b recipe or handler proof, and
 * known guarded rows stay fail-closed until live proof promotes them.
 *
 * Run: node scripts/report-t1-readiness.mjs
 */

'use strict';

import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export const PHASE_DIR = join(ROOT, '.planning', 'phases', '44-t1-readiness-inventory-status-surface');
export const JSON_OUT = join(PHASE_DIR, '44-T1-READINESS.json');
export const MD_OUT = join(PHASE_DIR, '44-T1-READINESS.md');

export const READINESS_STATUSES = [
  't1-ready',
  't1-guarded-fail-closed',
  'learn-pending',
  'discovery-pending',
  'blocked',
  'unknown',
];

export const GUARDED_FAIL_CLOSED_SLUGS = [
  'github.issues.create',
  'amazon.cancel_order',
  'amazon.place_order',
  'azure.create_deployment',
  'azure.create_lock',
  'azure.create_resource_group',
  'azure.delete_deployment',
  'azure.delete_lock',
  'azure.delete_resource',
  'azure.delete_resource_group',
  'airtable.create_comment',
  'airtable.update_cell',
  'etsy.add_to_cart',
  'etsy.checkout',
  'gcal.create_calendar',
  'gcal.create_event',
  'gcal.delete_calendar',
  'gcal.delete_event',
  'gcal.move_event',
  'gcal.query_freebusy',
  'gcal.quick_add_event',
  'gcal.update_calendar',
  'gcal.update_event',
  'gmaps.set_travel_mode',
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
  'robinhood.create_watchlist',
  'robinhood.delete_watchlist',
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
  'jira.add_comment',
  'jira.add_watcher',
  'jira.assign_issue',
  'jira.create_issue',
  'jira.delete_issue',
  'jira.link_issues',
  'jira.transition_issue',
  'jira.update_issue',
  'confluence.add_label',
  'confluence.create_comment',
  'confluence.create_inline_comment',
  'confluence.create_page',
  'confluence.delete_comment',
  'confluence.delete_page',
  'confluence.remove_label',
  'confluence.update_page',
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
  'terraform.apply_run',
  'terraform.cancel_run',
  'terraform.create_project',
  'terraform.create_run',
  'terraform.create_variable',
  'terraform.create_variable_set',
  'terraform.create_workspace',
  'terraform.delete_project',
  'terraform.delete_variable',
  'terraform.delete_variable_set',
  'terraform.delete_workspace',
  'terraform.discard_run',
  'terraform.lock_workspace',
  'terraform.unlock_workspace',
  'terraform.update_project',
  'terraform.update_variable',
  'terraform.update_workspace',
  'twilio.create_api_key',
  'twilio.create_application',
  'twilio.create_call',
  'twilio.create_messaging_service',
  'twilio.create_verify_service',
  'twilio.delete_api_key',
  'twilio.delete_message',
  'twilio.delete_recording',
  'twilio.send_message',
  'twilio.update_call',
  'twilio.update_phone_number',
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
  'tumblr.add_filtered_tag',
  'tumblr.block_blog',
  'tumblr.create_post',
  'tumblr.delete_post',
  'tumblr.edit_post',
  'tumblr.follow_blog',
  'tumblr.like_post',
  'tumblr.reblog_post',
  'tumblr.remove_filtered_tag',
  'tumblr.unblock_blog',
  'tumblr.unfollow_blog',
  'tumblr.unlike_post',
  'mongodb.add_ip_access_entry',
  'mongodb.create_database_user',
  'mongodb.delete_database_user',
  'mongodb.delete_ip_access_entry',
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
  'pinterest.create_board',
  'pinterest.create_board_section',
  'pinterest.create_pin',
  'pinterest.delete_board',
  'pinterest.delete_board_section',
  'pinterest.delete_pin',
  'pinterest.follow_user',
  'pinterest.save_pin',
  'pinterest.unfollow_user',
  'pinterest.update_board',
  'medium.clap_post',
  'medium.follow_tag',
  'medium.follow_user',
  'medium.unfollow_tag',
  'medium.unfollow_user',
  'coinbase.add_watchlist_item',
  'coinbase.create_price_alert',
  'coinbase.create_watchlist',
  'coinbase.delete_price_alert',
  'coinbase.delete_watchlist',
  'coinbase.remove_watchlist_item',
  'starbucks.add_favorite_product',
  'starbucks.add_product_to_cart',
  'starbucks.delete_favorite_product',
  'starbucks.toggle_favorite_store',
  'starbucks.update_product_quantity',
  'homedepot.add_to_cart',
  'grubhub.cancel_order',
  'grubhub.place_order',
  'whatsapp.archive_chat',
  'whatsapp.block_contact',
  'whatsapp.clear_chat',
  'whatsapp.create_group',
  'whatsapp.delete_chat',
  'whatsapp.delete_message',
  'whatsapp.mark_chat_read',
  'whatsapp.mute_chat',
  'whatsapp.pin_chat',
  'whatsapp.revoke_group_invite_link',
  'whatsapp.revoke_message',
  'whatsapp.send_message',
  'whatsapp.star_message',
  'whatsapp.unblock_contact',
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
  'opentable.reserve_table',
  'opentable.cancel_reservation',
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
  'ebay.watch_item',
  'lucid.create_document',
  'lucid.create_folder',
  'lucid.delete_folder',
  'lucid.move_document_to_folder',
  'lucid.rename_folder',
  'lucid.trash_document',
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
  'onenote.create_notebook',
  'onenote.create_page',
  'onenote.create_section',
  'onenote.create_section_group',
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
  'calendly.activate_event_type',
  'calendly.clone_event_type',
  'calendly.create_event_type',
  'calendly.deactivate_event_type',
  'calendly.delete_event_type',
  'calendly.update_event_type',
  'dockerhub.create_repository',
  'dockerhub.update_repository',
  'dockerhub.delete_repository',
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
  'posthog.delete_annotation',
  'posthog.delete_dashboard',
  'posthog.delete_feature_flag',
  'posthog.delete_insight',
  'posthog.run_query',
  'posthog.run_trends_query',
  'posthog.update_dashboard',
  'posthog.update_feature_flag',
  'posthog.update_insight',
  'supabase.create_secrets',
  'supabase.delete_function',
  'supabase.delete_secrets',
  'supabase.pause_project',
  'supabase.restore_project',
  'supabase.run_query',
  'supabase.run_read_only_query',
  'aws.invoke_function',
  'aws.start_instance',
  'aws.stop_instance',
  'gcloud.disable_service',
  'gcloud.enable_service',
  'gcloud.get_iam_policy',
  'gcloud.list_log_entries',
  'gcloud.start_instance',
  'gcloud.stop_instance',
  'shopify.create_order',
  'shopify.cancel_order',
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
  'kayak.create_price_alert',
  'craigslist.renew_all_postings',
  'craigslist.set_default_payment_card',
  'craigslist.delete_payment_card',
  'claude.create_conversation',
  'claude.create_project',
  'claude.delete_conversation',
  'claude.delete_project',
  'claude.send_message',
  'claude.update_conversation',
  'claude.update_project',
  'minimax.add_mcp_server',
  'minimax.create_cron_job',
  'minimax.delete_chat',
  'minimax.delete_expert',
  'minimax.execute_cron_job',
  'minimax.get_chat_detail',
  'minimax.get_credit_details',
  'minimax.get_cron_job',
  'minimax.get_expert',
  'minimax.get_gallery_detail',
  'minimax.get_membership_info',
  'minimax.get_workspace',
  'minimax.list_chats',
  'minimax.list_cron_executions',
  'minimax.list_cron_jobs',
  'minimax.list_expert_tags',
  'minimax.list_experts',
  'minimax.list_gallery_categories',
  'minimax.list_gallery_feed',
  'minimax.list_homepage_experts',
  'minimax.list_mcp_servers',
  'minimax.list_workspace_members',
  'minimax.new_session',
  'minimax.pin_expert',
  'minimax.remove_mcp_server',
  'minimax.rename_chat',
  'minimax.search_chats',
  'minimax.send_message',
  'minimax.update_cron_job',
  'minimax.vote_expert',
  'teams.create_chat',
  'teams.delete_message',
  'teams.edit_message',
  'teams.invite_to_channel',
  'teams.remove_member',
  'teams.send_message',
  'teams.set_channel_topic',
  'ticketmaster.buy_tickets',
  'eventbrite.register_for_event',
  'lyft.request_ride',
  'lyft.cancel_ride',
  'zendesk.add_ticket_comment',
  'zendesk.create_ticket',
  'zendesk.delete_ticket',
  'zendesk.update_ticket',
  'figma.create_file',
  'figma.update_file',
  'figma.trash_file',
  'figma.post_comment',
  'ubereats.place_order',
  'ubereats.cancel_order',
  'gemini.create_conversation',
  'gemini.send_message',
  'gdrive.copy_file',
  'gdrive.create_file',
  'gdrive.create_folder',
  'gdrive.create_permission',
  'gdrive.delete_file',
  'gdrive.delete_permission',
  'gdrive.empty_trash',
  'gdrive.move_file',
  'gdrive.restore_file',
  'gdrive.trash_file',
  'gdrive.update_file',
  'gdocs.copy_document',
  'gdocs.create_comment',
  'gdocs.create_document',
  'gdocs.delete_comment',
  'gdocs.delete_document',
  'gdocs.delete_reply',
  'gdocs.reopen_comment',
  'gdocs.reply_to_comment',
  'gdocs.resolve_comment',
  'gdocs.restore_document',
  'gdocs.trash_document',
  'gdocs.update_document_title',
  'gsheets.update_values',
  'gsheets.append_values',
  'gsheets.clear_values',
  'linear.add_issue_label',
  'linear.add_issue_subscriber',
  'linear.archive_issue',
  'linear.batch_update_issues',
  'linear.create_attachment',
  'linear.create_comment',
  'linear.create_document',
  'linear.create_initiative',
  'linear.create_issue',
  'linear.create_issue_relation',
  'linear.create_label',
  'linear.create_milestone',
  'linear.create_project',
  'linear.create_project_update',
  'linear.delete_attachment',
  'linear.delete_comment',
  'linear.delete_issue',
  'linear.delete_issue_relation',
  'linear.delete_label',
  'linear.delete_project_update',
  'linear.move_issue_to_project',
  'linear.remove_issue_label',
  'linear.remove_issue_subscriber',
  'linear.set_issue_cycle',
  'linear.update_comment',
  'linear.update_document',
  'linear.update_initiative',
  'linear.update_issue',
  'linear.update_label',
  'linear.update_milestone',
  'linear.update_project',
  'linkedin.send_message',
  'mastodon.create_status',
  'mastodon.delete_status',
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
  'steam.add_to_wishlist',
  'steam.follow_app',
  'steam.generate_discovery_queue',
  'steam.ignore_app',
  'steam.remove_from_wishlist',
  'steam.unignore_app',
];

const HANDLER_MODULES = [
  'github.js',
  'slack.js',
  'notion.js',
  'gitlab.js',
  'netlify.js',
  'bitbucket.js',
  'jira.js',
  'confluence.js',
  'circleci.js',
  'vercel.js',
  'retool.js',
  'asana.js',
  'robinhood.js',
  'fidelity.js',
  'shortcut.js',
  'leetcode.js',
  'wikipedia.js',
  'hackernews.js',
  'reddit.js',
  'npm.js',
  'yelp.js',
  'tripadvisor.js',
  'zillow.js',
  'redfin.js',
  'bsky.js',
  'mastodon.js',
  'meticulous.js',
  'stripe.js',
  'coinbase.js',
  'carta.js',
  'x.js',
  'instagram.js',
  'tiktok.js',
  'facebook.js',
  'threads.js',
  'stackoverflow.js',
  'cloudflare.js',
  'terraform.js',
  'twilio.js',
  'tumblr.js',
  'priceline.js',
  'airbnb.js',
  'airtable.js',
  'aws.js',
  'gcloud.js',
  'expedia.js',
  'booking.js',
  'stubhub.js',
  'kayak.js',
  'opentable.js',
  'mongodb.js',
  'snowflake.js',
  'cockroachdb.js',
  'clickhouse.js',
  'temporal.js',
  'msword.js',
  'excel.js',
  'pinterest.js',
  'starbucks.js',
  'medium.js',
  'dominos.js',
  'whatsapp.js',
  'telegram.js',
  'amplitude.js',
  'newrelic.js',
  'grafana.js',
  'datadog.js',
  'posthog.js',
  'chipotle.js',
  'pandaexpress.js',
  'grubhub.js',
  'costco.js',
  'instacart.js',
  'ubereats.js',
  'uber.js',
  'doordash.js',
  'lyft.js',
  'lucid.js',
  'linear.js',
  'linkedin.js',
  'clickup.js',
  'discord.js',
  'target.js',
  'walmart.js',
  'ebay.js',
  'amazon.js',
  'azure.js',
  'etsy.js',
  'homedepot.js',
  'hack2hire.js',
  'chatgpt.js',
  'claude.js',
  'gemini.js',
  'minimax.js',
  'ganalytics.js',
  'figma.js',
  'gdrive.js',
  'gdocs.js',
  'gsheets.js',
  'powerpoint.js',
  'outlook.js',
  'teams.js',
  'onenote.js',
  'todoist.js',
  'webflow.js',
  'ynab.js',
  'calendly.js',
  'dockerhub.js',
  'tinder.js',
  'sentry.js',
  'supabase.js',
  'shopify.js',
  'notebooklm.js',
  'gcal.js',
  'gmaps.js',
  'craigslist.js',
  'eventbrite.js',
  'ticketmaster.js',
  'zendesk.js',
  'spotify.js',
  'twitch.js',
  'steam.js',
  'fiverr.js',
  'glama.js',
];
const EXECUTABLE_TIERS = new Set(['T0', 'T1a', 'T1b']);
const GUARDED_SET = new Set(GUARDED_FAIL_CLOSED_SLUGS);

function normalizeBacking(value) {
  const b = String(value || '').toLowerCase();
  if (b === 'recipe' || b === 'handler' || b === 'learn' || b === 'dom') return b;
  return 'dom';
}

function normalizeSideEffectClass(value) {
  const c = String(value || '').toLowerCase();
  if (c === 'destructive' || c === 'delete') return 'destructive';
  if (c === 'mutate' || c === 'mutating' || c === 'write' || c === 'writes') return 'write';
  return 'read';
}

function appFromSlug(slug) {
  const s = String(slug || '');
  if (s.indexOf('opentabs__') === 0) {
    const parts = s.split('__');
    return parts[1] || s;
  }
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot);
}

function originForService(service) {
  const raw = String(service || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return safeOrigin(raw);
  return safeOrigin('https://' + raw);
}

function safeOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch (_e) { return ''; }
}

function safeHost(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch (_e) { return ''; }
}

function sameSiteHost(a, b) {
  const ah = safeHost(a);
  const bh = safeHost(b);
  if (!ah || !bh) return false;
  return ah === bh || ah.endsWith('.' + bh) || bh.endsWith('.' + ah);
}

export function loadCatalog() {
  return require(join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js'));
}

function buildResolver(catalog) {
  globalThis.FsbRecipeIndex = catalog;

  for (const mod of HANDLER_MODULES) {
    try {
      require(join(ROOT, 'extension', 'catalog', 'handlers', mod));
    } catch (_e) {
      // Best-effort. Missing handler modules cause their slugs to fail the gate
      // instead of being reported ready.
    }
  }

  const CAT = require(join(ROOT, 'extension', 'utils', 'capability-catalog.js'));
  if (CAT && typeof CAT.seedHeadHandlers === 'function') {
    try { CAT.seedHeadHandlers(); } catch (_e) { /* reported by validation later */ }
  }
  return CAT && typeof CAT.resolve === 'function' ? CAT.resolve : null;
}

function buildOriginClassifier() {
  try {
    const denylist = require(join(ROOT, 'extension', 'utils', 'service-denylist.js'));
    const config = require(join(ROOT, 'extension', 'config', 'service-denylist.json'));
    if (denylist && typeof denylist._setForTest === 'function') {
      denylist._setForTest(config);
    }
    if (denylist && typeof denylist.classify === 'function') {
      return function classify(origin) {
        return denylist.classify(origin);
      };
    }
  } catch (_e) {
    // Fall through to unknown.
  }
  return function classifyUnknown() {
    return null;
  };
}

function classifyOrigin(origin, classifyFn) {
  let cls = null;
  try { cls = classifyFn ? classifyFn(origin) : null; } catch (_e) { cls = null; }
  if (!cls || typeof cls !== 'object') return { originClass: 'unknown', denied: false, sensitive: false };
  if (cls.denied) return { originClass: 'denied', denied: true, sensitive: true };
  if (cls.sensitive) return { originClass: 'sensitive', denied: false, sensitive: true };
  return { originClass: 'standard', denied: false, sensitive: false };
}

function proofForResolved(resolved) {
  if (!resolved || typeof resolved !== 'object') return { proof: 'none', hasHandlerProof: false, hasRecipeProof: false };
  if (resolved.tier === 'T1a' && resolved.handler && typeof resolved.handler.handle === 'function') {
    return { proof: 'handler', hasHandlerProof: true, hasRecipeProof: false };
  }
  if ((resolved.tier === 'T0' || resolved.tier === 'T1b') && resolved.recipe) {
    return { proof: 'recipe', hasHandlerProof: false, hasRecipeProof: true };
  }
  return { proof: 'none', hasHandlerProof: false, hasRecipeProof: false };
}

function authPatternFor(desc, resolved, backing, proof) {
  if (resolved && resolved.recipe && resolved.recipe.authStrategy) return resolved.recipe.authStrategy;
  if (proof === 'handler') return 'bound-handler';
  if (backing === 'learn' || (resolved && resolved.tier === 'T2')) return 'network-capture';
  if (backing === 'dom' || (resolved && resolved.tier === 'T3')) return 'dom-discovery';
  return 'unknown';
}

function isGapiCandidate(row) {
  const app = row.app;
  const service = String(row.service || '').toLowerCase();
  return app === 'gmail' || app === 'gdrive' || app === 'gdocs' || app === 'gsheets' ||
    app === 'gcalendar' || service.indexOf('google.com') !== -1 ||
    service.indexOf('googleapis.com') !== -1;
}

function isPatternDCandidate(row) {
  const app = row.app;
  const service = String(row.service || '').toLowerCase();
  const patternApps = new Set([
    'airtable', 'asana', 'aws', 'azure', 'clickup', 'confluence', 'datadog',
    'jira', 'linear', 'posthog', 'salesforce', 'sentry', 'shopify', 'supabase',
    'zendesk',
  ]);
  return patternApps.has(app) ||
    service.indexOf('atlassian.net') !== -1 ||
    service.indexOf('myshopify.com') !== -1 ||
    service.indexOf('force.com') !== -1;
}

function routeFeasibilityFor(row, descriptorOrigin, runtimeOrigin) {
  if (row.readiness === 'blocked') return 'blocked';
  if (row.readiness === 'learn-pending') return 'capture-required';
  if (row.readiness === 't1-ready' || row.readiness === 't1-guarded-fail-closed') {
    if (runtimeOrigin && descriptorOrigin && runtimeOrigin === descriptorOrigin) return 'same-origin-proven';
    if (runtimeOrigin && descriptorOrigin && sameSiteHost(runtimeOrigin, descriptorOrigin)) return 'same-site-subdomain-proven';
    return 'separate-origin-proven';
  }
  if (isGapiCandidate(row)) return 'gapi-bridge-candidate';
  if (isPatternDCandidate(row)) return 'pattern-d-candidate';
  if (row.sideEffectClass === 'read') return 'same-origin-read-candidate';
  return 'dom-discovery-only';
}

function nextActionFor(row) {
  if (row.readiness === 'blocked') return 'keep blocked';
  if (row.readiness === 't1-guarded-fail-closed') {
    return row.sideEffectClass === 'read' ? 'live request-shape proof' : 'live mutation-body UAT';
  }
  if (row.readiness === 't1-ready') return 'already executable';
  if (row.readiness === 'learn-pending') return 'learn via network capture';
  if (row.routeFeasibility === 'gapi-bridge-candidate') return 'GAPI bridge candidate';
  if (row.routeFeasibility === 'pattern-d-candidate') return 'Pattern-D candidate';
  if (row.routeFeasibility === 'same-origin-read-candidate') return 'same-origin read candidate';
  return 'keep DOM/discovery';
}

function readinessFor(desc, resolved, originInfo, proof) {
  if (originInfo.denied) return 'blocked';
  if (GUARDED_SET.has(desc.slug)) return 't1-guarded-fail-closed';
  if (resolved && EXECUTABLE_TIERS.has(resolved.tier) && (proof.hasHandlerProof || proof.hasRecipeProof)) {
    return 't1-ready';
  }
  if ((resolved && resolved.tier === 'T2') || normalizeBacking(desc.backing) === 'learn') return 'learn-pending';
  if (resolved && resolved.tier === 'T3') return 'discovery-pending';
  if (normalizeBacking(desc.backing) === 'dom') return 'discovery-pending';
  return 'unknown';
}

function emptyRollup() {
  return {
    descriptors: 0,
    ready: 0,
    guarded: 0,
    learnPending: 0,
    discoveryPending: 0,
    blocked: 0,
    unknown: 0,
    read: 0,
    write: 0,
    destructive: 0,
  };
}

function addRollup(rollup, row) {
  rollup.descriptors += 1;
  if (row.readiness === 't1-ready') rollup.ready += 1;
  else if (row.readiness === 't1-guarded-fail-closed') rollup.guarded += 1;
  else if (row.readiness === 'learn-pending') rollup.learnPending += 1;
  else if (row.readiness === 'discovery-pending') rollup.discoveryPending += 1;
  else if (row.readiness === 'blocked') rollup.blocked += 1;
  else rollup.unknown += 1;

  if (row.sideEffectClass === 'destructive') rollup.destructive += 1;
  else if (row.sideEffectClass === 'write') rollup.write += 1;
  else rollup.read += 1;
}

function summarizeRows(rows) {
  const totals = emptyRollup();
  const byApp = Object.create(null);
  const byService = Object.create(null);
  const appStems = new Set();
  const services = new Set();
  const tiers = Object.create(null);
  const backings = Object.create(null);

  for (const row of rows) {
    addRollup(totals, row);
    appStems.add(row.app);
    services.add(row.service);
    tiers[row.resolvedTier] = (tiers[row.resolvedTier] || 0) + 1;
    backings[row.backing] = (backings[row.backing] || 0) + 1;
    if (!byApp[row.app]) byApp[row.app] = emptyRollup();
    if (!byService[row.service]) byService[row.service] = emptyRollup();
    addRollup(byApp[row.app], row);
    addRollup(byService[row.service], row);
  }

  totals.appStems = appStems.size;
  totals.services = services.size;
  return { totals, byApp, byService, tiers, backings };
}

function topRows(rows, predicate, limit) {
  return rows.filter(predicate).slice(0, limit || 25).map(function(row) {
    return row.slug + ' (' + row.service + ')';
  });
}

function buildCandidates(rows) {
  return {
    sameOriginReads: topRows(rows, function(row) {
      return row.readiness === 'discovery-pending' && row.nextAction === 'same-origin read candidate';
    }, 30),
    patternD: topRows(rows, function(row) {
      return row.readiness === 'discovery-pending' && row.nextAction === 'Pattern-D candidate';
    }, 30),
    gapiBridge: topRows(rows, function(row) {
      return row.readiness === 'discovery-pending' && row.nextAction === 'GAPI bridge candidate';
    }, 30),
    guardedFailClosed: topRows(rows, function(row) {
      return row.readiness === 't1-guarded-fail-closed';
    }, 30),
  };
}

export function reportReadiness(catalog, opts) {
  const idx = catalog && typeof catalog === 'object' ? catalog : loadCatalog();
  const descriptors = Array.isArray(idx.descriptors) ? idx.descriptors : [];
  if (descriptors.length === 0) {
    // Fail closed: an empty/non-array descriptor set means the catalog failed to
    // generate. Refuse to emit an empty readiness matrix, which would otherwise
    // pass every downstream gate vacuously (this report backs the readiness gate,
    // write-activation-evidence, t1-port-contract, and pattern-d gates).
    throw new Error('report-t1-readiness: catalog.descriptors is empty or not an array -- refusing to emit an empty readiness matrix');
  }
  const resolveFn = (opts && opts.resolveFn) || buildResolver(idx);
  const classifyFn = (opts && opts.classifyOrigin) || buildOriginClassifier();

  const rows = [];
  for (const desc of descriptors) {
    if (!desc || typeof desc.slug !== 'string') continue;
    const descriptorOrigin = originForService(desc.service);
    let resolved = null;
    try { resolved = resolveFn ? resolveFn(desc.slug, descriptorOrigin) : null; } catch (_e) { resolved = null; }

    const proof = proofForResolved(resolved);
    const runtimeOrigin = safeOrigin(
      (resolved && resolved.origin) ||
      (resolved && resolved.recipe && resolved.recipe.origin) ||
      descriptorOrigin
    );
    const originInfo = classifyOrigin(runtimeOrigin || descriptorOrigin, classifyFn);
    const row = {
      slug: desc.slug,
      app: appFromSlug(desc.slug),
      service: String(desc.service || ''),
      sideEffectClass: normalizeSideEffectClass(desc.sideEffectClass),
      backing: normalizeBacking(desc.backing),
      resolvedTier: resolved && typeof resolved.tier === 'string' ? resolved.tier : 'null',
      readiness: 'unknown',
      runtimeOrigin: runtimeOrigin || descriptorOrigin,
      originClass: originInfo.originClass,
      authPattern: authPatternFor(desc, resolved, normalizeBacking(desc.backing), proof.proof),
      routeFeasibility: 'unknown',
      nextAction: 'unknown',
      proof: proof.proof,
      hasHandlerProof: proof.hasHandlerProof,
      hasRecipeProof: proof.hasRecipeProof,
    };

    row.readiness = readinessFor(desc, resolved, originInfo, proof);
    row.routeFeasibility = routeFeasibilityFor(row, descriptorOrigin, runtimeOrigin || descriptorOrigin);
    row.nextAction = nextActionFor(row);
    rows.push(row);
  }

  rows.sort(function(a, b) {
    return a.slug === b.slug ? a.service.localeCompare(b.service) : a.slug.localeCompare(b.slug);
  });

  const summary = summarizeRows(rows);
  return {
    generatedAt: new Date().toISOString(),
    descriptorCount: descriptors.length,
    rowCount: rows.length,
    rows,
    totals: summary.totals,
    tiers: summary.tiers,
    backings: summary.backings,
    byApp: summary.byApp,
    byService: summary.byService,
    candidates: buildCandidates(rows),
  };
}

export function validateReadinessRows(rows, opts) {
  const failures = [];
  const list = Array.isArray(rows) ? rows : [];
  const expectedDescriptorCount = opts && Number.isFinite(opts.expectedDescriptorCount)
    ? opts.expectedDescriptorCount
    : null;
  const allowed = new Set(READINESS_STATUSES);
  const seen = new Set();
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

  if (expectedDescriptorCount !== null && list.length !== expectedDescriptorCount) {
    failures.push('row count ' + list.length + ' does not equal descriptor count ' + expectedDescriptorCount);
  }

  for (const row of list) {
    if (!row || typeof row !== 'object') {
      failures.push('row is not an object');
      continue;
    }
    for (const field of required) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        failures.push(String(row.slug || '(unknown)') + ' missing required field ' + field);
      }
    }
    if (typeof row.slug === 'string') {
      if (seen.has(row.slug)) failures.push('duplicate slug in readiness rows: ' + row.slug);
      seen.add(row.slug);
    }
    if (!allowed.has(row.readiness)) {
      failures.push(row.slug + ' has invalid readiness status ' + String(row.readiness));
    }
    if (row.readiness === 't1-ready') {
      if (!EXECUTABLE_TIERS.has(row.resolvedTier)) {
        failures.push(row.slug + ' is t1-ready but resolvedTier is ' + row.resolvedTier);
      }
      if (!(row.hasHandlerProof || row.hasRecipeProof)) {
        failures.push(row.slug + ' is t1-ready but has no handler/recipe proof');
      }
    }
    if (GUARDED_SET.has(row.slug) && row.originClass !== 'denied' && row.readiness !== 't1-guarded-fail-closed') {
      failures.push(row.slug + ' is a guarded fail-closed row but readiness is ' + row.readiness);
    }
    if (row.backing === 'handler' && row.originClass !== 'denied' && row.resolvedTier !== 'T1a') {
      failures.push(row.slug + ' is handler-backed but did not resolve to T1a');
    }
    if (row.backing === 'recipe' && row.originClass !== 'denied' &&
        row.resolvedTier !== 'T0' && row.resolvedTier !== 'T1b') {
      failures.push(row.slug + ' is recipe-backed but did not resolve to T0/T1b');
    }
    if (row.readiness === 'unknown') {
      failures.push(row.slug + ' has unknown readiness');
    }
  }

  return { failures };
}

export function validateReadinessReport(report, catalog) {
  const failures = [];
  // Fail closed on an empty/non-array catalog: `expected` derives from the same
  // descriptors the rows are built from, so without this floor an empty catalog
  // yields zero rows and zero failures -- a false PASS on the exact codegen
  // regression this report exists to catch.
  if (!catalog || !Array.isArray(catalog.descriptors) || catalog.descriptors.length === 0) {
    return { failures: ['catalog.descriptors is missing, not an array, or empty'] };
  }
  const expected = catalog.descriptors.length;
  if (!report || typeof report !== 'object') {
    return { failures: ['report is not an object'] };
  }
  if (!Array.isArray(report.rows)) {
    return { failures: ['report.rows is missing or not an array'] };
  }
  failures.push(...validateReadinessRows(report.rows, { expectedDescriptorCount: expected }).failures);
  if (report.rowCount !== report.rows.length) {
    failures.push('report.rowCount ' + report.rowCount + ' does not match rows length ' + report.rows.length);
  }
  if (report.descriptorCount !== expected) {
    failures.push('report.descriptorCount ' + report.descriptorCount + ' does not match catalog descriptors ' + expected);
  }
  return { failures };
}

function markdownList(items) {
  if (!items || !items.length) return '- None in current report.';
  return items.map(function(item) { return '- `' + item.replace(/ \(/, '` ('); }).join('\n');
}

function rollupRows(byApp) {
  return Object.keys(byApp).sort().map(function(app) {
    const r = byApp[app];
    return '| `' + app + '` | ' + r.descriptors + ' | ' + r.ready + ' | ' + r.guarded +
      ' | ' + r.learnPending + ' | ' + r.discoveryPending + ' | ' + r.blocked + ' |';
  }).join('\n');
}

export function renderMarkdown(report) {
  const t = report.totals;
  const tierT1 = (report.tiers.T0 || 0) + (report.tiers.T1a || 0) + (report.tiers.T1b || 0);
  const catalogTail = t.discoveryPending + t.learnPending + t.blocked;
  return [
    '# Phase 44 T1 Readiness Matrix',
    '',
    '**Generated:** ' + report.generatedAt,
    '',
    'This report is generated from `extension/catalog/recipe-index.generated.js` plus the live `capability-catalog.js` resolver. It is the v1.1.0 truth surface: catalog/search support means a capability is searchable and routable, not that every app has direct API execution today.',
    '',
    '## Baseline',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    '| Total descriptors | ' + t.descriptors + ' |',
    '| App stems | ' + t.appStems + ' |',
    '| Distinct service hosts | ' + t.services + ' |',
    '| T0/T1a/T1b resolved descriptors | ' + tierT1 + ' |',
    '| T1 ready executable descriptors | ' + t.ready + ' |',
    '| T1 guarded fail-closed rows | ' + t.guarded + ' |',
    '| Learn-pending descriptors | ' + t.learnPending + ' |',
    '| DOM/discovery-pending descriptors | ' + t.discoveryPending + ' |',
    '| Blocked descriptors | ' + t.blocked + ' |',
    '| Catalog tail not direct API-ready | ' + catalogTail + ' |',
    '',
    '## What This Means',
    '',
    'The catalog spans ' + t.appStems + ' app stems. That 128-app breadth is catalog/search support, not direct API execution for every app. `invoke_capability` executes only proven T0/T1a/T1b handlers or recipes today; guarded rows return fail-closed pending live proof; the remaining ' + catalogTail + '-descriptor tail stays DOM/discovery, learn-pending, or blocked by denylist.',
    '',
    'Non-denied origins are allowed under Auto for ordinary capability invoke. Denylisted origins remain blocked. Sensitive origins are flagged in UI/audit records, while extra confirmation remains scoped to network-capture discovery.',
    '',
    '## Readiness Totals',
    '',
    '| Status | Count |',
    '|--------|------:|',
    '| t1-ready | ' + t.ready + ' |',
    '| t1-guarded-fail-closed | ' + t.guarded + ' |',
    '| learn-pending | ' + t.learnPending + ' |',
    '| discovery-pending | ' + t.discoveryPending + ' |',
    '| blocked | ' + t.blocked + ' |',
    '| unknown | ' + t.unknown + ' |',
    '',
    '## Per-App Rollup',
    '',
    '| App | Total | Ready | Guarded | Learn | Discovery | Blocked |',
    '|-----|------:|------:|--------:|------:|----------:|--------:|',
    rollupRows(report.byApp),
    '',
    '## Next-Batch Candidates',
    '',
    '### Same-Origin Reads',
    markdownList(report.candidates.sameOriginReads),
    '',
    '### Pattern-D Candidates',
    markdownList(report.candidates.patternD),
    '',
    '### GAPI Bridge Candidates',
    markdownList(report.candidates.gapiBridge),
    '',
    '### Guarded Fail-Closed Rows',
    markdownList(report.candidates.guardedFailClosed),
    '',
    '## Machine-Readable Matrix',
    '',
    'The full per-descriptor matrix is written to `44-T1-READINESS.json` with one row per descriptor.',
    '',
  ].join('\n');
}

export function writeReport(report, paths) {
  const jsonPath = (paths && paths.jsonPath) || JSON_OUT;
  const mdPath = (paths && paths.mdPath) || MD_OUT;
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(mdPath, renderMarkdown(report));
}

function printSummary(report) {
  const t = report.totals;
  console.log('t1-readiness-report: descriptors=' + t.descriptors +
    ' apps=' + t.appStems +
    ' ready=' + t.ready +
    ' guarded=' + t.guarded +
    ' learn=' + t.learnPending +
    ' discovery=' + t.discoveryPending +
    ' blocked=' + t.blocked);
}

function runCli() {
  const catalog = loadCatalog();
  const report = reportReadiness(catalog);
  const validation = validateReadinessReport(report, catalog);
  writeReport(report);
  printSummary(report);
  if (validation.failures.length) {
    console.error('t1-readiness-report: FAIL (' + validation.failures.length + ' validation failures)');
    for (const failure of validation.failures) console.error('  - ' + failure);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('t1-readiness-report: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}

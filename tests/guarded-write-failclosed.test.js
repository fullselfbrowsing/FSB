#!/usr/bin/env node
'use strict';

/**
 * Phase 41 Plan 01 (DEPTH-02) -- the SC1 fail-closed guarded-write proof harness.
 *
 * THE SECURITY KEYSTONE of the guarded-write phase. Every still-unactivated WRITE head
 * in this harness ships FAIL-CLOSED: handle() returns the dual-field
 * RECIPE_DOM_FALLBACK_PENDING and NEVER calls ctx.executeBoundSpec -- so NO mutation
 * fires for an [ASSUMED-ENDPOINT] write until a live-captured body activates it (the
 * shipped github.issues.create pattern, catalog/handlers/github.js:111-123).
 *
 * For each Phase-41 guarded write slug (WRITE_HEADS): if its handler module exists,
 * require it fresh, invoke handle({}, ctx) with a RECORDING executeBoundSpec stub, and
 * assert:
 *   (a) result.code === 'RECIPE_DOM_FALLBACK_PENDING'
 *   (b) result.errorCode === result.error === result.code   (INV-03 dual-field)
 *   (c) result.success === false
 *   (d) result.fellBackToDom === true
 *   (e) the executeBoundSpec recorder array length === 0   (NO mutation fired)
 *
 * The recorder-stays-EMPTY check (e) is the load-bearing assertion: a write that calls
 * ctx.executeBoundSpec for an unverified [ASSUMED] mutation REDS this gate. (a)-(d)
 * alone are not enough -- a handler could return the typed reason AND still have fired
 * a mutation; (e) forbids that.
 *
 * NEGATIVE CONTROL: a synthetic in-test handler that DOES call ctx.executeBoundSpec is
 * run through the same recording-ctx path; the recorder MUST be non-empty afterward.
 * This proves the harness genuinely distinguishes a mutation-firing write from a
 * fail-closed one (a green that could never red is worthless).
 *
 * Wave-0 RED-by-design: the write slugs do not exist until plans 02/03/04 land them.
 * An absent handler file OR a missing slug entry emits ONE deterministic FAIL per slug
 * (the existsSync pattern mirrored from tests/head-handler-upgrade.test.js). The gate
 * turns GREEN as each plan registers its writes; 41-05 requires EXIT 0.
 *
 * Zero-framework FSB convention: module-level passed/failed counters, check(cond,msg),
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/guarded-write-failclosed.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLERS_DIR = path.join(REPO_ROOT, 'catalog', 'handlers');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// ---- The remaining fail-closed WRITE slugs + their handler modules + first-party origins.
//
// Each slug EXISTS as catalog/descriptors/opentabs__<app>__<op>.json (backing:'dom',
// sideEffectClass:'write', DOT-form slug). The write head registers the EXACT slug so
// resolve() upgrades the breadth descriptor dom->T1a (proven separately in
// head-handler-upgrade.test.js); THIS harness proves each write is INERT (fail-closed).
// origin is the app's OWN first-party origin (Wall 2). handlerFile is the module that
// ports the write. Notion writes are intentionally absent: the UAT-smoked Notion
// saveTransactions handlers are active and are tested in capability-head-handlers.
const WRITE_HEADS = [
  // gitlab x6 -- same-origin writes stay inert pending live mutation-body UAT.
  { slug: 'gitlab.create_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.create_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.create_note', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.merge_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.update_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.update_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  // slack x13 -- split-token web API mutations stay inert pending live mutation-body UAT.
  { slug: 'slack.add_reaction', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.create_channel', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.delete_message', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.edit_message', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.invite_to_channel', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.open_dm', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.pin_message', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.remove_reaction', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.send_message', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  // robinhood x2 -- brokerage watchlist mutations stay inert behind the denied-origin policy.
  { slug: 'robinhood.create_watchlist', origin: 'https://robinhood.com', handlerFile: 'robinhood.js' },
  { slug: 'robinhood.delete_watchlist', origin: 'https://robinhood.com', handlerFile: 'robinhood.js' },
  { slug: 'slack.set_channel_purpose', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.set_channel_topic', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.unpin_message', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.upload_file', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  // bitbucket x9 -- same-origin write/destructive slugs stay inert pending live UAT.
  { slug: 'bitbucket.approve_pull_request', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.create_branch', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.create_pr_comment', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.create_pull_request', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.create_repository', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.decline_pull_request', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.delete_branch', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.merge_pull_request', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.update_pull_request', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  // circleci x12 -- same-origin API mutations stay inert pending live UAT.
  { slug: 'circleci.approve_job', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.cancel_job', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.cancel_workflow', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.create_context', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.create_env_var', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.create_schedule', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.delete_context', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.delete_env_var', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.delete_schedule', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.rerun_workflow', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.trigger_pipeline', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.update_schedule', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  // retool x22 -- mutation/save/query rows stay inert pending live UAT.
  { slug: 'retool.add_component', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.add_query', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.change_user_name', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.clone_app', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.create_app', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.create_app_from_toolscript_archive', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.create_folder', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.create_resource', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.create_resource_folder', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.delete_app', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.delete_folder', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.delete_resource_folder', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.export_toolscript_archive', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.force_editor_save', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_workflow_runs', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.lookup_app', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.move_resource_to_folder', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.rename_folder', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.run_grpc', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.run_query', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.save_page', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.update_app_from_toolscript_archive', origin: 'https://retool.com', handlerFile: 'retool.js' },
  // instagram x10 -- social/feed/mutation rows stay inert pending live request-shape UAT.
  { slug: 'instagram.create_comment', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.follow_user', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.get_home_feed', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.get_suggested_users', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.like_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.save_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.send_message', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.unfollow_user', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.unlike_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.unsave_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  // tiktok x7 -- signed/private API rows stay inert pending live request-shape proof.
  { slug: 'tiktok.get_current_user', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_followers', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_following', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_for_you_feed', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_notifications', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.search_users', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.search_videos', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  // facebook x3 -- friend/reaction mutations stay inert pending live mutation-body UAT.
  { slug: 'facebook.confirm_friend_request', origin: 'https://www.facebook.com', handlerFile: 'facebook.js' },
  { slug: 'facebook.delete_friend_request', origin: 'https://www.facebook.com', handlerFile: 'facebook.js' },
  { slug: 'facebook.react_to_post', origin: 'https://www.facebook.com', handlerFile: 'facebook.js' },
  // threads x1 -- posting stays inert pending live mutation-body UAT.
  { slug: 'threads.create_thread', origin: 'https://www.threads.net', handlerFile: 'threads.js' },
  // netlify x19 -- same-origin writes/destructive slugs stay inert pending live UAT.
  { slug: 'netlify.create_build', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.create_build_hook', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.create_deploy_key', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.create_dns_record', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.create_dns_zone', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.create_env_vars', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.create_site', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.delete_build_hook', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.delete_dns_record', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.delete_env_var', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.delete_hook', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.delete_site', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.delete_submission', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.lock_deploy', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.restore_deploy', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.rollback_deploy', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.unlock_deploy', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.update_env_var', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.update_site', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  // terraform x17 -- same-origin write/destructive slugs stay inert pending live UAT.
  { slug: 'terraform.apply_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.cancel_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.create_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.create_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.create_variable', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.create_variable_set', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.create_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.delete_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.delete_variable', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.delete_variable_set', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.delete_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.discard_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.lock_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.unlock_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.update_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.update_variable', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.update_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  // tumblr x12 -- same-origin /api/v2 writes stay inert pending live UAT.
  { slug: 'tumblr.add_filtered_tag', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.block_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.create_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.delete_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.edit_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.follow_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.like_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.reblog_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.remove_filtered_tag', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.unblock_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.unfollow_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.unlike_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  // mongodb x4 -- Atlas mutations stay inert pending live mutation-body UAT.
  { slug: 'mongodb.add_ip_access_entry', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.create_database_user', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.delete_database_user', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.delete_ip_access_entry', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  // cockroachdb x5 -- gRPC writes and arbitrary SQL stay inert pending live UAT.
  { slug: 'cockroachdb.create_database_user', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.delete_cluster', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.delete_database_user', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.execute_sql', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.set_delete_protection', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  // msword x15 -- Graph-backed mutations stay inert pending an approved auth bridge.
  { slug: 'msword.append_to_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.copy_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.create_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.create_folder', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.create_sharing_link', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.delete_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.delete_permission', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.get_preview_url', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.move_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.rename_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.replace_text_in_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.restore_version', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.update_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.update_file_content', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.upload_file', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  // excel x19 -- workbook mutations, formula temp-cell writes, and auth-cache reload stay inert pending live UAT.
  { slug: 'excel.add_named_item', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.add_table_column', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.add_table_row', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.add_worksheet', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.calculate_workbook', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.clear_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.create_chart', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.create_table', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.delete_chart', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.delete_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.delete_table', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.delete_table_row', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.delete_worksheet', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.evaluate_formula', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.insert_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.reauthenticate', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.sort_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.update_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.update_worksheet', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  // pinterest x10 -- same-origin resource writes stay inert pending live UAT.
  { slug: 'pinterest.create_board', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.create_board_section', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.create_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.delete_board', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.delete_board_section', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.delete_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.follow_user', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.save_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.unfollow_user', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.update_board', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  // starbucks x5 -- cart/favorite/store mutations stay inert pending live UAT.
  { slug: 'starbucks.add_favorite_product', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.add_product_to_cart', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.delete_favorite_product', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.toggle_favorite_store', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.update_product_quantity', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  // medium x5 -- GraphQL mutations stay inert pending live UAT.
  { slug: 'medium.clap_post', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.follow_tag', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.follow_user', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.unfollow_tag', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.unfollow_user', origin: 'https://medium.com', handlerFile: 'medium.js' },
  // whatsapp x14 -- WebSocket/page-state mutations stay inert pending live UAT.
  { slug: 'whatsapp.archive_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.block_contact', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.clear_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.create_group', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.delete_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.delete_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.mark_chat_read', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.mute_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.pin_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.revoke_group_invite_link', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.revoke_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.send_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.star_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.unblock_contact', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  // discord x13 -- Discord API mutations stay inert pending live mutation-body UAT.
  { slug: 'discord.add_reaction', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.create_channel', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.create_thread', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.delete_channel', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.delete_message', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.edit_channel', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.edit_message', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.open_dm', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.pin_message', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.remove_reaction', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.send_message', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.unpin_message', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.upload_file', origin: 'https://discord.com', handlerFile: 'discord.js' },
  // lucid x6 -- first-party API mutations stay inert pending live mutation-body UAT.
  { slug: 'lucid.create_document', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.create_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.delete_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.move_document_to_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.rename_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.trash_document', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  // powerpoint x12 -- Microsoft Graph mutations and PPTX edits stay inert pending live UAT.
  { slug: 'powerpoint.copy_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.create_folder', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.create_presentation', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.create_sharing_link', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.delete_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.delete_permission', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.delete_slide', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_preview_url', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.move_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.rename_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.update_slide_notes', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.update_slide_text', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  // outlook x12 -- Graph mutations and POST-shaped schedule reads stay inert pending live UAT.
  { slug: 'outlook.create_draft', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.create_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.delete_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.delete_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.forward_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.get_schedule', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.move_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.reply_to_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.respond_to_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.send_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.update_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.update_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  // onenote x4 -- notebook/page/section creation stays inert pending live UAT.
  { slug: 'onenote.create_notebook', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.create_page', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.create_section', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.create_section_group', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  // dockerhub x3 -- repository mutations stay inert pending live mutation-body UAT.
  { slug: 'dockerhub.create_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.update_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.delete_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  // tinder x10 -- swipe/message/profile/location mutations stay inert pending live mutation-body UAT.
  { slug: 'tinder.get_metadata', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.get_updates', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.like_message', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.like_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.pass_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.send_message', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.super_like_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.unmatch', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.update_location', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.update_profile', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  // sentry x2 -- comment/issue mutations stay inert pending live mutation-body UAT.
  { slug: 'sentry.create_comment', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.update_issue', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  // zendesk x4 -- ticket mutations stay inert pending live mutation-body UAT.
  { slug: 'zendesk.add_ticket_comment', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.create_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.delete_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.update_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  // kayak x1 -- price-alert creation stays inert pending live mutation-body UAT.
  { slug: 'kayak.create_price_alert', origin: 'https://www.kayak.com', handlerFile: 'kayak.js' },
  // opentable x2 -- held-card reservation mutations stay inert pending live mutation-body UAT.
  { slug: 'opentable.reserve_table', origin: 'https://www.opentable.com', handlerFile: 'opentable.js' },
  { slug: 'opentable.cancel_reservation', origin: 'https://www.opentable.com', handlerFile: 'opentable.js' },
  // aws x3 -- AWS mutations stay inert pending an approved SigV4/request bridge.
  { slug: 'aws.invoke_function', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.start_instance', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.stop_instance', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  // shopify x2 -- payment/destructive mutations stay inert pending live mutation-body UAT.
  { slug: 'shopify.create_order', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js' },
  { slug: 'shopify.cancel_order', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js' },
  // gcal x9 -- Calendar mutations/freebusy stay inert pending live mutation-body UAT.
  { slug: 'gcal.create_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.create_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.delete_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.delete_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.move_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.query_freebusy', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.quick_add_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.update_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.update_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  // airtable x2 -- comments and cell updates stay inert pending live mutation-body UAT.
  { slug: 'airtable.create_comment', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  { slug: 'airtable.update_cell', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  // craigslist x3 -- posting/payment mutations stay inert pending live mutation-body UAT.
  { slug: 'craigslist.renew_all_postings', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.set_default_payment_card', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.delete_payment_card', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  // notebooklm x10 -- RPC mutations stay inert pending live mutation-body UAT.
  { slug: 'notebooklm.add_source_text', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.add_source_url', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.copy_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.create_note', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.create_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.delete_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.delete_notes', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.delete_sources', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.rename_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.update_note', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  // coinbase x6 -- GraphQL mutations stay inert pending live mutation-body UAT.
  { slug: 'coinbase.add_watchlist_item', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.create_price_alert', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.create_watchlist', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.delete_price_alert', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.delete_watchlist', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.remove_watchlist_item', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  // claude x7 -- conversation/project mutations stay inert pending live mutation-body UAT.
  { slug: 'claude.create_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.create_project', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.delete_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.delete_project', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.send_message', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.update_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.update_project', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  // gemini x2 -- conversation mutations stay inert pending live mutation-body UAT.
  { slug: 'gemini.create_conversation', origin: 'https://gemini.google.com', handlerFile: 'gemini.js' },
  { slug: 'gemini.send_message', origin: 'https://gemini.google.com', handlerFile: 'gemini.js' },
  // ticketmaster x1 -- ticket purchase stays inert pending live mutation-body UAT.
  { slug: 'ticketmaster.buy_tickets', origin: 'https://www.ticketmaster.com', handlerFile: 'ticketmaster.js' },
  // eventbrite x1 -- paid event registration stays inert pending live mutation-body UAT.
  { slug: 'eventbrite.register_for_event', origin: 'https://www.eventbrite.com', handlerFile: 'eventbrite.js' },
  // lyft x2 -- paid ride request/cancel rows stay inert pending live mutation-body UAT.
  { slug: 'lyft.request_ride', origin: 'https://www.lyft.com', handlerFile: 'lyft.js' },
  { slug: 'lyft.cancel_ride', origin: 'https://www.lyft.com', handlerFile: 'lyft.js' },
  // figma x4 -- first-party API mutations stay inert pending live mutation-body UAT.
  { slug: 'figma.create_file', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.update_file', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.trash_file', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.post_comment', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  // gdocs x12 -- document/comment mutations stay inert pending live mutation-body UAT.
  { slug: 'gdocs.copy_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.create_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.create_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.delete_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.delete_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.delete_reply', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.reopen_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.reply_to_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.resolve_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.restore_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.trash_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.update_document_title', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  // mastodon x2 -- status publication/deletion stay inert pending live mutation-body UAT.
  { slug: 'mastodon.create_status', origin: 'https://mastodon.social', handlerFile: 'mastodon.js' },
  { slug: 'mastodon.delete_status', origin: 'https://mastodon.social', handlerFile: 'mastodon.js' },
  // Home Depot x1 -- cart mutation stays inert pending live mutation-body UAT.
  { slug: 'homedepot.add_to_cart', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  // ebay x1 -- watchlist mutation stays inert pending live mutation-body UAT.
  { slug: 'ebay.watch_item', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  // Etsy x2 -- cart/payment mutations stay inert pending live mutation-body UAT.
  { slug: 'etsy.add_to_cart', origin: 'https://www.etsy.com', handlerFile: 'etsy.js' },
  { slug: 'etsy.checkout', origin: 'https://www.etsy.com', handlerFile: 'etsy.js' },
  // Fiverr x1 -- message sending stays inert pending live mutation-body UAT.
  { slug: 'fiverr.send_message', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  // Steam x3 -- wishlist/follow mutations stay inert behind denied-origin policy and live-UAT proof.
  { slug: 'steam.add_to_wishlist', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.follow_app', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.remove_from_wishlist', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
];

// makeRecordingCtx(origin) -> { recorder, ctx }. The ctx.executeBoundSpec stub pushes
// every { spec, tabId } it receives onto the exposed recorder array and resolves a
// canned { success:true } 200. A FAIL-CLOSED write never touches this member, so its
// recorder stays EMPTY. The recorder is the proof surface for assertion (e).
function makeRecordingCtx(origin) {
  const recorder = [];
  return {
    recorder,
    ctx: {
      origin: origin,
      tabId: 99,
      async executeBoundSpec(spec, tabId) {
        recorder.push({ spec: spec, tabId: tabId });
        return { success: true, status: 200, data: { ok: true }, text: null };
      }
    }
  };
}

// Fresh-require a handler module so its self-registration runs against the current
// global, and return its slug-keyed export object. Clearing the cache makes each
// invocation independent (a handler self-registers at require time). Returns null if
// the file is absent (Wave-0 RED leg).
function freshRequireHandler(handlerFile) {
  const p = path.join(HANDLERS_DIR, handlerFile);
  if (!fs.existsSync(p)) { return null; }
  try { delete require.cache[require.resolve(p)]; } catch (e) { /* not cached */ }
  return require(p);
}

(async function run() {
  console.log('--- DEPTH-02 SC1 fail-closed guarded-write harness (Phase 41) ---');

  // ===== The Phase-41 guarded writes: each must be INERT (fail-closed) =============
  for (let i = 0; i < WRITE_HEADS.length; i++) {
    const row = WRITE_HEADS[i];
    const handlers = freshRequireHandler(row.handlerFile);

    if (!handlers) {
      // Wave-0: the handler module is absent -> a single deterministic FAIL (the
      // correct RED). Its plan turns this PASS.
      check(false, 'FAILCLOSED ' + row.slug + ' (handler ' + row.handlerFile +
        ' not present yet -- expected Wave-0 RED, GREEN after its plan lands)');
      continue;
    }

    const entry = handlers[row.slug];
    if (!entry || typeof entry.handle !== 'function') {
      // The module exists but the write slug has not been registered yet -> one
      // deterministic FAIL (the correct RED until the slug's plan lands).
      check(false, 'FAILCLOSED ' + row.slug + ' (slug not yet added to ' +
        row.handlerFile + ' -- expected Wave-0 RED, GREEN after its plan lands)');
      continue;
    }

    const rec = makeRecordingCtx(row.origin);
    let result;
    try {
      result = await entry.handle({}, rec.ctx);
    } catch (e) {
      check(false, 'FAILCLOSED ' + row.slug + ' handle() threw: ' +
        (e && e.message ? e.message : e));
      continue;
    }

    // (a) the typed reason code
    check(result && result.code === 'RECIPE_DOM_FALLBACK_PENDING',
      'FAILCLOSED ' + row.slug + ' -> code === RECIPE_DOM_FALLBACK_PENDING; got ' +
      (result ? result.code : 'null'));
    // (b) INV-03 dual-field byte-equality (code === errorCode === error)
    check(result && result.errorCode === result.code && result.error === result.code,
      'FAILCLOSED ' + row.slug + ' -> errorCode === error === code (INV-03 dual-field)');
    // (c) success false
    check(result && result.success === false,
      'FAILCLOSED ' + row.slug + ' -> success === false');
    // (d) fellBackToDom marker
    check(result && result.fellBackToDom === true,
      'FAILCLOSED ' + row.slug + ' -> fellBackToDom === true');
    // (e) THE keystone: the executeBoundSpec recorder stayed EMPTY (no mutation fired)
    check(rec.recorder.length === 0,
      'FAILCLOSED ' + row.slug + ' -> executeBoundSpec recorder is EMPTY (NO mutation fired -- the SC1 keystone); got ' +
      rec.recorder.length + ' call(s)');
  }

  // ===== NEGATIVE CONTROL: the harness catches a mutation-firing write =============
  // A synthetic handler that DOES call ctx.executeBoundSpec proves the recorder is a
  // real proof surface: after invoking it the recorder MUST be non-empty. If this did
  // NOT fire, assertion (e) above could never red (a worthless green).
  const mutatingHandler = {
    async handle(args, ctx) {
      await ctx.executeBoundSpec({
        url: 'https://example.com/api/mutate', method: 'POST',
        headers: {}, body: '{}', query: {},
        authStrategy: 'same-origin-cookie', origin: 'https://example.com', extract: '@'
      }, ctx.tabId);
      return { success: true };
    }
  };
  const negRec = makeRecordingCtx('https://example.com');
  await mutatingHandler.handle({}, negRec.ctx);
  check(negRec.recorder.length !== 0,
    'NEGATIVE CONTROL: a synthetic mutation-firing handler leaves the recorder NON-empty ' +
    '(proves the harness distinguishes a fired mutation from a fail-closed write); got ' +
    negRec.recorder.length + ' call(s)');

  // ---- Exit convention --------------------------------------------------------
  console.log('\nguarded-write-failclosed: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('FATAL (guarded-write-failclosed):', err && err.stack ? err.stack : err);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});

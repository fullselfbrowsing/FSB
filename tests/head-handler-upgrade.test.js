#!/usr/bin/env node
'use strict';

/**
 * Phase 40 Plan 01 (DEPTH-01) -- the dom->T1a upgrade-assertion harness.
 *
 * THE CORRECTNESS KEYSTONE of the depth phase. A hand-ported READ head must
 * register the EXACT opentabs descriptor slug (dot-form, read from
 * catalog/descriptors/opentabs__<app>__<op>.json) so capability-catalog.resolve()
 * -- which checks the REGISTRY first (capability-catalog.js:329, :396-403) --
 * UPGRADES the breadth descriptor from its backing:'dom' T3 resolution
 * (capability-catalog.js:347-355) to a T1a head with the registered handler.
 *
 * A WRONG slug does NOT upgrade -- it mints a DEAD second REGISTRY entry while the
 * real breadth slug still resolves T3. Only this harness catches that silent
 * failure mode (the head-handlers unit suite asserts the handler's own behavior;
 * it never asserts the breadth slug actually flipped tier). This file is the sole
 * proof that "each hand-port UPGRADES its existing opentabs slug dom->T1a" instead
 * of duplicating it.
 *
 * Asserts, for the 10 Phase-40 READ slugs:
 *   - resolve(slug, originForThatApp) returns tier 'T1a' (NOT 'T3')
 *   - the resolved descriptor.slug equals the ported slug BYTE-EXACT
 *   - the resolved entry exposes a handler with an async handle
 * Plus:
 *   - NEGATIVE CONTROL: a deliberately-wrong slug (gitlab.list_projectz) does NOT
 *     resolve T1a -- a mis-registered slug is a dead duplicate, not an upgrade.
 *   - BEFORE/AFTER for one slug: with FsbRecipeIndex seeded with the real
 *     backing:'dom' descriptor but the handler NOT required, resolve() is 'T3';
 *     after requiring the handler (fresh catalog), 'T1a'. This is the upgrade
 *     itself, demonstrated end-to-end.
 *
 * Wave-0 note: gitlab.js does not exist until 40-02. The gitlab rows are guarded
 * by existsSync; absent, they emit a single deterministic FAIL each (the correct
 * Wave-0 RED). 40-02 turns the gitlab rows GREEN; 40-05 requires EXIT 0.
 *
 * Zero-framework FSB convention: module-level passed/failed counters, check(cond,
 * msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/head-handler-upgrade.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');
const HANDLERS_DIR = path.join(REPO_ROOT, 'catalog', 'handlers');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');

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

// ---- The Phase-40/41/46/48 ported slugs + their FIRST-PARTY origins -----------
//
// Each slug EXISTS as catalog/descriptors/opentabs__<app>__<op>.json (backing:
// 'dom', sideEffectClass:'read', DOT-form slug). The slug strings here are read
// from those descriptors -- NOT invented. origin is the app's OWN first-party
// origin (Wall 2), which the handler registers and resolve() returns on the T1a
// entry. handlerFile is the catalog/handlers module that ports the slug.
const PORTED = [
  // gitlab x16 -- same-origin /api/v4 read module, origin https://gitlab.com
  { slug: 'gitlab.get_file_content', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_projects', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_project', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_issues', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_job_log', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_merge_request_diff', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.get_user_profile', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_branches', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_commits', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_merge_requests', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_notes', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_pipeline_jobs', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.list_pipelines', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  { slug: 'gitlab.search_projects', origin: 'https://gitlab.com', handlerFile: 'gitlab.js' },
  // netlify x20 -- same-origin read module, origin https://app.netlify.com.
  // netlify.get_current_user stays covered by the generated T1b recipe batch.
  { slug: 'netlify.get_account', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.get_deploy', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.get_dns_zone', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.get_env_var', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.get_member', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.get_site', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_accounts', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_audit_events', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_build_hooks', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_builds', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_deploy_keys', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_deploys', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_dns_records', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_dns_zones', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_env_vars', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_form_submissions', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_forms', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_hooks', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_members', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  { slug: 'netlify.list_sites', origin: 'https://app.netlify.com', handlerFile: 'netlify.js' },
  // bitbucket x18 -- same-origin read module, origin https://bitbucket.org
  { slug: 'bitbucket.get_commit', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_file_content', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_pipeline', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_pull_request', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_pull_request_diff', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_repository', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.get_user_profile', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_branches', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_commits', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_pipeline_steps', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_pipelines', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_pr_comments', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_pull_requests', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_repositories', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_tags', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_workspace_members', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.list_workspaces', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  { slug: 'bitbucket.search_code', origin: 'https://bitbucket.org', handlerFile: 'bitbucket.js' },
  // circleci x3 -- NEW same-origin read module (46), origin https://app.circleci.com
  { slug: 'circleci.get_current_user', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.list_pipelines', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_project', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  // circleci x7 -- EXTEND same-origin read module (48), origin https://app.circleci.com
  { slug: 'circleci.get_pipeline', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_pipeline_workflows', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_workflow', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_workflow_jobs', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_job', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_job_artifacts', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_job_tests', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  // circleci x10 -- remaining same-origin reads promoted by quick task 260630-vo5.
  { slug: 'circleci.get_context', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_flaky_tests', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_pipeline_config', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_project_workflow_metrics', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_workflow_job_metrics', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.get_workflow_runs', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.list_context_env_vars', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.list_contexts', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.list_env_vars', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  { slug: 'circleci.list_schedules', origin: 'https://app.circleci.com', handlerFile: 'circleci.js' },
  // vercel x7 -- NEW same-origin read module (48), origin https://vercel.com
  { slug: 'vercel.get_user', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_teams', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_projects', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.get_project', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_deployments', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.get_deployment', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  { slug: 'vercel.list_domains', origin: 'https://vercel.com', handlerFile: 'vercel.js' },
  // retool x28 -- same-origin read module, origin https://retool.com
  { slug: 'retool.get_app', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_app_docs', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_app_state', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_current_user', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_organization', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_resource', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_source_control_settings', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflow', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflow_releases', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflow_run', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflow_run_count', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflow_run_log', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.get_workflows_config', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_agents', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_app_tags', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_apps', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_branches', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_components', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_environments', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_experiments', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_grids', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_page_names', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_page_saves', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_playground_queries', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_resources', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_user_spaces', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_workflow_triggers', origin: 'https://retool.com', handlerFile: 'retool.js' },
  { slug: 'retool.list_workflows', origin: 'https://retool.com', handlerFile: 'retool.js' },
  // retool x22 -- mutation/save/query rows stay guarded fail-closed until live UAT.
  { slug: 'retool.add_component', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.add_query', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.change_user_name', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.clone_app', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.create_app', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.create_app_from_toolscript_archive', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.create_folder', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.create_resource', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.create_resource_folder', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.delete_app', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.delete_folder', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.delete_resource_folder', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.export_toolscript_archive', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.force_editor_save', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.list_workflow_runs', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.lookup_app', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.move_resource_to_folder', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.rename_folder', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.run_grpc', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.run_query', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.save_page', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  { slug: 'retool.update_app_from_toolscript_archive', origin: 'https://retool.com', handlerFile: 'retool.js', expectWrite: true },
  // asana x15 -- NEW same-origin read module (51), origin https://app.asana.com
  { slug: 'asana.get_current_user', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_project', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_stories_for_task', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_subtasks', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_task', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_tasks_for_project', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_tasks_for_section', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.get_user', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.list_projects', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.list_sections', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.list_tags', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.list_teams', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.list_users_for_workspace', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.list_workspaces', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  { slug: 'asana.search_tasks', origin: 'https://app.asana.com', handlerFile: 'asana.js' },
  // shortcut x8 -- NEW app-specific same-origin read module, origin https://app.shortcut.com
  { slug: 'shortcut.get_current_user', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_epics', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_iterations', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_labels', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_members', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_objectives', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_teams', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  { slug: 'shortcut.list_workflows', origin: 'https://app.shortcut.com', handlerFile: 'shortcut.js' },
  // leetcode x24 -- NEW query-only same-origin GraphQL read module, origin https://leetcode.com
  { slug: 'leetcode.get_code_snippets', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_contest_history', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_contest_ranking', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_current_user', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_daily_challenge', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_problem', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_problem_hints', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_problem_solution', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_problem_stats', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_similar_problems', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_submission', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_badges', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_calendar', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_language_stats', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_profile', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_progress', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_skill_stats', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.get_user_submit_stats', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.list_discussions', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.list_favorites', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.list_problems', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.list_recent_submissions', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.list_submissions', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  { slug: 'leetcode.list_topic_tags', origin: 'https://leetcode.com', handlerFile: 'leetcode.js' },
  // wikipedia x17 -- NEW public same-site read module, origin https://en.wikipedia.org
  { slug: 'wikipedia.compare_revisions', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_article', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_article_categories', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_article_languages', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_article_links', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_article_sections', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_backlinks', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_category_members', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_featured_content', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_page_summary', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_random_articles', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_recent_changes', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_revisions', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_section_content', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.get_user_contributions', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.opensearch', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  { slug: 'wikipedia.search_articles', origin: 'https://en.wikipedia.org', handlerFile: 'wikipedia.js' },
  // hackernews x9 -- NEW public same-origin HTML read module, origin https://news.ycombinator.com
  { slug: 'hackernews.get_item', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.get_story_comments', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.get_user', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.list_ask_stories', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.list_best_stories', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.list_job_stories', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.list_new_stories', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.list_show_stories', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  { slug: 'hackernews.list_top_stories', origin: 'https://news.ycombinator.com', handlerFile: 'hackernews.js' },
  // reddit x13 -- NEW same-origin .json GET read module, origin https://www.reddit.com
  { slug: 'reddit.get_comment_thread', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.get_me', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.get_post', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.get_subreddit', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.get_user', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.list_flairs', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.list_popular_subreddits', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.list_posts', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.list_subscriptions', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.list_user_content', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.read_inbox', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.search_posts', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  { slug: 'reddit.search_subreddits', origin: 'https://www.reddit.com', handlerFile: 'reddit.js' },
  // npm x11 -- NEW public same-origin Spiferack read module, origin https://www.npmjs.com
  { slug: 'npm.get_organization', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package_dependencies', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package_dependents', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package_downloads', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package_readme', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package_version', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_package_versions', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_user_packages', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.get_user_profile', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  { slug: 'npm.search_packages', origin: 'https://www.npmjs.com', handlerFile: 'npm.js' },
  // yelp x3 -- NEW public same-origin page/autocomplete read module, origin https://www.yelp.com
  { slug: 'yelp.autocomplete', origin: 'https://www.yelp.com', handlerFile: 'yelp.js' },
  { slug: 'yelp.get_business', origin: 'https://www.yelp.com', handlerFile: 'yelp.js' },
  { slug: 'yelp.search_businesses', origin: 'https://www.yelp.com', handlerFile: 'yelp.js' },
  // tripadvisor x10 -- NEW public same-origin SSR/GraphQL read module, origin https://www.tripadvisor.com
  { slug: 'tripadvisor.get_attraction', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.get_breadcrumbs', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.get_hotel', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.get_neighborhood', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.get_restaurant', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.get_restaurant_awards', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.get_reviews', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.list_attractions', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.list_hotels', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  { slug: 'tripadvisor.list_restaurants', origin: 'https://www.tripadvisor.com', handlerFile: 'tripadvisor.js' },
  // zillow x8 -- NEW public same-origin search-state read module, origin https://www.zillow.com
  { slug: 'zillow.get_market_overview', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_by_owner', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_for_rent', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_for_sale', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_foreclosures', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_new_construction', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_open_houses', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  { slug: 'zillow.search_recently_sold', origin: 'https://www.zillow.com', handlerFile: 'zillow.js' },
  // redfin x12 -- same-origin Stingray API read module, origin https://www.redfin.com
  { slug: 'redfin.get_comparable_rentals', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_current_user', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_favorites', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_amenities', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_details', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_estimate', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_history', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_parcel_info', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_risk_factors', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.get_property_schools', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.search_locations', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  { slug: 'redfin.search_properties', origin: 'https://www.redfin.com', handlerFile: 'redfin.js' },
  // bsky x12 -- NEW public AppView read module, runtime origin https://bsky.app
  { slug: 'bsky.get_author_feed', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_feed', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_followers', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_follows', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_list_feed', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_post_thread', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_posts', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_user_profile', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.get_user_profiles', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.search_posts', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.search_users', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  { slug: 'bsky.search_users_typeahead', origin: 'https://bsky.app', handlerFile: 'bsky.js' },
  // meticulous x21 -- NEW same-origin GraphQL read module, origin https://app.meticulous.ai
  { slug: 'meticulous.get_current_user', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_project', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_project_pull_request', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_replay', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_replay_screenshots', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_session', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_session_events', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run_coverage', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run_diffs', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run_pr_description', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run_screenshots', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run_source_code', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.get_test_run_test_cases', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.list_github_repositories', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.list_organization_members', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.list_organizations', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.list_projects', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.list_replays', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.list_sessions', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  { slug: 'meticulous.search_sessions', origin: 'https://app.meticulous.ai', handlerFile: 'meticulous.js' },
  // stripe x21 -- NEW same-origin dashboard /v1 read module, origin https://dashboard.stripe.com
  { slug: 'stripe.get_account', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_balance', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_customer', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_event', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_invoice', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_payment_intent', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_price', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_product', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.get_subscription', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_balance_transactions', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_customers', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_events', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_invoices', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_payment_intents', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_prices', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_products', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.list_subscriptions', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.search_customers', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.search_invoices', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.search_payment_intents', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  { slug: 'stripe.search_subscriptions', origin: 'https://dashboard.stripe.com', handlerFile: 'stripe.js' },
  // x.com x2 -- NEW public same-origin HTML read module, origin https://x.com
  { slug: 'x.get_tweet', origin: 'https://x.com', handlerFile: 'x.js' },
  { slug: 'x.get_user_profile', origin: 'https://x.com', handlerFile: 'x.js' },
  // instagram x5 -- NEW public same-origin HTML/search read module, origin https://www.instagram.com
  { slug: 'instagram.get_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.get_user_profile', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.search', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.search_hashtags', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  { slug: 'instagram.search_users', origin: 'https://www.instagram.com', handlerFile: 'instagram.js' },
  // instagram x10 -- guarded fail-closed until live request-shape UAT records activation evidence.
  { slug: 'instagram.create_comment', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.follow_user', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.get_home_feed', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.get_suggested_users', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.like_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.save_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.send_message', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.unfollow_user', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.unlike_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  { slug: 'instagram.unsave_post', origin: 'https://www.instagram.com', handlerFile: 'instagram.js', expectWrite: true },
  // tiktok x2 + x7 guarded -- public SSR reads are T1a; signed/private API rows stay guarded.
  { slug: 'tiktok.get_user_profile', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_video', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_current_user', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_followers', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_following', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_for_you_feed', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.get_notifications', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.search_users', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  { slug: 'tiktok.search_videos', origin: 'https://www.tiktok.com', handlerFile: 'tiktok.js' },
  // facebook x2 + x3 guarded -- conservative same-origin HTML reads; mutations stay guarded.
  { slug: 'facebook.get_current_user', origin: 'https://www.facebook.com', handlerFile: 'facebook.js' },
  { slug: 'facebook.search_marketplace', origin: 'https://www.facebook.com', handlerFile: 'facebook.js' },
  { slug: 'facebook.confirm_friend_request', origin: 'https://www.facebook.com', handlerFile: 'facebook.js', expectWrite: true },
  { slug: 'facebook.delete_friend_request', origin: 'https://www.facebook.com', handlerFile: 'facebook.js', expectWrite: true },
  { slug: 'facebook.react_to_post', origin: 'https://www.facebook.com', handlerFile: 'facebook.js', expectWrite: true },
  // threads x1 + x1 guarded -- single-thread reads are T1a; posting stays guarded.
  { slug: 'threads.get_thread', origin: 'https://www.threads.net', handlerFile: 'threads.js' },
  { slug: 'threads.create_thread', origin: 'https://www.threads.net', handlerFile: 'threads.js', expectWrite: true },
  // Stack Overflow x9 -- NEW public same-origin HTML read module, origin https://stackoverflow.com
  { slug: 'stackoverflow.get_answer', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.get_question', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.get_question_answers', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.get_similar_questions', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.get_tag_info', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.list_questions', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.list_tags', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.list_unanswered_questions', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  { slug: 'stackoverflow.search_questions', origin: 'https://stackoverflow.com', handlerFile: 'stackoverflow.js' },
  // cloudflare x25 -- NEW same-origin dashboard API read module, origin https://dash.cloudflare.com
  { slug: 'cloudflare.get_ruleset', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.get_user', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.get_zone', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.get_zone_settings', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.graphql_query', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_ai_models', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_alerting_policies', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_d1_databases', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_dns_records', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_email_addresses', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_email_routing_rules', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_firewall_rules', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_kv_namespaces', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_page_rules', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_pages_projects', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_queues', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_rules_lists', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_rulesets', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_ssl_certificates', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_tunnels', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_vectorize_indexes', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_waiting_rooms', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_worker_routes', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_workers', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  { slug: 'cloudflare.list_zones', origin: 'https://dash.cloudflare.com', handlerFile: 'cloudflare.js' },
  // slack x3 -- EXTEND existing module (40-03), origin https://app.slack.com
  { slug: 'slack.list_channels', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.list_members', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  { slug: 'slack.get_channel_info', origin: 'https://app.slack.com', handlerFile: 'slack.js' },
  // notion x2 -- EXTEND existing module (40-04), origin https://app.notion.com
  { slug: 'notion.search', origin: 'https://app.notion.com', handlerFile: 'notion.js' },
  { slug: 'notion.get_database', origin: 'https://app.notion.com', handlerFile: 'notion.js' },
  // terraform x21 -- NEW same-origin HCP Terraform /api/v2 read module, origin https://app.terraform.io
  { slug: 'terraform.get_apply', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_current_state_version', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_current_user', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_organization', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_plan', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_plan_json_output', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_team', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_variable_set', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.get_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_organization_members', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_organizations', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_projects', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_runs', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_state_versions', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_team_access', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_teams', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_variable_sets', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_workspace_variables', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },
  { slug: 'terraform.list_workspaces', origin: 'https://app.terraform.io', handlerFile: 'terraform.js' },

  // ===== Phase 41 (DEPTH-02) guarded WRITE slugs ============================
  // Each EXISTS as catalog/descriptors/opentabs__<app>__<op>.json (backing:'dom',
  // sideEffectClass:'WRITE'). The write head registers the EXACT slug so resolve()
  // UPGRADES the breadth WRITE descriptor dom->T1a (slug-exact, the same mechanism as
  // the read rows). expectWrite drives an ADDITIONAL assertion that the upgraded
  // descriptor.sideEffectClass === 'write' (the write rows carry the write class --
  // distinct from the read rows). The existsSync Wave-0-RED guard still applies: the
  // handler files exist, so each write row resolves the breadth T3 until ITS plan adds
  // the slug -> a deterministic FAIL (the correct RED), GREEN once the slug is registered.
  // gitlab x6 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'gitlab.create_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.create_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.create_note', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.merge_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.update_issue', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  { slug: 'gitlab.update_merge_request', origin: 'https://gitlab.com', handlerFile: 'gitlab.js', expectWrite: true },
  // notion x4 -- EXTEND the existing module (41-03), origin https://app.notion.com
  // (append_block is a READ descriptor -> excluded; create_database_item is the WRITE.)
  { slug: 'notion.create_page', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  { slug: 'notion.update_page', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  { slug: 'notion.create_database', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  { slug: 'notion.create_database_item', origin: 'https://app.notion.com', handlerFile: 'notion.js', expectWrite: true },
  // slack x1 -- EXTEND the existing module (41-04), origin https://app.slack.com
  // (slug-DISTINCT from the hand-only executable slack.chat.postMessage -- no collision.)
  { slug: 'slack.send_message', origin: 'https://app.slack.com', handlerFile: 'slack.js', expectWrite: true },
  // circleci x12 -- API mutations stay guarded fail-closed until live mutation-body UAT.
  { slug: 'circleci.approve_job', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.cancel_job', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.cancel_workflow', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.create_context', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.create_env_var', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.create_schedule', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.delete_context', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.delete_env_var', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.delete_schedule', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.rerun_workflow', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.trigger_pipeline', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  { slug: 'circleci.update_schedule', origin: 'https://app.circleci.com', handlerFile: 'circleci.js', expectWrite: true },
  // terraform x17 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'terraform.apply_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.cancel_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.create_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.create_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.create_variable', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.create_variable_set', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.create_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.delete_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.delete_variable', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.delete_variable_set', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.delete_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.discard_run', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.lock_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.unlock_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.update_project', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.update_variable', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  { slug: 'terraform.update_workspace', origin: 'https://app.terraform.io', handlerFile: 'terraform.js', expectWrite: true },
  // twilio x1 -- source-proven project-info read on www.twilio.com; REST replay reads stay unregistered.
  { slug: 'twilio.get_current_user', origin: 'https://www.twilio.com', handlerFile: 'twilio.js' },
  // twilio x11 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'twilio.create_api_key', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.create_application', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.create_call', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.create_messaging_service', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.create_verify_service', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.delete_api_key', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.delete_message', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.delete_recording', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.send_message', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.update_call', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  { slug: 'twilio.update_phone_number', origin: 'https://www.twilio.com', handlerFile: 'twilio.js', expectWrite: true },
  // tumblr x20 -- same-origin /api/v2 browser-bound reads, origin https://www.tumblr.com
  { slug: 'tumblr.get_blocks', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_blog_followers', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_blog_following', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_blog_info', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_blog_likes', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_blog_notifications', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_blog_posts', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_current_user', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_dashboard', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_draft_posts', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_filtered_tags', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_post_notes', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_queued_posts', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_recommended_blogs', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_submissions', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_user_following', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_user_likes', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.get_user_limits', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  { slug: 'tumblr.search_tagged', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js' },
  // tumblr x12 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'tumblr.add_filtered_tag', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.block_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.create_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.delete_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.edit_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.follow_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.like_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.reblog_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.remove_filtered_tag', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.unblock_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.unfollow_blog', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  { slug: 'tumblr.unlike_post', origin: 'https://www.tumblr.com', handlerFile: 'tumblr.js', expectWrite: true },
  // priceline x3 -- public same-origin travel search reads, origin https://www.priceline.com
  { slug: 'priceline.search_airports', origin: 'https://www.priceline.com', handlerFile: 'priceline.js' },
  { slug: 'priceline.search_locations', origin: 'https://www.priceline.com', handlerFile: 'priceline.js' },
  { slug: 'priceline.search_points_of_interest', origin: 'https://www.priceline.com', handlerFile: 'priceline.js' },
  // expedia x6 -- public same-origin search-page reads, origin https://www.expedia.com
  { slug: 'expedia.navigate_to_hotel', origin: 'https://www.expedia.com', handlerFile: 'expedia.js' },
  { slug: 'expedia.search_activities', origin: 'https://www.expedia.com', handlerFile: 'expedia.js' },
  { slug: 'expedia.search_car_rentals', origin: 'https://www.expedia.com', handlerFile: 'expedia.js' },
  { slug: 'expedia.search_cruises', origin: 'https://www.expedia.com', handlerFile: 'expedia.js' },
  { slug: 'expedia.search_flights', origin: 'https://www.expedia.com', handlerFile: 'expedia.js' },
  { slug: 'expedia.search_packages', origin: 'https://www.expedia.com', handlerFile: 'expedia.js' },
  // opentable x3 reads + x2 guarded writes -- same-origin /v1 head, origin https://www.opentable.com
  { slug: 'opentable.search_restaurants', origin: 'https://www.opentable.com', handlerFile: 'opentable.js' },
  { slug: 'opentable.get_restaurant', origin: 'https://www.opentable.com', handlerFile: 'opentable.js' },
  { slug: 'opentable.list_reservations', origin: 'https://www.opentable.com', handlerFile: 'opentable.js' },
  { slug: 'opentable.reserve_table', origin: 'https://www.opentable.com', handlerFile: 'opentable.js', expectWrite: true },
  { slug: 'opentable.cancel_reservation', origin: 'https://www.opentable.com', handlerFile: 'opentable.js', expectWrite: true },
  // booking x6 -- public same-origin search/property page reads, origin https://www.booking.com
  { slug: 'booking.get_property', origin: 'https://www.booking.com', handlerFile: 'booking.js' },
  { slug: 'booking.get_property_reviews', origin: 'https://www.booking.com', handlerFile: 'booking.js' },
  { slug: 'booking.navigate_to_property', origin: 'https://www.booking.com', handlerFile: 'booking.js' },
  { slug: 'booking.navigate_to_search', origin: 'https://www.booking.com', handlerFile: 'booking.js' },
  { slug: 'booking.search_destinations', origin: 'https://www.booking.com', handlerFile: 'booking.js' },
  { slug: 'booking.search_properties', origin: 'https://www.booking.com', handlerFile: 'booking.js' },
  // kayak x3 -- same-origin /v1 reads; price-alert creation stays guarded fail-closed.
  { slug: 'kayak.get_price_alert', origin: 'https://www.kayak.com', handlerFile: 'kayak.js' },
  { slug: 'kayak.search_flights', origin: 'https://www.kayak.com', handlerFile: 'kayak.js' },
  { slug: 'kayak.search_hotels', origin: 'https://www.kayak.com', handlerFile: 'kayak.js' },
  { slug: 'kayak.create_price_alert', origin: 'https://www.kayak.com', handlerFile: 'kayak.js', expectWrite: true },
  // mongodb x16 -- same-origin Atlas reads, origin https://cloud.mongodb.com
  { slug: 'mongodb.get_billing_plan', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.get_cluster', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.get_current_user', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.get_deployment_status', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.get_organization', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.get_project', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.get_user_security', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_alert_configs', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_alerts', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_clusters', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_database_users', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_ip_access_list', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_network_peering', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_organization_members', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_organization_projects', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  { slug: 'mongodb.list_organization_teams', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js' },
  // mongodb x4 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'mongodb.add_ip_access_entry', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js', expectWrite: true },
  { slug: 'mongodb.create_database_user', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js', expectWrite: true },
  { slug: 'mongodb.delete_database_user', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js', expectWrite: true },
  { slug: 'mongodb.delete_ip_access_entry', origin: 'https://cloud.mongodb.com', handlerFile: 'mongodb.js', expectWrite: true },
  // cockroachdb x13 -- same-origin CockroachDB Cloud gRPC reads, origin https://cockroachlabs.cloud
  { slug: 'cockroachdb.get_cluster', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.get_cluster_usage', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.get_credit_trial_status', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.get_networking_config', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.get_organization', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.get_resource_count', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.get_user_profile', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.list_cluster_nodes', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.list_clusters', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.list_database_names', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.list_database_users', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.list_invoices', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  { slug: 'cockroachdb.list_org_users', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js' },
  // cockroachdb x5 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'cockroachdb.create_database_user', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js', expectWrite: true },
  { slug: 'cockroachdb.delete_cluster', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js', expectWrite: true },
  { slug: 'cockroachdb.delete_database_user', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js', expectWrite: true },
  { slug: 'cockroachdb.execute_sql', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js', expectWrite: true },
  { slug: 'cockroachdb.set_delete_protection', origin: 'https://cockroachlabs.cloud', handlerFile: 'cockroachdb.js', expectWrite: true },
  // msword x12 -- Microsoft Graph read head, page-token bridged from Microsoft Word Online / SharePoint document pages.
  { slug: 'msword.get_active_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.get_current_user', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.get_document_text', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.get_drive', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.get_file_content', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.get_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.list_children', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.list_permissions', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.list_recent_documents', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.list_shared_with_me', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.list_versions', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  { slug: 'msword.search_files', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js' },
  // msword x15 -- Microsoft Graph mutations stay inert pending live mutation-body UAT.
  { slug: 'msword.append_to_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.copy_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.create_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.create_folder', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.create_sharing_link', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.delete_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.delete_permission', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.get_preview_url', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.move_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.rename_item', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.replace_text_in_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.restore_version', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.update_document', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.update_file_content', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  { slug: 'msword.upload_file', origin: 'https://word.cloud.microsoft', handlerFile: 'msword.js', expectWrite: true },
  // pinterest x14 -- same-origin /resource reads, origin https://www.pinterest.com
  { slug: 'pinterest.get_board_pins', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_board_sections', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_current_user', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_home_feed', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_notification_counts', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_related_pins', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_user_pins', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.get_user_profile', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.list_boards', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.list_followers', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.list_following', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.search_boards', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  { slug: 'pinterest.search_pins', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js' },
  // pinterest x10 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'pinterest.create_board', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.create_board_section', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.create_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.delete_board', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.delete_board_section', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.delete_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.follow_user', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.save_pin', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.unfollow_user', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  { slug: 'pinterest.update_board', origin: 'https://www.pinterest.com', handlerFile: 'pinterest.js', expectWrite: true },
  // starbucks x15 -- same-origin account/menu/cart/ordering reads, origin https://www.starbucks.com
  { slug: 'starbucks.find_stores', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_cards', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_cart', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_current_user', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_earn_rates', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_favorite_products', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_feed', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_payment_methods', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_previous_orders', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_product', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_rewards', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_store_menu', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.get_store_time_slots', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.navigate_to_checkout', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  { slug: 'starbucks.price_order', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js' },
  // starbucks x5 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'starbucks.add_favorite_product', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js', expectWrite: true },
  { slug: 'starbucks.add_product_to_cart', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js', expectWrite: true },
  { slug: 'starbucks.delete_favorite_product', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js', expectWrite: true },
  { slug: 'starbucks.toggle_favorite_store', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js', expectWrite: true },
  { slug: 'starbucks.update_product_quantity', origin: 'https://www.starbucks.com', handlerFile: 'starbucks.js', expectWrite: true },
  // medium x15 -- same-origin query-only GraphQL reads, origin https://medium.com
  { slug: 'medium.get_collection', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_current_user', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_notification_count', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_post', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_post_responses', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_reading_list', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_recommended_publishers', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_tag_feed', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.get_user_profile', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.list_followers', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.list_following', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.list_recommended_tags', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.search_collections', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.search_posts', origin: 'https://medium.com', handlerFile: 'medium.js' },
  { slug: 'medium.search_tags', origin: 'https://medium.com', handlerFile: 'medium.js' },
  // medium x5 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'medium.clap_post', origin: 'https://medium.com', handlerFile: 'medium.js', expectWrite: true },
  { slug: 'medium.follow_tag', origin: 'https://medium.com', handlerFile: 'medium.js', expectWrite: true },
  { slug: 'medium.follow_user', origin: 'https://medium.com', handlerFile: 'medium.js', expectWrite: true },
  { slug: 'medium.unfollow_tag', origin: 'https://medium.com', handlerFile: 'medium.js', expectWrite: true },
  { slug: 'medium.unfollow_user', origin: 'https://medium.com', handlerFile: 'medium.js', expectWrite: true },
  // dominos x6 -- same-origin explicit-input GraphQL reads, origin https://www.dominos.com
  { slug: 'dominos.search_address', origin: 'https://www.dominos.com', handlerFile: 'dominos.js' },
  { slug: 'dominos.find_stores_by_address', origin: 'https://www.dominos.com', handlerFile: 'dominos.js' },
  { slug: 'dominos.get_menu_categories', origin: 'https://www.dominos.com', handlerFile: 'dominos.js' },
  { slug: 'dominos.get_category_products', origin: 'https://www.dominos.com', handlerFile: 'dominos.js' },
  { slug: 'dominos.get_product', origin: 'https://www.dominos.com', handlerFile: 'dominos.js' },
  { slug: 'dominos.get_deal', origin: 'https://www.dominos.com', handlerFile: 'dominos.js' },
  // whatsapp x7 -- same-origin page-state reads, origin https://web.whatsapp.com
  { slug: 'whatsapp.get_current_user', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.get_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.get_contact', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.get_group_invite_link', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.list_chats', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.list_contacts', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  { slug: 'whatsapp.list_messages', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js' },
  // whatsapp x14 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'whatsapp.archive_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.block_contact', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.clear_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.create_group', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.delete_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.delete_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.mark_chat_read', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.mute_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.pin_chat', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.revoke_group_invite_link', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.revoke_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.send_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.star_message', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  { slug: 'whatsapp.unblock_contact', origin: 'https://web.whatsapp.com', handlerFile: 'whatsapp.js', expectWrite: true },
  // discord x13 -- same-origin Discord API reads, origin https://discord.com
  { slug: 'discord.get_channel_info', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.get_guild_info', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.get_message', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.get_user_profile', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.list_channels', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.list_dms', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.list_guilds', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.list_members', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.list_pinned_messages', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.list_roles', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.read_messages', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.read_thread', origin: 'https://discord.com', handlerFile: 'discord.js' },
  { slug: 'discord.search_messages', origin: 'https://discord.com', handlerFile: 'discord.js' },
  // discord x13 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'discord.add_reaction', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.create_channel', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.create_thread', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.delete_channel', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.delete_message', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.edit_channel', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.edit_message', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.open_dm', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.pin_message', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.remove_reaction', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.send_message', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.unpin_message', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  { slug: 'discord.upload_file', origin: 'https://discord.com', handlerFile: 'discord.js', expectWrite: true },
  // chipotle x4 -- public no-auth services reads, origin https://www.chipotle.com
  { slug: 'chipotle.get_ordering_status', origin: 'https://www.chipotle.com', handlerFile: 'chipotle.js' },
  { slug: 'chipotle.get_restaurant', origin: 'https://www.chipotle.com', handlerFile: 'chipotle.js' },
  { slug: 'chipotle.get_menu', origin: 'https://www.chipotle.com', handlerFile: 'chipotle.js' },
  { slug: 'chipotle.get_preconfigured_meals', origin: 'https://www.chipotle.com', handlerFile: 'chipotle.js' },
  // pandaexpress x4 -- public same-origin Olo reads, origin https://www.pandaexpress.com
  { slug: 'pandaexpress.find_restaurants', origin: 'https://www.pandaexpress.com', handlerFile: 'pandaexpress.js' },
  { slug: 'pandaexpress.get_restaurant', origin: 'https://www.pandaexpress.com', handlerFile: 'pandaexpress.js' },
  { slug: 'pandaexpress.get_restaurant_menu', origin: 'https://www.pandaexpress.com', handlerFile: 'pandaexpress.js' },
  { slug: 'pandaexpress.get_product_modifiers', origin: 'https://www.pandaexpress.com', handlerFile: 'pandaexpress.js' },
  // grubhub x3 -- same-origin reviewed reads, origin https://www.grubhub.com
  { slug: 'grubhub.list_restaurants', origin: 'https://www.grubhub.com', handlerFile: 'grubhub.js' },
  { slug: 'grubhub.get_restaurant', origin: 'https://www.grubhub.com', handlerFile: 'grubhub.js' },
  { slug: 'grubhub.list_orders', origin: 'https://www.grubhub.com', handlerFile: 'grubhub.js' },
  // grubhub x2 -- paid order/cancel rows stay guarded fail-closed until live UAT.
  { slug: 'grubhub.place_order', origin: 'https://www.grubhub.com', handlerFile: 'grubhub.js', expectWrite: true },
  { slug: 'grubhub.cancel_order', origin: 'https://www.grubhub.com', handlerFile: 'grubhub.js', expectWrite: true },
  // costco x3 -- public no-auth ecom reads, origin https://www.costco.com
  { slug: 'costco.get_product', origin: 'https://www.costco.com', handlerFile: 'costco.js' },
  { slug: 'costco.get_products', origin: 'https://www.costco.com', handlerFile: 'costco.js' },
  { slug: 'costco.get_product_availability', origin: 'https://www.costco.com', handlerFile: 'costco.js' },
  // instacart x6 -- same-origin GraphQL account/cart/order reads, origin https://www.instacart.com
  { slug: 'instacart.get_current_user', origin: 'https://www.instacart.com', handlerFile: 'instacart.js' },
  { slug: 'instacart.list_addresses', origin: 'https://www.instacart.com', handlerFile: 'instacart.js' },
  { slug: 'instacart.list_active_carts', origin: 'https://www.instacart.com', handlerFile: 'instacart.js' },
  { slug: 'instacart.get_cart', origin: 'https://www.instacart.com', handlerFile: 'instacart.js' },
  { slug: 'instacart.list_orders', origin: 'https://www.instacart.com', handlerFile: 'instacart.js' },
  { slug: 'instacart.get_order', origin: 'https://www.instacart.com', handlerFile: 'instacart.js' },
  // doordash x6 -- same-origin GraphQL account/order/payment/notification reads, origin https://www.doordash.com
  { slug: 'doordash.get_current_user', origin: 'https://www.doordash.com', handlerFile: 'doordash.js' },
  { slug: 'doordash.list_addresses', origin: 'https://www.doordash.com', handlerFile: 'doordash.js' },
  { slug: 'doordash.list_orders', origin: 'https://www.doordash.com', handlerFile: 'doordash.js' },
  { slug: 'doordash.get_order', origin: 'https://www.doordash.com', handlerFile: 'doordash.js' },
  { slug: 'doordash.list_payment_methods', origin: 'https://www.doordash.com', handlerFile: 'doordash.js' },
  { slug: 'doordash.get_notifications', origin: 'https://www.doordash.com', handlerFile: 'doordash.js' },
  // lucid x14 -- first-party authenticated API reads, origin https://lucid.app
  { slug: 'lucid.get_account', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_current_user', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_document', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_document_count', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_document_pages', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_document_role', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_document_status', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_folder_entry', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.get_user_permissions', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.list_account_users', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.list_documents', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.list_folder_entries', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.list_groups', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  { slug: 'lucid.search_documents', origin: 'https://lucid.app', handlerFile: 'lucid.js' },
  // lucid x6 -- guarded fail-closed until live mutation-body UAT records activation evidence.
  { slug: 'lucid.create_document', origin: 'https://lucid.app', handlerFile: 'lucid.js', expectWrite: true },
  { slug: 'lucid.create_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js', expectWrite: true },
  { slug: 'lucid.delete_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js', expectWrite: true },
  { slug: 'lucid.move_document_to_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js', expectWrite: true },
  { slug: 'lucid.rename_folder', origin: 'https://lucid.app', handlerFile: 'lucid.js', expectWrite: true },
  { slug: 'lucid.trash_document', origin: 'https://lucid.app', handlerFile: 'lucid.js', expectWrite: true },
  // target x2 -- same-origin public HTML reads, origin https://www.target.com
  { slug: 'target.search_products', origin: 'https://www.target.com', handlerFile: 'target.js' },
  { slug: 'target.get_product', origin: 'https://www.target.com', handlerFile: 'target.js' },
  // walmart x4 -- same-origin public HTML reads, origin https://www.walmart.com
  { slug: 'walmart.search_products', origin: 'https://www.walmart.com', handlerFile: 'walmart.js' },
  { slug: 'walmart.get_product', origin: 'https://www.walmart.com', handlerFile: 'walmart.js' },
  { slug: 'walmart.get_product_reviews', origin: 'https://www.walmart.com', handlerFile: 'walmart.js' },
  { slug: 'walmart.get_store', origin: 'https://www.walmart.com', handlerFile: 'walmart.js' },
  // ebay x7 reads + x1 guarded write, origin https://www.ebay.com
  { slug: 'ebay.get_current_user', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.get_deals', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.get_item', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.get_seller_profile', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.get_watchlist', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.search_items', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.search_suggestions', origin: 'https://www.ebay.com', handlerFile: 'ebay.js' },
  { slug: 'ebay.watch_item', origin: 'https://www.ebay.com', handlerFile: 'ebay.js', expectWrite: true },
  // Etsy x3 same-origin marketplace reads + x2 guarded cart/payment writes, origin https://www.etsy.com
  { slug: 'etsy.search_listings', origin: 'https://www.etsy.com', handlerFile: 'etsy.js' },
  { slug: 'etsy.get_listing', origin: 'https://www.etsy.com', handlerFile: 'etsy.js' },
  { slug: 'etsy.list_orders', origin: 'https://www.etsy.com', handlerFile: 'etsy.js' },
  { slug: 'etsy.add_to_cart', origin: 'https://www.etsy.com', handlerFile: 'etsy.js', expectWrite: true },
  { slug: 'etsy.checkout', origin: 'https://www.etsy.com', handlerFile: 'etsy.js', expectWrite: true },
  // Fiverr x7 same-origin marketplace/message reads + x1 guarded message write, origin https://www.fiverr.com
  { slug: 'fiverr.draft_message', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.get_conversation', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.get_current_page_context', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.get_gig_details', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.get_seller_profile', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.list_conversations', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.search_gigs', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js' },
  { slug: 'fiverr.send_message', origin: 'https://www.fiverr.com', handlerFile: 'fiverr.js', expectWrite: true },
  // Home Depot x6 reads + x1 guarded write, origin https://www.homedepot.com
  { slug: 'homedepot.search_products', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  { slug: 'homedepot.get_product', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  { slug: 'homedepot.search_stores', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  { slug: 'homedepot.get_cart', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  { slug: 'homedepot.get_saved_items', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  { slug: 'homedepot.get_store_context', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js' },
  { slug: 'homedepot.add_to_cart', origin: 'https://www.homedepot.com', handlerFile: 'homedepot.js', expectWrite: true },
  // airbnb x13 -- same-origin GraphQL/page-state reads, origin https://www.airbnb.com
  { slug: 'airbnb.get_current_user', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_header_info', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_inbox_filters', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_listing_from_page', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_map_viewport_info', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_message_thread', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_search_results', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_user_thumbnail', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.get_wishlist_items', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.is_host', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.list_message_threads', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.list_wishlists', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  { slug: 'airbnb.search_suggestions', origin: 'https://www.airbnb.com', handlerFile: 'airbnb.js' },
  // confluence x13 reads + x8 guarded mutations, representative tenant origin https://example.atlassian.net
  { slug: 'confluence.get_page', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.get_page_children', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.get_space', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.get_user_profile', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_comment_replies', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_comments', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_inline_comments', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_labels', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_page_attachments', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_page_versions', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_pages', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.list_spaces', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.search', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js' },
  { slug: 'confluence.add_label', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.create_comment', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.create_inline_comment', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.create_page', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.delete_comment', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.delete_page', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.remove_label', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  { slug: 'confluence.update_page', origin: 'https://example.atlassian.net', handlerFile: 'confluence.js', expectWrite: true },
  // airtable x6 -- same-origin /v0.3 internal API reads, origin https://airtable.com
  { slug: 'airtable.get_base_schema', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  { slug: 'airtable.get_field_choices', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  { slug: 'airtable.get_record', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  { slug: 'airtable.get_record_activity', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  { slug: 'airtable.list_records', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  { slug: 'airtable.list_workspaces', origin: 'https://airtable.com', handlerFile: 'airtable.js' },
  // airtable x2 -- comments and cell updates stay guarded fail-closed until live body UAT.
  { slug: 'airtable.create_comment', origin: 'https://airtable.com', handlerFile: 'airtable.js', expectWrite: true },
  { slug: 'airtable.update_cell', origin: 'https://airtable.com', handlerFile: 'airtable.js', expectWrite: true },
  // chatgpt x13 -- same-origin backend-api reads, origin https://chatgpt.com
  { slug: 'chatgpt.discover_gpts', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_account_info', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_beta_features', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_conversation', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_current_user', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_custom_instructions', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_gpt', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_memories', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.get_prompt_library', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.list_conversations', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.list_models', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.list_shared_conversations', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  { slug: 'chatgpt.search_conversations', origin: 'https://chatgpt.com', handlerFile: 'chatgpt.js' },
  // claude x7 -- same-origin first-party /api reads.
  { slug: 'claude.get_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.get_current_user', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.get_project', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.list_conversations', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.list_models', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.list_organizations', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  { slug: 'claude.list_projects', origin: 'https://claude.ai', handlerFile: 'claude.js' },
  // claude x7 -- conversation/project mutations stay guarded fail-closed until live body UAT.
  { slug: 'claude.create_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  { slug: 'claude.create_project', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  { slug: 'claude.delete_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  { slug: 'claude.delete_project', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  { slug: 'claude.send_message', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  { slug: 'claude.update_conversation', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  { slug: 'claude.update_project', origin: 'https://claude.ai', handlerFile: 'claude.js', expectWrite: true },
  // gemini x4 reads + x2 guarded writes -- same-origin gemini.google.com UI/RPC paths.
  { slug: 'gemini.get_current_user', origin: 'https://gemini.google.com', handlerFile: 'gemini.js' },
  { slug: 'gemini.list_models', origin: 'https://gemini.google.com', handlerFile: 'gemini.js' },
  { slug: 'gemini.list_conversations', origin: 'https://gemini.google.com', handlerFile: 'gemini.js' },
  { slug: 'gemini.get_conversation', origin: 'https://gemini.google.com', handlerFile: 'gemini.js' },
  { slug: 'gemini.create_conversation', origin: 'https://gemini.google.com', handlerFile: 'gemini.js', expectWrite: true },
  { slug: 'gemini.send_message', origin: 'https://gemini.google.com', handlerFile: 'gemini.js', expectWrite: true },
  // excel x10 -- Microsoft Graph workbook reads, page-token bridged from Excel Online / SharePoint workbook pages.
  { slug: 'excel.get_current_user', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.get_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.get_table_columns', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.get_table_rows', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.get_used_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.get_workbook_info', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.list_charts', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.list_named_items', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.list_tables', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  { slug: 'excel.list_worksheets', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js' },
  // excel x19 -- workbook mutations, formula temp-cell writes, and auth-cache reload stay guarded until live UAT.
  { slug: 'excel.add_named_item', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.add_table_column', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.add_table_row', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.add_worksheet', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.calculate_workbook', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.clear_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.create_chart', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.create_table', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.delete_chart', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.delete_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.delete_table', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.delete_table_row', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.delete_worksheet', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.evaluate_formula', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.insert_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.reauthenticate', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.sort_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.update_range', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  { slug: 'excel.update_worksheet', origin: 'https://excel.cloud.microsoft', handlerFile: 'excel.js', expectWrite: true },
  // powerpoint x14 -- Microsoft Graph read head, page-token bridged from https://powerpoint.cloud.microsoft.
  { slug: 'powerpoint.get_current_user', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_download_url', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_drive', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_slide_content', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_slide_notes', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_slides', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.get_thumbnails', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.list_children', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.list_permissions', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.list_recent', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.list_shared_with_me', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.list_versions', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  { slug: 'powerpoint.search_files', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js' },
  // powerpoint x12 -- Graph mutations and PPTX edits stay guarded until live mutation-body UAT.
  { slug: 'powerpoint.copy_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.create_folder', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.create_presentation', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.create_sharing_link', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.delete_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.delete_permission', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.delete_slide', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.get_preview_url', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.move_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.rename_item', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.update_slide_notes', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  { slug: 'powerpoint.update_slide_text', origin: 'https://powerpoint.cloud.microsoft', handlerFile: 'powerpoint.js', expectWrite: true },
  // outlook x12 -- Microsoft Graph read head, page-token bridged from https://outlook.cloud.microsoft.
  { slug: 'outlook.download_attachment', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.get_attachment_content', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.get_calendar_view', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.get_current_user', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.get_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.get_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.list_attachments', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.list_calendars', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.list_events', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.list_folders', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.list_messages', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  { slug: 'outlook.search_messages', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js' },
  // outlook x12 -- Graph mutations and POST-shaped schedule reads stay guarded until live mutation-body UAT.
  { slug: 'outlook.create_draft', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.create_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.delete_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.delete_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.forward_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.get_schedule', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.move_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.reply_to_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.respond_to_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.send_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.update_event', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  { slug: 'outlook.update_message', origin: 'https://outlook.cloud.microsoft', handlerFile: 'outlook.js', expectWrite: true },
  // onenote x8 -- Microsoft Graph read head, page-token bridged from https://onenote.cloud.microsoft.
  { slug: 'onenote.get_current_user', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.get_notebook', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.get_recent_notebooks', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.get_section', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.get_section_group', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.list_notebooks', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.list_section_groups', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  { slug: 'onenote.list_sections', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js' },
  // onenote x4 -- notebook/page/section creation stays guarded until live mutation-body UAT.
  { slug: 'onenote.create_notebook', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js', expectWrite: true },
  { slug: 'onenote.create_page', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js', expectWrite: true },
  { slug: 'onenote.create_section', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js', expectWrite: true },
  { slug: 'onenote.create_section_group', origin: 'https://onenote.cloud.microsoft', handlerFile: 'onenote.js', expectWrite: true },
  // newrelic x12 -- same-origin NerdGraph read/query head, origin https://one.newrelic.com.
  { slug: 'newrelic.get_current_user', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.get_dashboard', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.get_entity', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.get_organization', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.list_accounts', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.list_alert_policies', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.list_dashboards', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.list_entity_tags', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.list_event_types', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.list_nrql_conditions', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.run_nrql_query', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  { slug: 'newrelic.search_entities', origin: 'https://one.newrelic.com', handlerFile: 'newrelic.js' },
  // datadog x46 -- same-origin app.datadoghq.com GET reads only.
  { slug: 'datadog.get_current_user', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_dashboard', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_downtime', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_host_info', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_host_totals', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_incident', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_metric_metadata', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_monitor', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_monitor_groups', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_notebook', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_org_config', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_permissions', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_service_definition', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_service_dependencies', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_slo', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_slo_history', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_synthetics_results', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_synthetics_test', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_trace', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_usage_summary', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.get_user', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_api_keys', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_dashboards', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_downtimes', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_host_tags', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_hosts', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_incidents', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_metric_tags', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_metrics', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_monitor_downtimes', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_monitor_tags', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_monitors', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_notebooks', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_services', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_slo_corrections', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_slos', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_synthetics_tests', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_teams', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.list_users', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.query_metrics', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.search_dashboards', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.search_dashboards_advanced', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.search_monitors', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.search_notebooks', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.search_services', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  { slug: 'datadog.search_slos', origin: 'https://app.datadoghq.com', handlerFile: 'datadog.js' },
  // posthog x24 -- same-origin /api GET reads on us.posthog.com.
  { slug: 'posthog.get_current_user', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_organization', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_projects', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_project', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_dashboards', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_dashboard', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_insights', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_insight', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_feature_flags', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_feature_flag', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_experiments', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_experiment', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_annotations', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_persons', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_person', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_cohorts', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_cohort', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_surveys', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_survey', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_actions', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.get_action', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_events', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_event_definitions', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  { slug: 'posthog.list_property_definitions', origin: 'https://us.posthog.com', handlerFile: 'posthog.js' },
  // posthog x14 -- write/query/delete rows stay guarded fail-closed until live body UAT.
  { slug: 'posthog.create_annotation', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.create_dashboard', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.create_experiment', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.create_feature_flag', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.create_insight', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.run_query', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.run_trends_query', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.update_dashboard', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.update_feature_flag', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.update_insight', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.delete_annotation', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.delete_dashboard', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.delete_feature_flag', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  { slug: 'posthog.delete_insight', origin: 'https://us.posthog.com', handlerFile: 'posthog.js', expectWrite: true },
  // grafana x3 -- same-origin dashboard and metric reads, origin https://grafana.com.
  { slug: 'grafana.get_dashboard', origin: 'https://grafana.com', handlerFile: 'grafana.js' },
  { slug: 'grafana.list_dashboards', origin: 'https://grafana.com', handlerFile: 'grafana.js' },
  { slug: 'grafana.query_metrics', origin: 'https://grafana.com', handlerFile: 'grafana.js' },
  // webflow x15 -- same-origin /api GET reads, origin https://webflow.com.
  { slug: 'webflow.get_current_user', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_site', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_site_domains', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_site_hosting', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_site_pages', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_site_permissions', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_workspace', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_workspace_billing', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_workspace_entitlements', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.get_workspace_permissions', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.list_folders', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.list_site_forms', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.list_sites', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.list_workspace_members', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  { slug: 'webflow.list_workspaces', origin: 'https://webflow.com', handlerFile: 'webflow.js' },
  // ynab x11 -- same-origin app.ynab.com internal API reads.
  { slug: 'ynab.get_account', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.get_current_user', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.get_month', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.get_plan', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.get_transaction', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.list_accounts', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.list_categories', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.list_months', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.list_payees', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.list_scheduled_transactions', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  { slug: 'ynab.list_transactions', origin: 'https://app.ynab.com', handlerFile: 'ynab.js' },
  // ynab x11 -- budget mutations stay guarded fail-closed until live body UAT.
  { slug: 'ynab.create_category', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.create_category_group', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.create_transaction', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.delete_category', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.delete_category_group', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.delete_transaction', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.move_category_budget', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.snooze_category_goal', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.update_category', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.update_category_budget', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  { slug: 'ynab.update_transaction', origin: 'https://app.ynab.com', handlerFile: 'ynab.js', expectWrite: true },
  // calendly x9 -- same-origin /api GET reads with CSRF meta bootstrap.
  { slug: 'calendly.get_current_user', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.get_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.get_organization', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.get_organization_statistics', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.get_user_busy_times', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.get_user_permissions', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.list_calendar_accounts', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.list_event_types', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  { slug: 'calendly.list_scheduled_events', origin: 'https://calendly.com', handlerFile: 'calendly.js' },
  // calendly x6 -- event-type mutations stay guarded fail-closed until live body UAT.
  { slug: 'calendly.activate_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js', expectWrite: true },
  { slug: 'calendly.clone_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js', expectWrite: true },
  { slug: 'calendly.create_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js', expectWrite: true },
  { slug: 'calendly.deactivate_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js', expectWrite: true },
  { slug: 'calendly.delete_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js', expectWrite: true },
  { slug: 'calendly.update_event_type', origin: 'https://calendly.com', handlerFile: 'calendly.js', expectWrite: true },
  // dockerhub x9 -- same-origin hub.docker.com reads using the browser session token carrier.
  { slug: 'dockerhub.get_current_user', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.get_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.get_tag', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.get_user_profile', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.list_organizations', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.list_repositories', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.list_tags', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.search_catalog', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  { slug: 'dockerhub.search_repositories', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js' },
  // dockerhub x3 -- repository mutations stay guarded fail-closed until live body UAT.
  { slug: 'dockerhub.create_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js', expectWrite: true },
  { slug: 'dockerhub.update_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js', expectWrite: true },
  { slug: 'dockerhub.delete_repository', origin: 'https://hub.docker.com', handlerFile: 'dockerhub.js', expectWrite: true },
  // tinder x6 -- api.gotinder.com GET reads authenticated by first-party page storage.
  { slug: 'tinder.get_current_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.get_fast_match_count', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.get_fast_match_preview', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.get_recommendations', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.get_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  { slug: 'tinder.list_matches', origin: 'https://www.tinder.com', handlerFile: 'tinder.js' },
  // tinder x10 -- swipe/message/profile/location mutations stay guarded fail-closed.
  { slug: 'tinder.get_metadata', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.get_updates', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.like_message', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.like_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.pass_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.send_message', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.super_like_user', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.unmatch', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.update_location', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  { slug: 'tinder.update_profile', origin: 'https://www.tinder.com', handlerFile: 'tinder.js', expectWrite: true },
  // sentry x19 -- same-origin /api/0 reads on sentry.io.
  { slug: 'sentry.get_event', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.get_issue', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.get_organization', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.get_project', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.get_project_keys', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.get_release', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_alerts', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_comments', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_issue_events', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_issue_tags', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_members', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_monitors', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_organizations', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_project_environments', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_projects', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_releases', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_replays', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.list_teams', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  { slug: 'sentry.search_issues', origin: 'https://sentry.io', handlerFile: 'sentry.js' },
  // sentry x2 -- comments/issues mutations stay guarded fail-closed until live body UAT.
  { slug: 'sentry.create_comment', origin: 'https://sentry.io', handlerFile: 'sentry.js', expectWrite: true },
  { slug: 'sentry.update_issue', origin: 'https://sentry.io', handlerFile: 'sentry.js', expectWrite: true },
  // notebooklm x9 -- same-origin batchexecute reads and proven navigation URL.
  { slug: 'notebooklm.get_current_user', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.get_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.get_notebook_guide', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.get_notes', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.get_project_details', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.list_chat_sessions', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.list_notebooks', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.list_sources', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  { slug: 'notebooklm.navigate_to_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js' },
  // notebooklm x10 -- RPC mutations stay guarded fail-closed until live body UAT.
  { slug: 'notebooklm.add_source_text', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.add_source_url', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.copy_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.create_note', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.create_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.delete_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.delete_notes', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.delete_sources', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.rename_notebook', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  { slug: 'notebooklm.update_note', origin: 'https://notebooklm.google.com', handlerFile: 'notebooklm.js', expectWrite: true },
  // aws x13 -- console metadata reads plus reviewed fail-closed SigV4-bridge-pending reads.
  { slug: 'aws.describe_instance', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.get_current_user', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.get_function', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_alarms', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_functions', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_iam_roles', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_iam_users', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_instances', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_log_groups', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_regions', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_security_groups', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_subnets', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  { slug: 'aws.list_vpcs', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js' },
  // aws x3 -- mutations stay guarded fail-closed until an approved AWS request bridge exists.
  { slug: 'aws.invoke_function', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js', expectWrite: true },
  { slug: 'aws.start_instance', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js', expectWrite: true },
  { slug: 'aws.stop_instance', origin: 'https://console.aws.amazon.com', handlerFile: 'aws.js', expectWrite: true },
  // shopify x3 -- same-origin Shopify Admin reads.
  { slug: 'shopify.list_products', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js' },
  { slug: 'shopify.get_product', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js' },
  { slug: 'shopify.list_orders', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js' },
  // shopify x2 -- payment/destructive mutations stay guarded fail-closed until live body UAT.
  { slug: 'shopify.create_order', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js', expectWrite: true },
  { slug: 'shopify.cancel_order', origin: 'https://admin.shopify.com', handlerFile: 'shopify.js', expectWrite: true },
  // gcal x9 -- Calendar reads bridge through the page-owned gapi client.
  { slug: 'gcal.get_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.get_colors', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.get_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.get_setting', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.list_calendars', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.list_event_instances', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.list_events', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.list_settings', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  { slug: 'gcal.search_events', origin: 'https://calendar.google.com', handlerFile: 'gcal.js' },
  // gcal x9 -- Calendar mutations/freebusy stay guarded fail-closed until live body UAT.
  { slug: 'gcal.create_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.create_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.delete_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.delete_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.move_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.query_freebusy', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.quick_add_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.update_calendar', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  { slug: 'gcal.update_event', origin: 'https://calendar.google.com', handlerFile: 'gcal.js', expectWrite: true },
  // gmaps x15 -- Maps URL/state/public HTML reads pinned to www.google.com.
  { slug: 'gmaps.get_current_view', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.get_directions_info', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.get_directions_url', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.get_map_url', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.get_place_details', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.get_place_url', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.navigate_to_directions', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.navigate_to_location', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.navigate_to_place', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.navigate_to_search', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.search_nearby', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.search_places', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.share_location', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.toggle_layer', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  { slug: 'gmaps.zoom_map', origin: 'https://www.google.com', handlerFile: 'gmaps.js' },
  // gmaps x1 -- Maps travel-mode mutation stays guarded fail-closed until live body UAT.
  { slug: 'gmaps.set_travel_mode', origin: 'https://www.google.com', handlerFile: 'gmaps.js', expectWrite: true },
  // craigslist x6 -- first-party accounts.craigslist.org page context read head.
  { slug: 'craigslist.get_current_user', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.get_saved_search_counts', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.list_renewable_postings', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.list_payment_cards', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.list_chat_conversations', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  { slug: 'craigslist.get_chat_messages', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js' },
  // craigslist x3 -- posting/payment mutations stay guarded fail-closed until live body UAT.
  { slug: 'craigslist.renew_all_postings', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js', expectWrite: true },
  { slug: 'craigslist.set_default_payment_card', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js', expectWrite: true },
  { slug: 'craigslist.delete_payment_card', origin: 'https://accounts.craigslist.org', handlerFile: 'craigslist.js', expectWrite: true },
  // ticketmaster x3 -- same-origin first-party event/order reads.
  { slug: 'ticketmaster.search_events', origin: 'https://www.ticketmaster.com', handlerFile: 'ticketmaster.js' },
  { slug: 'ticketmaster.get_event', origin: 'https://www.ticketmaster.com', handlerFile: 'ticketmaster.js' },
  { slug: 'ticketmaster.list_orders', origin: 'https://www.ticketmaster.com', handlerFile: 'ticketmaster.js' },
  // ticketmaster x1 -- ticket purchase stays guarded fail-closed until live body UAT.
  { slug: 'ticketmaster.buy_tickets', origin: 'https://www.ticketmaster.com', handlerFile: 'ticketmaster.js', expectWrite: true },
  // eventbrite x3 -- same-origin first-party event/order reads.
  { slug: 'eventbrite.search_events', origin: 'https://www.eventbrite.com', handlerFile: 'eventbrite.js' },
  { slug: 'eventbrite.get_event', origin: 'https://www.eventbrite.com', handlerFile: 'eventbrite.js' },
  { slug: 'eventbrite.list_orders', origin: 'https://www.eventbrite.com', handlerFile: 'eventbrite.js' },
  // eventbrite x1 -- paid registration stays guarded fail-closed until live body UAT.
  { slug: 'eventbrite.register_for_event', origin: 'https://www.eventbrite.com', handlerFile: 'eventbrite.js', expectWrite: true },
  // zendesk x13 -- same-origin tenant /api/v2 reads.
  { slug: 'zendesk.get_current_user', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.get_organization', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.get_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.get_user', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.get_view_tickets', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_groups', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_organizations', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_tags', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_ticket_comments', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_tickets', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_users', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.list_views', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  { slug: 'zendesk.search', origin: 'https://zendesk.com', handlerFile: 'zendesk.js' },
  // zendesk x4 -- ticket mutations stay guarded fail-closed until live body UAT.
  { slug: 'zendesk.add_ticket_comment', origin: 'https://zendesk.com', handlerFile: 'zendesk.js', expectWrite: true },
  { slug: 'zendesk.create_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js', expectWrite: true },
  { slug: 'zendesk.delete_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js', expectWrite: true },
  { slug: 'zendesk.update_ticket', origin: 'https://zendesk.com', handlerFile: 'zendesk.js', expectWrite: true },
  // coinbase x11 -- same-origin /graphql/query reads.
  { slug: 'coinbase.compare_asset_prices', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_asset_by_slug', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_asset_by_symbol', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_asset_by_uuid', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_asset_categories', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_asset_networks', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_asset_price', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.get_current_user', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.list_portfolios', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.list_price_alerts', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  { slug: 'coinbase.list_watchlists', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js' },
  // coinbase x6 -- watchlist and alert mutations stay guarded fail-closed pending live body UAT.
  { slug: 'coinbase.add_watchlist_item', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js', expectWrite: true },
  { slug: 'coinbase.create_price_alert', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js', expectWrite: true },
  { slug: 'coinbase.create_watchlist', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js', expectWrite: true },
  { slug: 'coinbase.delete_price_alert', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js', expectWrite: true },
  { slug: 'coinbase.delete_watchlist', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js', expectWrite: true },
  { slug: 'coinbase.remove_watchlist_item', origin: 'https://www.coinbase.com', handlerFile: 'coinbase.js', expectWrite: true },
  // figma x10 -- same-origin www.figma.com/api GET reads.
  { slug: 'figma.get_current_user', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.get_file', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.get_file_components', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.get_team_info', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.list_comments', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.list_file_versions', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.list_files', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.list_recent_files', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.list_team_projects', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  { slug: 'figma.list_teams', origin: 'https://www.figma.com', handlerFile: 'figma.js' },
  // figma x4 -- mutations stay guarded fail-closed until live body UAT.
  { slug: 'figma.create_file', origin: 'https://www.figma.com', handlerFile: 'figma.js', expectWrite: true },
  { slug: 'figma.update_file', origin: 'https://www.figma.com', handlerFile: 'figma.js', expectWrite: true },
  { slug: 'figma.trash_file', origin: 'https://www.figma.com', handlerFile: 'figma.js', expectWrite: true },
  { slug: 'figma.post_comment', origin: 'https://www.figma.com', handlerFile: 'figma.js', expectWrite: true },
  // gdocs x7 -- same-origin docs.google.com Drive/document reads.
  { slug: 'gdocs.get_current_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.get_current_user', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.get_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.get_document_text', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.list_comments', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.list_recent_documents', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  { slug: 'gdocs.search_documents', origin: 'https://docs.google.com', handlerFile: 'gdocs.js' },
  // gdocs x12 -- document/comment mutations stay guarded fail-closed until live body UAT.
  { slug: 'gdocs.copy_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.create_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.create_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.delete_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.delete_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.delete_reply', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.reopen_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.reply_to_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.resolve_comment', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.restore_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.trash_document', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  { slug: 'gdocs.update_document_title', origin: 'https://docs.google.com', handlerFile: 'gdocs.js', expectWrite: true },
  // spotify x11 -- Web Player page-bearer API/GraphQL reads.
  { slug: 'spotify.get_album', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_artist', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_available_devices', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_current_user', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_currently_playing', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_playback_state', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_playlist', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_queue', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_recently_played', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.get_saved_tracks', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  { slug: 'spotify.search', origin: 'https://open.spotify.com', handlerFile: 'spotify.js' },
  // twitch x14 -- Web GraphQL page-bearer reads.
  { slug: 'twitch.get_channel_emotes', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_current_user', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_game', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_game_clips', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_stream', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_streams_by_game', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_top_games', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_top_streams', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_user_clips', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_user_profile', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_user_videos', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.get_video', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.search_categories', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  { slug: 'twitch.search_channels', origin: 'https://www.twitch.tv', handlerFile: 'twitch.js' },
  // spotify x10 -- playback mutations stay guarded fail-closed until live body UAT.
  { slug: 'spotify.add_to_queue', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.pause_playback', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.seek_to_position', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.set_repeat_mode', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.set_volume', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.skip_to_next', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.skip_to_previous', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.start_playback', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.toggle_shuffle', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  { slug: 'spotify.transfer_playback', origin: 'https://open.spotify.com', handlerFile: 'spotify.js', expectWrite: true },
  // steam x9 -- first-party Store GET/page-state reads.
  { slug: 'steam.search_store', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_app_details', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_app_reviews', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_app_user_details', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_current_user', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_featured', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_featured_categories', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_popular_tags', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.get_user_data', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  // steam x6 -- POST/session-bound rows remain inert until live request-shape proof.
  { slug: 'steam.add_to_wishlist', origin: 'https://store.steampowered.com', handlerFile: 'steam.js', expectWrite: true },
  { slug: 'steam.follow_app', origin: 'https://store.steampowered.com', handlerFile: 'steam.js', expectWrite: true },
  { slug: 'steam.generate_discovery_queue', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.ignore_app', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
  { slug: 'steam.remove_from_wishlist', origin: 'https://store.steampowered.com', handlerFile: 'steam.js', expectWrite: true },
  { slug: 'steam.unignore_app', origin: 'https://store.steampowered.com', handlerFile: 'steam.js' },
];

// The descriptor whose backing:'dom' T3 resolution proves the BEFORE leg, and
// whose flip to T1a proves the AFTER leg. notion.search is chosen because its
// handler (notion.js) already exists pre-Wave-1 in shape (the slug is added in
// 40-04), but the BEFORE/AFTER mechanism is generic -- it seeds the real
// descriptor JSON and toggles only whether the handler is required.
const BEFORE_AFTER_SLUG = 'notion.search';
const BEFORE_AFTER_ORIGIN = 'https://app.notion.com';
const BEFORE_AFTER_HANDLER = 'notion.js';

const NEGATIVE_SLUG = 'gitlab.list_projectz';   // a deliberate typo -- must NOT upgrade
const NEGATIVE_ORIGIN = 'https://gitlab.com';

function descriptorPath(slug) {
  // opentabs__<app>__<op>.json from the dot-form slug <app>.<op>.
  var dot = slug.indexOf('.');
  if (dot === -1) { return null; }
  var app = slug.slice(0, dot);
  var op = slug.slice(dot + 1);
  return path.join(DESCRIPTORS_DIR, 'opentabs__' + app + '__' + op + '.json');
}

function readDescriptor(slug) {
  var p = descriptorPath(slug);
  if (!p || !fs.existsSync(p)) { return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

// Fresh-require the catalog so its REGISTRY starts EMPTY, then optionally require
// the named handler(s) so they self-register into THAT fresh catalog. Returns the
// catalog module exports. Clearing the require cache for BOTH the catalog and every
// handler is what makes the BEFORE leg (handler absent) and the AFTER leg (handler
// present) independent -- a handler self-registers at require time against whatever
// global.FsbCapabilityCatalog is current, so the catalog must be (re)required FIRST.
function freshCatalog(handlerFiles) {
  delete require.cache[require.resolve(CATALOG_PATH)];
  // Drop any cached handler modules so they re-run their self-registration against
  // the fresh catalog global below.
  for (var i = 0; i < PORTED.length; i++) {
    var hp = path.join(HANDLERS_DIR, PORTED[i].handlerFile);
    if (fs.existsSync(hp)) {
      try { delete require.cache[require.resolve(hp)]; } catch (e) { /* not cached */ }
    }
  }
  var Catalog = require(CATALOG_PATH);   // sets global.FsbCapabilityCatalog
  var list = handlerFiles || [];
  for (var j = 0; j < list.length; j++) {
    var p = path.join(HANDLERS_DIR, list[j]);
    if (fs.existsSync(p)) { require(p); }   // self-registers into the fresh catalog
  }
  return Catalog;
}

(function run() {
  console.log('--- DEPTH-01 dom->T1a upgrade-assertion harness (Phase 40) ---');

  // Make sure no stale FsbRecipeIndex from an earlier section leaks into the main
  // 10-slug pass (the registry-first T1a path does NOT need the index, but a stale
  // index must not change behavior).
  delete global.FsbRecipeIndex;

  // Require every handler that exists so all available slugs self-register. The
  // catalog is required first (sets the global), then each handler. Also run
  // seedHeadHandlers() to exercise BOTH the self-register and the manifest path.
  var handlerFiles = [];
  var seen = {};
  for (var i = 0; i < PORTED.length; i++) {
    if (!seen[PORTED[i].handlerFile]) { seen[PORTED[i].handlerFile] = true; handlerFiles.push(PORTED[i].handlerFile); }
  }
  var Catalog = freshCatalog(handlerFiles);
  check(typeof Catalog.resolve === 'function', 'capability-catalog exports resolve');
  if (typeof Catalog.seedHeadHandlers === 'function') {
    Catalog.seedHeadHandlers();   // re-assert from the manifest (defense in depth)
  }

  // ===== Every ported slug must resolve T1a, byte-exact, with a handle =============
  PORTED.forEach(function (row) {
    var handlerExists = fs.existsSync(path.join(HANDLERS_DIR, row.handlerFile));
    var res = Catalog.resolve(row.slug, row.origin);

    if (!handlerExists) {
      // Wave-0: the gitlab handler is not written yet -> a single deterministic
      // FAIL (the correct RED). 40-02 makes this PASS.
      check(false, 'UPGRADE ' + row.slug + ' -> T1a (handler ' + row.handlerFile +
        ' not present yet -- expected Wave-0 RED, GREEN after its plan lands)');
      return;
    }

    check(res && res.tier === 'T1a',
      'UPGRADE ' + row.slug + ' resolves tier T1a on ' + row.origin +
      ' (was backing:dom -> T3); got ' + (res ? res.tier : 'null'));
    check(res && res.descriptor && res.descriptor.slug === row.slug,
      'UPGRADE ' + row.slug + ' carries a BYTE-EXACT descriptor.slug (the correctness keystone)');
    check(res && res.handler && typeof res.handler.handle === 'function',
      'UPGRADE ' + row.slug + ' exposes a handler with an async handle');
    check(res && res.origin === row.origin,
      'UPGRADE ' + row.slug + ' resolves the first-party origin ' + row.origin + ' (Wall 2)');

    // Phase 41: the WRITE-like rows must upgrade dom->T1a AND carry a mutating class.
    // descriptor.sideEffectClass distinguishes mutating heads from read heads (both
    // upgrade dom->T1a; only write/destructive rows are mutation-gated by consent).
    if (row.expectWrite) {
      var mutatingClass = res && res.descriptor && res.descriptor.sideEffectClass;
      check(mutatingClass === 'write' || mutatingClass === 'destructive',
        'UPGRADE ' + row.slug + ' carries descriptor.sideEffectClass write/destructive (the guarded-write class); got ' +
        (res && res.descriptor ? res.descriptor.sideEffectClass : 'null'));
    }
  });

  // ===== NEGATIVE CONTROL: a wrong slug is a dead duplicate, NOT an upgrade ========
  // A typo'd slug must NOT resolve T1a. With no FsbRecipeIndex seeded it resolves
  // null (genuinely unknown); even with the index it would be at most T3 -- never
  // T1a. The keystone: only a BYTE-EXACT slug upgrades.
  var neg = Catalog.resolve(NEGATIVE_SLUG, NEGATIVE_ORIGIN);
  check(!neg || neg.tier !== 'T1a',
    'NEGATIVE CONTROL ' + NEGATIVE_SLUG + ' does NOT resolve T1a (a mis-registered slug is a dead duplicate, never an upgrade); got ' +
    (neg ? neg.tier : 'null'));

  // ===== BEFORE/AFTER: the upgrade itself, demonstrated end-to-end =================
  var desc = readDescriptor(BEFORE_AFTER_SLUG);
  check(!!desc && desc.slug === BEFORE_AFTER_SLUG && desc.backing === 'dom',
    'BEFORE/AFTER fixture: the real opentabs descriptor for ' + BEFORE_AFTER_SLUG +
    ' exists and is backing:dom');

  if (desc) {
    // ---- BEFORE: seed the descriptor in FsbRecipeIndex, handler NOT required ----
    // resolve() finds no REGISTRY entry -> the CGEN-03 descriptor-only fallback
    // returns T3 (backing:'dom'). This is the breadth state the depth phase upgrades.
    global.FsbRecipeIndex = { recipes: [], descriptors: [desc] };
    var beforeCatalog = freshCatalog([]);   // no handler required -> REGISTRY empty for this slug
    var before = beforeCatalog.resolve(BEFORE_AFTER_SLUG, BEFORE_AFTER_ORIGIN);
    check(before && before.tier === 'T3',
      'BEFORE ' + BEFORE_AFTER_SLUG + ' (handler absent, descriptor seeded) resolves T3 -- the breadth dom fallback; got ' +
      (before ? before.tier : 'null'));
    check(before && before.descriptor && before.descriptor.slug === BEFORE_AFTER_SLUG,
      'BEFORE ' + BEFORE_AFTER_SLUG + ' carries the breadth descriptor (slug byte-exact)');

    // ---- AFTER: require the handler -> it self-registers -> resolve() flips T1a ----
    var afterCatalog = freshCatalog([BEFORE_AFTER_HANDLER]);
    var after = afterCatalog.resolve(BEFORE_AFTER_SLUG, BEFORE_AFTER_ORIGIN);
    check(after && after.tier === 'T1a',
      'AFTER ' + BEFORE_AFTER_SLUG + ' (handler required) resolves T1a -- the dom->T1a UPGRADE, proven; got ' +
      (after ? after.tier : 'null'));
    check(after && after.descriptor && after.descriptor.slug === BEFORE_AFTER_SLUG,
      'AFTER ' + BEFORE_AFTER_SLUG + ' preserves the BYTE-EXACT slug across the upgrade');
    check(after && after.handler && typeof after.handler.handle === 'function',
      'AFTER ' + BEFORE_AFTER_SLUG + ' exposes the registered handler');

    delete global.FsbRecipeIndex;
  }

  // ---- Exit convention --------------------------------------------------------
  console.log('\nhead-handler-upgrade: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();

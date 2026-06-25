// Vendored metadata slice of the OpenTabs clickup plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// ClickUp is a REST app (host app.clickup.com -> derived stem 'clickup', NOT in
// STEM_OVERRIDES). Its ops POST/PUT/GET against the ClickUp REST API v2, so the
// side-effect class derives from the named-verb helper + {method:'...'} literal +
// the op-name verb (api GET=read, api {method:'POST'/'PUT'}=write). This is part of
// the Phase-37 dev/productivity batch-A sub-batch 2 (clickup/jira/confluence/airtable).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createTask } from './tools/create-task.js';
import { listTasks } from './tools/list-tasks.js';
import { getTask } from './tools/get-task.js';
import { updateTask } from './tools/update-task.js';

class ClickUpPlugin extends OpenTabsPlugin {
  readonly name = 'clickup';
  readonly description =
    'OpenTabs plugin for ClickUp — manage tasks, lists, and spaces via the ClickUp REST API';
  override readonly displayName = 'ClickUp';
  readonly urlPatterns = ['*://app.clickup.com/*'];
  override readonly homepage = 'https://app.clickup.com';
  readonly tools: ToolDefinition[] = [
    // Tasks (the vendored dev/productivity batch-A sub-batch-2 slice)
    listTasks,
    getTask,
    createTask,
    updateTask,
  ];
}

const plugin = new ClickUpPlugin();
export default plugin;
export { plugin };

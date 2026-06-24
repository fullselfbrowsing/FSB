// Vendored metadata slice of the OpenTabs asana plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Asana is a REST transport app (`api` GET/POST/PUT, `apiVoid` POST/DELETE). Its
// create_task is the cross-app `create_*` collision near-neighbor (vs
// linear.create_issue / todoist.create_task) the Phase-37 MED-03 fix proves
// wrong-invoke=0 against.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createTask } from './tools/create-task.js';
import { listTasks } from './tools/list-tasks.js';
import { getTask } from './tools/get-task.js';
import { updateTask } from './tools/update-task.js';

class AsanaPlugin extends OpenTabsPlugin {
  readonly name = 'asana';
  readonly description =
    'OpenTabs plugin for Asana — manage tasks and projects via the Asana REST API';
  override readonly displayName = 'Asana';
  readonly urlPatterns = ['*://app.asana.com/*'];
  override readonly homepage = 'https://app.asana.com';
  readonly tools: ToolDefinition[] = [
    // Tasks (the vendored dev/productivity batch-A slice)
    listTasks,
    getTask,
    createTask,
    updateTask,
  ];
}

const plugin = new AsanaPlugin();
export default plugin;
export { plugin };

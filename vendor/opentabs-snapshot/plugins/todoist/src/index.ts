// Vendored metadata slice of the OpenTabs todoist plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// This is a representative 7-op Tasks slice (read + write + destructive across both
// transport helpers: `api` GET/POST and `apiVoid` POST/DELETE) -- enough to prove
// the import machinery (CGEN-01). The full app surface lands in Phases 37-39.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createTask } from './tools/create-task.js';
import { listTasks } from './tools/list-tasks.js';
import { getTask } from './tools/get-task.js';
import { updateTask } from './tools/update-task.js';
import { deleteTask } from './tools/delete-task.js';
import { closeTask } from './tools/close-task.js';
import { reopenTask } from './tools/reopen-task.js';

class TodoistPlugin extends OpenTabsPlugin {
  readonly name = 'todoist';
  readonly description =
    'OpenTabs plugin for Todoist — manage tasks, projects, sections, labels, and comments';
  override readonly displayName = 'Todoist';
  readonly urlPatterns = ['*://app.todoist.com/*'];
  override readonly homepage = 'https://app.todoist.com';
  readonly tools: ToolDefinition[] = [
    // Tasks (the vendored smoke slice)
    listTasks,
    getTask,
    createTask,
    updateTask,
    closeTask,
    reopenTask,
    deleteTask,
  ];
}

const plugin = new TodoistPlugin();
export default plugin;
export { plugin };

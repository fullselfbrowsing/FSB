import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './todoist-api.js';
import { archiveProject } from './tools/archive-project.js';
import { closeTask } from './tools/close-task.js';
import { createComment } from './tools/create-comment.js';
import { createLabel } from './tools/create-label.js';
import { createProject } from './tools/create-project.js';
import { createSection } from './tools/create-section.js';
import { createTask } from './tools/create-task.js';
import { deleteComment } from './tools/delete-comment.js';
import { deleteLabel } from './tools/delete-label.js';
import { deleteProject } from './tools/delete-project.js';
import { deleteSection } from './tools/delete-section.js';
import { deleteTask } from './tools/delete-task.js';
import { getComment } from './tools/get-comment.js';
import { getLabel } from './tools/get-label.js';
import { getProject } from './tools/get-project.js';
import { getSection } from './tools/get-section.js';
import { getTask } from './tools/get-task.js';
import { listCollaborators } from './tools/list-collaborators.js';
import { listComments } from './tools/list-comments.js';
import { listLabels } from './tools/list-labels.js';
import { listProjects } from './tools/list-projects.js';
import { listSections } from './tools/list-sections.js';
import { listSharedLabels } from './tools/list-shared-labels.js';
import { listTasks } from './tools/list-tasks.js';
import { removeSharedLabel } from './tools/remove-shared-label.js';
import { renameSharedLabel } from './tools/rename-shared-label.js';
import { reopenTask } from './tools/reopen-task.js';
import { unarchiveProject } from './tools/unarchive-project.js';
import { updateComment } from './tools/update-comment.js';
import { updateLabel } from './tools/update-label.js';
import { updateProject } from './tools/update-project.js';
import { updateSection } from './tools/update-section.js';
import { updateTask } from './tools/update-task.js';

class TodoistPlugin extends OpenTabsPlugin {
  readonly name = 'todoist';
  readonly description = 'OpenTabs plugin for Todoist — manage tasks, projects, sections, labels, and comments';
  override readonly displayName = 'Todoist';
  readonly urlPatterns = ['*://app.todoist.com/*'];
  override readonly homepage = 'https://app.todoist.com';
  readonly tools: ToolDefinition[] = [
    // Projects
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    archiveProject,
    unarchiveProject,
    listCollaborators,
    // Tasks
    listTasks,
    getTask,
    createTask,
    updateTask,
    closeTask,
    reopenTask,
    deleteTask,
    // Sections
    listSections,
    getSection,
    createSection,
    updateSection,
    deleteSection,
    // Comments
    listComments,
    getComment,
    createComment,
    updateComment,
    deleteComment,
    // Labels
    listLabels,
    getLabel,
    createLabel,
    updateLabel,
    deleteLabel,
    listSharedLabels,
    renameSharedLabel,
    removeSharedLabel,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TodoistPlugin();

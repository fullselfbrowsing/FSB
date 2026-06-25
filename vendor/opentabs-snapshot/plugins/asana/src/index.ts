import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './asana-api.js';

// Tasks
import { getTask } from './tools/get-task.js';
import { createTask } from './tools/create-task.js';
import { updateTask } from './tools/update-task.js';
import { deleteTask } from './tools/delete-task.js';
import { searchTasks } from './tools/search-tasks.js';
import { getTasksForProject } from './tools/get-tasks-for-project.js';
import { getTasksForSection } from './tools/get-tasks-for-section.js';
import { getSubtasks } from './tools/get-subtasks.js';
import { addFollowers } from './tools/add-followers.js';

// Projects
import { listProjects } from './tools/list-projects.js';
import { getProject } from './tools/get-project.js';
import { createProject } from './tools/create-project.js';
import { updateProject } from './tools/update-project.js';

// Sections
import { listSections } from './tools/list-sections.js';
import { createSection } from './tools/create-section.js';
import { addTaskToSection } from './tools/add-task-to-section.js';

// Stories (comments)
import { getStoriesForTask } from './tools/get-stories-for-task.js';
import { createStory } from './tools/create-story.js';

// Users
import { getCurrentUser } from './tools/get-current-user.js';
import { getUser } from './tools/get-user.js';
import { listUsersForWorkspace } from './tools/list-users-for-workspace.js';

// Workspaces, Tags, Teams
import { listWorkspaces } from './tools/list-workspaces.js';
import { listTags } from './tools/list-tags.js';
import { listTeams } from './tools/list-teams.js';

class AsanaPlugin extends OpenTabsPlugin {
  readonly name = 'asana';
  readonly description = 'OpenTabs plugin for Asana';
  override readonly displayName = 'Asana';
  readonly urlPatterns = ['*://app.asana.com/*'];
  override readonly homepage = 'https://asana.com';
  readonly tools: ToolDefinition[] = [
    // Tasks
    getTask,
    createTask,
    updateTask,
    deleteTask,
    searchTasks,
    getTasksForProject,
    getTasksForSection,
    getSubtasks,
    addFollowers,

    // Projects
    listProjects,
    getProject,
    createProject,
    updateProject,

    // Sections
    listSections,
    createSection,
    addTaskToSection,

    // Stories (comments)
    getStoriesForTask,
    createStory,

    // Users
    getCurrentUser,
    getUser,
    listUsersForWorkspace,

    // Workspaces, Tags, Teams
    listWorkspaces,
    listTags,
    listTeams,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new AsanaPlugin();

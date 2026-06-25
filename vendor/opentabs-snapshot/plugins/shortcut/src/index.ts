import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isShortcutAuthenticated, waitForShortcutAuth } from './shortcut-api.js';
import { createEpic } from './tools/create-epic.js';
import { createIteration } from './tools/create-iteration.js';
import { createLabel } from './tools/create-label.js';
import { createStoryComment } from './tools/create-story-comment.js';
import { createStoryLink } from './tools/create-story-link.js';
import { createStory } from './tools/create-story.js';
import { deleteEpic } from './tools/delete-epic.js';
import { deleteStory } from './tools/delete-story.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getEpic } from './tools/get-epic.js';
import { getIteration } from './tools/get-iteration.js';
import { getStory } from './tools/get-story.js';
import { listEpicStories } from './tools/list-epic-stories.js';
import { listEpics } from './tools/list-epics.js';
import { listIterationStories } from './tools/list-iteration-stories.js';
import { listIterations } from './tools/list-iterations.js';
import { listLabels } from './tools/list-labels.js';
import { listMembers } from './tools/list-members.js';
import { listObjectives } from './tools/list-objectives.js';
import { listStoryComments } from './tools/list-story-comments.js';
import { listTeams } from './tools/list-teams.js';
import { listWorkflows } from './tools/list-workflows.js';
import { searchEpics } from './tools/search-epics.js';
import { searchStories } from './tools/search-stories.js';
import { updateEpic } from './tools/update-epic.js';
import { updateIteration } from './tools/update-iteration.js';
import { updateStory } from './tools/update-story.js';

class ShortcutPlugin extends OpenTabsPlugin {
  readonly name = 'shortcut';
  readonly description =
    'Search, create, and manage stories, epics, iterations, labels, and teams in Shortcut (formerly Clubhouse).';
  override readonly displayName = 'Shortcut';
  readonly urlPatterns = ['*://app.shortcut.com/*'];
  override readonly homepage = 'https://app.shortcut.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    searchStories,
    getStory,
    createStory,
    updateStory,
    deleteStory,
    listStoryComments,
    createStoryComment,
    createStoryLink,
    listEpics,
    getEpic,
    createEpic,
    updateEpic,
    deleteEpic,
    listEpicStories,
    searchEpics,
    listLabels,
    createLabel,
    listWorkflows,
    listMembers,
    listTeams,
    listIterations,
    getIteration,
    createIteration,
    updateIteration,
    listIterationStories,
    listObjectives,
  ];

  async isReady(): Promise<boolean> {
    if (isShortcutAuthenticated()) return true;
    return waitForShortcutAuth();
  }
}

export default new ShortcutPlugin();

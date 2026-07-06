import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getProjectContext } from '../gcloud-api.js';

export const getCurrentProject = defineTool({
  name: 'get_current_project',
  displayName: 'Get Current Project',
  description:
    'Get the currently active GCP project from the console URL. Returns the project ID the user is currently viewing.',
  summary: 'Get the active project from the console URL',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({}),
  output: z.object({
    project_id: z.string().describe('Currently active project ID'),
  }),
  handle: async () => {
    const ctx = getProjectContext();
    if (!ctx?.projectId) {
      throw ToolError.validation('No project selected — navigate to a project in the Google Cloud Console.');
    }
    return { project_id: ctx.projectId };
  },
});

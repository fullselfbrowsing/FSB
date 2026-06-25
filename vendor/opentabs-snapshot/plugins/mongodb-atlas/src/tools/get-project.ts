import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description:
    'Get detailed information about the current MongoDB Atlas project (group) from the URL context, including state, cluster count, and data size.',
  summary: 'Get current project details',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({}),
  output: z.object({ project: projectSchema.describe('The project') }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawProject>(`/nds/${groupId}`);
    return { project: mapProject(raw) };
  },
});

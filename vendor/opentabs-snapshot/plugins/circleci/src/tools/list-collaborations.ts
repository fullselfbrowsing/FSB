import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawCollaboration, collaborationSchema, mapCollaboration } from './schemas.js';

export const listCollaborations = defineTool({
  name: 'list_collaborations',
  displayName: 'List Collaborations',
  description:
    'List all organizations and collaborations the current user belongs to. Returns org IDs, names, slugs, and VCS types.',
  summary: 'List your organizations',
  icon: 'building-2',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    collaborations: z.array(collaborationSchema).describe('List of organizations'),
  }),
  handle: async () => {
    const data = await api<RawCollaboration[]>('/me/collaborations');
    return { collaborations: (data ?? []).map(mapCollaboration) };
  },
});

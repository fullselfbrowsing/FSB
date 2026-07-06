import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawContext, contextSchema, mapContext } from './schemas.js';

export const createContext = defineTool({
  name: 'create_context',
  displayName: 'Create Context',
  description: 'Create a new context in an organization.',
  summary: 'Create a context',
  icon: 'plus',
  group: 'Contexts',
  input: z.object({
    name: z.string().describe('Context name'),
    owner_id: z.string().describe('Organization UUID'),
    owner_type: z.enum(['account', 'organization']).optional().describe('Owner type (default "organization")'),
  }),
  output: z.object({ context: contextSchema }),
  handle: async ({ name, owner_id, owner_type }) => {
    const data = await api<RawContext>('/context', {
      method: 'POST',
      body: {
        name,
        owner: { id: owner_id, type: owner_type ?? 'organization' },
      },
    });
    return { context: mapContext(data) };
  },
});

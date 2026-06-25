import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawContext, contextSchema, mapContext } from './schemas.js';

export const getContext = defineTool({
  name: 'get_context',
  displayName: 'Get Context',
  description: 'Get a context by its UUID.',
  summary: 'Get context details',
  icon: 'lock',
  group: 'Contexts',
  input: z.object({
    context_id: z.string().describe('Context UUID'),
  }),
  output: z.object({ context: contextSchema }),
  handle: async ({ context_id }) => {
    const data = await api<RawContext>(`/context/${context_id}`);
    return { context: mapContext(data) };
  },
});

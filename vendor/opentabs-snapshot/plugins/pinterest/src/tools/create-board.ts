import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { boardSchema, mapBoard } from './schemas.js';
import type { RawBoard } from './schemas.js';

export const createBoard = defineTool({
  name: 'create_board',
  displayName: 'Create Board',
  description: 'Create a new Pinterest board. Specify a name, optional description, and privacy setting.',
  summary: 'Create a new board',
  icon: 'folder-plus',
  group: 'Boards',
  input: z.object({
    name: z.string().describe('Board name'),
    description: z.string().optional().describe('Board description'),
    privacy: z.enum(['public', 'secret']).optional().describe('Privacy setting (default "public")'),
  }),
  output: z.object({
    board: boardSchema.describe('The newly created board'),
  }),
  handle: async params => {
    const resp = await resourcePost<RawBoard>('BoardResource', 'create', {
      name: params.name,
      description: params.description ?? '',
      privacy: params.privacy ?? 'public',
    });

    return { board: mapBoard(resp.resource_response.data) };
  },
});

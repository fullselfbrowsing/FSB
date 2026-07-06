import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { boardSchema, mapBoard } from './schemas.js';
import type { RawBoard } from './schemas.js';

export const updateBoard = defineTool({
  name: 'update_board',
  displayName: 'Update Board',
  description: 'Update a board name, description, or privacy setting. Only specified fields are changed.',
  summary: 'Update a board',
  icon: 'folder-pen',
  group: 'Boards',
  input: z.object({
    board_id: z.string().describe('Board ID to update'),
    name: z.string().optional().describe('New board name'),
    description: z.string().optional().describe('New board description'),
    privacy: z.enum(['public', 'secret']).optional().describe('New privacy setting'),
  }),
  output: z.object({
    board: boardSchema.describe('The updated board'),
  }),
  handle: async params => {
    const options: Record<string, unknown> = { board_id: params.board_id };
    if (params.name !== undefined) options.name = params.name;
    if (params.description !== undefined) options.description = params.description;
    if (params.privacy !== undefined) options.privacy = params.privacy;

    const resp = await resourcePost<RawBoard>('BoardResource', 'update', options);

    return { board: mapBoard(resp.resource_response.data) };
  },
});

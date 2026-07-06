import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { boardSectionSchema, mapBoardSection } from './schemas.js';
import type { RawBoardSection } from './schemas.js';

export const createBoardSection = defineTool({
  name: 'create_board_section',
  displayName: 'Create Board Section',
  description: 'Create a new section within a board to organize pins into groups.',
  summary: 'Create a section in a board',
  icon: 'layers',
  group: 'Boards',
  input: z.object({
    board_id: z.string().describe('Board ID to create the section in'),
    name: z.string().describe('Section name'),
  }),
  output: z.object({
    section: boardSectionSchema.describe('The newly created section'),
  }),
  handle: async params => {
    const resp = await resourcePost<RawBoardSection>('BoardSectionResource', 'create', {
      board_id: params.board_id,
      name: params.name,
    });

    return { section: mapBoardSection(resp.resource_response.data) };
  },
});

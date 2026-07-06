import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet } from '../pinterest-api.js';
import { boardSectionSchema, mapBoardSection } from './schemas.js';
import type { RawBoardSection } from './schemas.js';

export const getBoardSections = defineTool({
  name: 'get_board_sections',
  displayName: 'Get Board Sections',
  description: 'Get all sections (subsections) of a board. Sections are used to organize pins within a board.',
  summary: 'Get sections for a board',
  icon: 'layers',
  group: 'Boards',
  input: z.object({
    board_id: z.string().describe('Board ID to get sections for'),
    board_url: z.string().optional().describe('Board URL path (e.g., "/username/board-name/")'),
  }),
  output: z.object({
    sections: z.array(boardSectionSchema).describe('Board sections'),
  }),
  handle: async params => {
    const sourceUrl = params.board_url ?? '/';
    const resp = await resourceGet<RawBoardSection[]>(
      'BoardSectionsResource',
      { board_id: params.board_id },
      sourceUrl,
    );

    const sections = resp.resource_response.data ?? [];
    return { sections: sections.map(mapBoardSection) };
  },
});

import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { listEntities } from '../snowflake-api.js';
import { mapWorksheet, worksheetSchema } from './schemas.js';

export const listWorksheets = defineTool({
  name: 'list_worksheets',
  displayName: 'List Worksheets',
  description:
    'List saved Snowflake worksheets, sorted by most recently modified. Supports pagination via cursor. Worksheets are the SQL editor tabs in the Snowflake web UI.',
  summary: 'List saved worksheets',
  icon: 'file-code',
  group: 'Worksheets',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum worksheets to return (default 50)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    worksheets: z.array(worksheetSchema).describe('List of worksheets'),
    cursor: z.string().describe('Cursor for the next page, empty if no more results'),
  }),
  handle: async params => {
    const result = await listEntities({
      location: 'worksheets',
      types: ['query'],
      limit: params.limit ?? 50,
      cursor: params.cursor,
    });

    const worksheets = result.entities
      .filter(e => e.entityType === 'query' && e.info)
      .map(e => mapWorksheet(e.entityId ?? '', e.info ?? {}));

    return {
      worksheets,
      cursor: result.next,
    };
  },
});

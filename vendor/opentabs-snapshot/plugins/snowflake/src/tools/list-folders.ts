import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { listEntities } from '../snowflake-api.js';
import { folderSchema, mapFolder } from './schemas.js';

export const listFolders = defineTool({
  name: 'list_folders',
  displayName: 'List Folders',
  description: 'List worksheet folders in the Snowflake workspace. Folders organize worksheets into groups.',
  summary: 'List worksheet folders',
  icon: 'folder',
  group: 'Worksheets',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum folders to return (default 50)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    folders: z.array(folderSchema).describe('List of folders'),
    cursor: z.string().describe('Cursor for the next page, empty if no more results'),
  }),
  handle: async params => {
    const result = await listEntities({
      location: 'worksheets',
      types: ['folder'],
      limit: params.limit ?? 50,
      cursor: params.cursor,
    });

    const folders = result.entities
      .filter(e => e.entityType === 'folder' && e.info)
      .map(e => mapFolder(e.entityId ?? '', e.info ?? {}));

    return {
      folders,
      cursor: result.next,
    };
  },
});

import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';
import { databaseSchema, mapDatabase } from './schemas.js';

export const browseData = defineTool({
  name: 'browse_data',
  displayName: 'Browse Databases',
  description:
    'List all databases accessible to the current Snowflake user and role. Returns database names, owners, kinds (STANDARD or APPLICATION), and creation timestamps.',
  summary: 'List accessible databases',
  icon: 'database',
  group: 'Schema',
  input: z.object({}),
  output: z.object({
    databases: z.array(databaseSchema).describe('List of accessible databases'),
  }),
  handle: async () => {
    const result = await runQuery('SHOW DATABASES');
    const databases = result.rows.map(mapDatabase);
    return { databases };
  },
});

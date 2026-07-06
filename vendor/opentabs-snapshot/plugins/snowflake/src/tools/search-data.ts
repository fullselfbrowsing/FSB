import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';
import { databaseSchema, mapDatabase } from './schemas.js';

export const searchData = defineTool({
  name: 'search_data',
  displayName: 'Search Databases',
  description:
    "Search for Snowflake databases by name pattern (case-insensitive LIKE match). Use '%' as wildcard. For example, 'billing' matches databases containing 'billing' in their name.",
  summary: 'Search databases by name pattern',
  icon: 'search',
  group: 'Schema',
  input: z.object({
    query: z.string().describe("Database name pattern to search (case-insensitive, e.g., 'billing' or '%prod%')"),
  }),
  output: z.object({
    databases: z.array(databaseSchema).describe('Matching databases'),
  }),
  handle: async params => {
    const pattern = params.query.includes('%') ? params.query : `%${params.query}%`;
    const result = await runQuery(`SHOW DATABASES LIKE '${pattern.replace(/'/g, "''")}'`);
    const databases = result.rows.map(mapDatabase);
    return { databases };
  },
});

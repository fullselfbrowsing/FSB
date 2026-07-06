import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';
import { mapSchemaInfo, schemaInfoSchema } from './schemas.js';

export const listSchemas = defineTool({
  name: 'list_schemas',
  displayName: 'List Schemas',
  description:
    'List schemas in a Snowflake database. Returns schema names, owners, and creation timestamps. Use browse_data to find available database names first.',
  summary: 'List schemas in a database',
  icon: 'folder-tree',
  group: 'Schema',
  input: z.object({
    database: z.string().describe('Database name to list schemas for'),
  }),
  output: z.object({
    schemas: z.array(schemaInfoSchema).describe('List of schemas in the database'),
  }),
  handle: async params => {
    const result = await runQuery(`SHOW SCHEMAS IN DATABASE ${params.database}`);
    const schemas = result.rows.map(mapSchemaInfo);
    return { schemas };
  },
});

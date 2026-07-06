import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';
import { mapTableColumn, tableColumnSchema } from './schemas.js';

export const getObjectDetails = defineTool({
  name: 'get_object_details',
  displayName: 'Describe Table',
  description:
    'Get column-level schema details for a Snowflake table or view using DESCRIBE TABLE. Returns column names, data types, nullability, defaults, and key constraints. The objectName must be fully qualified: DATABASE.SCHEMA.TABLE (e.g., "MY_DB.PUBLIC.MY_TABLE").',
  summary: 'Get column details for a table or view',
  icon: 'table',
  group: 'Schema',
  input: z.object({
    objectName: z
      .string()
      .describe('Fully qualified object name: DATABASE.SCHEMA.TABLE (e.g., "MY_DB.PUBLIC.MY_TABLE")'),
  }),
  output: z.object({
    columns: z.array(tableColumnSchema).describe('Column definitions'),
  }),
  handle: async params => {
    const result = await runQuery(`DESCRIBE TABLE ${params.objectName}`);
    const columns = result.rows.map(mapTableColumn);
    return { columns };
  },
});

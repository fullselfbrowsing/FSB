import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';

const tableInfoSchema = z.object({
  name: z.string().describe('Table name'),
  database_name: z.string().describe('Parent database name'),
  schema_name: z.string().describe('Parent schema name'),
  kind: z.string().describe('Table kind (TABLE, VIEW, EXTERNAL TABLE, etc.)'),
  owner: z.string().describe('Table owner role'),
  rows: z.string().describe('Approximate row count'),
  created_on: z.string().describe('Creation timestamp'),
  comment: z.string().describe('Table comment'),
});

export const listTables = defineTool({
  name: 'list_tables',
  displayName: 'List Tables',
  description:
    'List tables in a Snowflake schema. Returns table names, row counts, owners, and types. Requires both database and schema names. Use list_schemas to find available schemas.',
  summary: 'List tables in a schema',
  icon: 'table-2',
  group: 'Schema',
  input: z.object({
    database: z.string().describe('Database name'),
    schema: z.string().describe('Schema name'),
    pattern: z.string().optional().describe("Optional LIKE pattern to filter table names (e.g., 'user%')"),
  }),
  output: z.object({
    tables: z.array(tableInfoSchema).describe('List of tables in the schema'),
  }),
  handle: async params => {
    const likeClause = params.pattern ? ` LIKE '${params.pattern.replace(/'/g, "''")}'` : '';
    const result = await runQuery(`SHOW TABLES${likeClause} IN SCHEMA ${params.database}.${params.schema}`);

    const tables = result.rows.map(row => ({
      name: row[1] ?? '',
      database_name: row[2] ?? '',
      schema_name: row[3] ?? '',
      kind: row[4] ?? 'TABLE',
      owner: row[9] ?? '',
      rows: row[7] ?? '0',
      created_on: row[0] ?? '',
      comment: row[5] ?? '',
    }));

    return { tables };
  },
});

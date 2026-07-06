import { defineTool } from '@opentabs-dev/plugin-sdk';
import type { ToolHandlerContext } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchChunk, runQuery as executeQuery } from '../snowflake-api.js';
import { columnSchema, executionSchema, mapColumn, rowSchema } from './schemas.js';

const rawRowsToObjects = (rawRows: string[][], columns: Array<{ name: string }>): Record<string, string | null>[] =>
  rawRows.map(row => {
    const obj: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (col) {
        obj[col.name] = row[i] ?? null;
      }
    }
    return obj;
  });

export const runQueryTool = defineTool({
  name: 'run_query',
  displayName: 'Run Query',
  description:
    'Execute a SQL query in Snowflake via the web application session. Returns parsed results with columns and rows as named objects. For large results (multiple chunks), all chunks are automatically fetched and combined — no need to call get_query separately. Results are capped at maxRows (default 100). All row values are strings (including numbers and timestamps) per Snowflake JSON format.',
  summary: 'Execute a SQL query and return results',
  icon: 'play',
  group: 'Queries',
  input: z.object({
    query: z.string().describe('SQL query to execute'),
    database: z.string().optional().describe('Database context for the query'),
    schema: z.string().optional().describe('Schema context for the query'),
    warehouse: z.string().optional().describe('Warehouse to use for execution'),
    role: z.string().optional().describe('Role to use (defaults to current session role)'),
    maxRows: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Maximum rows to return (default 100). All chunks are auto-fetched up to this limit.'),
  }),
  output: z.object({
    columns: z.array(columnSchema).describe('Column metadata'),
    rows: z.array(rowSchema).describe('Result rows as named objects'),
    execution: executionSchema.describe('Query execution metadata'),
    rowCount: z.number().describe('Number of rows returned in this response'),
    totalRows: z.number().describe('Total rows in the full result set (may exceed rowCount if capped by maxRows)'),
    truncated: z.boolean().describe('Whether results were truncated by maxRows'),
  }),
  handle: async (params, context?: ToolHandlerContext) => {
    const maxRows = params.maxRows ?? 100;

    const result = await executeQuery(params.query, {
      database: params.database,
      schema: params.schema,
      warehouse: params.warehouse,
      role: params.role,
    });

    const columns = result.columns.map(mapColumn);
    const allRawRows: string[][] = [...result.rows];

    // Auto-fetch chunks when the result spans multiple chunks.
    // For large results, firstChunkData may be empty — chunk 0 data must
    // also be fetched via the chunk endpoint in that case.
    if (result.chunkFileCount > 1 && allRawRows.length < maxRows) {
      const startChunk = allRawRows.length === 0 ? 0 : 1;
      for (let i = startChunk; i < result.chunkFileCount; i++) {
        context?.reportProgress({
          progress: i - startChunk + 1,
          total: result.chunkFileCount - startChunk,
          message: `Fetching chunk ${i + 1} of ${result.chunkFileCount}...`,
        });

        const chunkRows = await fetchChunk(result.queryId, i);
        allRawRows.push(...chunkRows);

        if (allRawRows.length >= maxRows) break;
      }
    }

    const limitedRows = allRawRows.slice(0, maxRows);
    const rows = rawRowsToObjects(limitedRows, columns);

    return {
      columns,
      rows,
      execution: {
        queryId: result.queryId,
        status: 'SUCCESS',
        durationMs: result.durationMs,
        warehouseName: result.warehouseName,
        statementType: result.statementType,
        error: null,
      },
      rowCount: rows.length,
      totalRows: result.totalRows,
      truncated: allRawRows.length > maxRows,
    };
  },
});

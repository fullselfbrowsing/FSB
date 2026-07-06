import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchChunk } from '../snowflake-api.js';

export const getQueryTool = defineTool({
  name: 'get_query',
  displayName: 'Get Query Chunk',
  description:
    'Fetch a specific result chunk from a previously executed query by its query ID and chunk index. Use this when run_query indicates hasMoreChunks=true. Chunk index 0 is the first chunk (already returned by run_query), so start from index 1. Returns raw row arrays — use the column metadata from the original run_query response to interpret values.',
  summary: 'Fetch additional result chunks for a query',
  icon: 'download',
  group: 'Queries',
  input: z.object({
    queryId: z.string().describe('Query ID returned from run_query'),
    chunkIndex: z.number().int().min(0).describe('Chunk index to fetch (0-based, start from 1 for additional chunks)'),
  }),
  output: z.object({
    rows: z
      .array(z.array(z.string().nullable()))
      .describe('Raw row arrays — each inner array is a row of string values'),
    rowCount: z.number().describe('Number of rows in this chunk'),
  }),
  handle: async params => {
    const rows = await fetchChunk(params.queryId, params.chunkIndex);
    return {
      rows: rows as (string | null)[][],
      rowCount: rows.length,
    };
  },
});

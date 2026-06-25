import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const executeSql = defineTool({
  name: 'execute_sql',
  displayName: 'Execute SQL',
  description:
    'Execute one or more SQL statements against a CockroachDB cluster. Returns column names and row data for each statement. The cluster must be in CREATED state and have available capacity.',
  summary: 'Execute SQL statements on a cluster',
  icon: 'terminal-square',
  group: 'SQL',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
    statements: z.array(z.string()).describe('SQL statements to execute'),
    database: z.string().optional().describe('Database name to use (defaults to defaultdb)'),
  }),
  output: z.object({
    results: z.array(
      z.object({
        statement: z.string().describe('The SQL statement that was executed'),
        columns: z.array(z.string()).describe('Column names in the result set'),
        rows: z.array(z.array(z.string())).describe('Result rows as arrays of string values'),
        rows_affected: z.number().int().describe('Number of rows affected'),
        error: z.string().describe('Error message if the statement failed'),
      }),
    ),
  }),
  handle: async params => {
    const p = getConsoleProto();

    interface RawColumn {
      name?: string;
    }
    interface RawSqlResult {
      statement?: string;
      columnsList?: RawColumn[];
      rowsDataList?: string[];
      rowsAffected?: number;
      error?: { message?: string };
    }

    const data = await grpc<{ resultsList?: RawSqlResult[] }>('ExecuteSql', p.ExecuteSqlResponse, () => {
      const req = newRequest('ExecuteSqlRequest');
      setField(req, 'setClusterId', params.cluster_id);
      setField(req, 'setStatementsList', params.statements);
      if (params.database) setField(req, 'setDatabase', params.database);
      return req;
    });

    return {
      results: (data.resultsList ?? []).map(r => ({
        statement: r.statement ?? '',
        columns: (r.columnsList ?? []).map(c => c.name ?? ''),
        rows: (r.rowsDataList ?? []).map(row => {
          try {
            return JSON.parse(row) as string[];
          } catch {
            return [row];
          }
        }),
        rows_affected: r.rowsAffected ?? 0,
        error: r.error?.message ?? '',
      })),
    };
  },
});

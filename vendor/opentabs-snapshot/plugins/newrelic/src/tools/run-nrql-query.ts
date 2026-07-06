import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const runNrqlQuery = defineTool({
  name: 'run_nrql_query',
  displayName: 'Run NRQL Query',
  description:
    'Execute a NRQL (New Relic Query Language) query against an account. Returns raw query results. Examples: "SELECT count(*) FROM Transaction SINCE 1 hour ago", "SELECT average(duration) FROM Transaction FACET appName SINCE 1 day ago", "SHOW EVENT TYPES".',
  summary: 'Execute a NRQL query',
  icon: 'terminal',
  group: 'NRQL',
  input: z.object({
    account_id: z.number().int().describe('Account ID to query'),
    query: z.string().min(1).describe('NRQL query string'),
    timeout: z.number().int().optional().describe('Query timeout in seconds (default 30)'),
  }),
  output: z.object({
    results: z.array(z.record(z.string(), z.unknown())).describe('Query result rows'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Query metadata if available'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: {
        account: {
          nrql: {
            results: Array<Record<string, unknown>>;
            metadata?: Record<string, unknown>;
          };
        };
      };
    }>(
      `query RunNrql($accountId: Int!, $query: Nrql!, $timeout: Seconds) {
        actor {
          account(id: $accountId) {
            nrql(query: $query, timeout: $timeout) {
              results
              metadata { facets timeWindow { begin end } }
            }
          }
        }
      }`,
      { accountId: params.account_id, query: params.query, timeout: params.timeout },
    );
    const nrql = data.actor.account.nrql;
    return {
      results: nrql?.results ?? [],
      metadata: nrql?.metadata,
    };
  },
});

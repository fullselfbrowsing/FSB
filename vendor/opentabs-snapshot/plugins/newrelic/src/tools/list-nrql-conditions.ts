import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { nrqlConditionSchema, mapNrqlCondition } from './schemas.js';
import type { RawNrqlCondition } from './schemas.js';

export const listNrqlConditions = defineTool({
  name: 'list_nrql_conditions',
  displayName: 'List NRQL Alert Conditions',
  description:
    'List NRQL-based alert conditions for an account. Optionally filter by policy ID. NRQL conditions trigger alerts when a NRQL query result crosses a threshold.',
  summary: 'List NRQL alert conditions',
  icon: 'alert-triangle',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    policy_id: z.string().optional().describe('Filter by alert policy ID'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    conditions: z.array(nrqlConditionSchema).describe('NRQL alert conditions'),
    next_cursor: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const searchCriteria: Record<string, unknown> = {};
    if (params.policy_id) searchCriteria.policyId = params.policy_id;

    const data = await graphql<{
      actor: {
        account: {
          alerts: {
            nrqlConditionsSearch: {
              nrqlConditions: RawNrqlCondition[];
              nextCursor: string | null;
            };
          };
        };
      };
    }>(
      `query ListNrqlConditions($accountId: Int!, $cursor: String, $searchCriteria: AlertsNrqlConditionsSearchCriteriaInput) {
        actor {
          account(id: $accountId) {
            alerts {
              nrqlConditionsSearch(cursor: $cursor, searchCriteria: $searchCriteria) {
                nrqlConditions {
                  id name enabled policyId
                  nrql { query }
                  signal { aggregationWindow }
                }
                nextCursor
              }
            }
          }
        }
      }`,
      {
        accountId: params.account_id,
        cursor: params.cursor,
        searchCriteria: Object.keys(searchCriteria).length ? searchCriteria : undefined,
      },
    );
    const search = data.actor.account.alerts.nrqlConditionsSearch;
    return {
      conditions: (search?.nrqlConditions ?? []).map(mapNrqlCondition),
      next_cursor: search?.nextCursor ?? '',
    };
  },
});

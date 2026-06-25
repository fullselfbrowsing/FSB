import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { alertPolicySchema, mapAlertPolicy } from './schemas.js';
import type { RawAlertPolicy } from './schemas.js';

export const listAlertPolicies = defineTool({
  name: 'list_alert_policies',
  displayName: 'List Alert Policies',
  description:
    'List alert policies for a New Relic account. Policies group related alert conditions together and define the incident preference (per-policy, per-condition, or per-condition-and-target).',
  summary: 'List alert policies',
  icon: 'bell',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    policies: z.array(alertPolicySchema).describe('Alert policies'),
    total_count: z.number().describe('Total number of policies'),
    next_cursor: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: {
        account: {
          alerts: {
            policiesSearch: {
              policies: RawAlertPolicy[];
              totalCount: number;
              nextCursor: string | null;
            };
          };
        };
      };
    }>(
      `query ListPolicies($accountId: Int!, $cursor: String) {
        actor {
          account(id: $accountId) {
            alerts {
              policiesSearch(cursor: $cursor) {
                policies { id name incidentPreference }
                totalCount
                nextCursor
              }
            }
          }
        }
      }`,
      { accountId: params.account_id, cursor: params.cursor },
    );
    const search = data.actor.account.alerts.policiesSearch;
    return {
      policies: (search?.policies ?? []).map(mapAlertPolicy),
      total_count: search?.totalCount ?? 0,
      next_cursor: search?.nextCursor ?? '',
    };
  },
});

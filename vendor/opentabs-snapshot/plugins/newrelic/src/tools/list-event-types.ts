import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const listEventTypes = defineTool({
  name: 'list_event_types',
  displayName: 'List Event Types',
  description:
    'List all available event types in a New Relic account. Event types are the data sources you can query with NRQL (e.g., Transaction, SystemSample, PageView).',
  summary: 'List available event types for NRQL',
  icon: 'list',
  group: 'NRQL',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
  }),
  output: z.object({
    event_types: z.array(z.string()).describe('Available event type names'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: {
        account: {
          nrql: { results: Array<{ eventType: string }> };
        };
      };
    }>(
      `query ListEventTypes($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SHOW EVENT TYPES") { results }
          }
        }
      }`,
      { accountId: params.account_id },
    );
    return {
      event_types: (data.actor.account.nrql?.results ?? []).map(r => r.eventType ?? ''),
    };
  },
});

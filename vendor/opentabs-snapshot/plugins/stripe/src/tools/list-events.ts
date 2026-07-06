import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawEvent, type StripeList, eventSchema, mapEvent } from './schemas.js';

export const listEvents = defineTool({
  name: 'list_events',
  displayName: 'List Events',
  description:
    'List events in your Stripe account. Events represent changes to Stripe objects (up to 30 days). Optionally filter by event type.',
  summary: 'List recent events',
  icon: 'bell',
  group: 'Events',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
    starting_after: z.string().optional().describe('Event ID cursor for pagination'),
    type: z.string().optional().describe('Filter by event type (e.g., customer.created, payment_intent.succeeded)'),
  }),
  output: z.object({
    events: z.array(eventSchema).describe('List of events'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawEvent>>('/events', {
      query: { limit: params.limit, starting_after: params.starting_after, type: params.type },
    });
    return {
      events: (data.data ?? []).map(mapEvent),
      has_more: data.has_more ?? false,
    };
  },
});

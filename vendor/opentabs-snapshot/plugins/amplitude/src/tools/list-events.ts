import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';

const QUERY = `query GetEventPropertiesForEvent($appId: String!, $eventType: String!) {
  eventProperties(appId: $appId, eventType: $eventType)
}`;

export const listEvents = defineTool({
  name: 'list_events',
  displayName: 'List Events',
  description:
    "List event properties for a specific event type in a project/app. Use get_org_data first to find the app ID, then provide the event type name (e.g., '[Amplitude] Element Clicked').",
  summary: 'Get event properties for an event type',
  icon: 'activity',
  group: 'Analytics',
  input: z.object({
    app_id: z.string().describe('App/project ID (from get_org_data apps list)'),
    event_type: z.string().describe("Event type name (e.g., '[Amplitude] Element Clicked')"),
  }),
  output: z.object({
    event_type: z.string().describe('The queried event type'),
    properties: z.array(z.string()).describe('List of event property names for this event type'),
  }),
  handle: async params => {
    const data = await gql<{ eventProperties: string[] }>('GetEventPropertiesForEvent', QUERY, {
      appId: params.app_id,
      eventType: params.event_type,
    });
    return {
      event_type: params.event_type,
      properties: data.eventProperties ?? [],
    };
  },
});

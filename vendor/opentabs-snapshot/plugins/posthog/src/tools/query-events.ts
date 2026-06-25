// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../posthog-api.js';

export const queryEvents = defineTool({
  name: 'query_events',
  displayName: 'Query Events',
  description: 'Query the captured events for a PostHog project. Optionally filter by event name, distinct ID, or time range.',
  summary: 'Query captured events',
  icon: 'activity',
  group: 'Events',
  input: z.object({
    project_id: z.number().int().describe('PostHog project ID'),
    event: z.string().optional().describe('Filter by event name'),
    distinct_id: z.string().optional().describe('Filter by the distinct (person) ID'),
    after: z.string().optional().describe('Only events after this ISO 8601 timestamp'),
    before: z.string().optional().describe('Only events before this ISO 8601 timestamp'),
    limit: z.number().int().optional().describe('Maximum number of events to return'),
  }),
  output: z.object({
    events: z
      .array(z.object({ id: z.string(), event: z.string() }))
      .describe('List of captured events'),
  }),
  handle: async (params: { project_id: number }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:id/events/ (default method).
    const data = await api<{ events: Array<{ id: string; event: string }> }>(
      `/projects/${params.project_id}/events/`
    );
    return data;
  },
});

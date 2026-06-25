// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const getAvailability = defineTool({
  name: 'get_availability',
  displayName: 'Get Availability',
  description: 'Get the available open time slots for a Calendly event type over a date range. Returns bookable start times.',
  summary: 'check my calendly availability',
  icon: 'clock',
  group: 'Scheduling',
  input: z.object({
    event_type_id: z.string().min(1).describe('The event type whose availability to check'),
    start_date: z.string().min(1).describe('Range start date (YYYY-MM-DD)'),
    end_date: z.string().min(1).describe('Range end date (YYYY-MM-DD)'),
  }),
  output: z.object({
    slots: z.array(z.object({
      start_time: z.string(),
      status: z.string(),
    })).describe('Available open time slots'),
  }),
  handle: async (params: { event_type_id: string; start_date: string; end_date: string }) => {
    // NEVER executed by the importer. Upstream: api GET /event_type_available_times (default method, a READ).
    const data = await api<{ slots: unknown[] }>('/event_type_available_times', {
      query: {
        event_type: params.event_type_id,
        start_time: params.start_date,
        end_time: params.end_date,
      },
    });
    return { slots: data.slots as { start_time: string; status: string }[] };
  },
});

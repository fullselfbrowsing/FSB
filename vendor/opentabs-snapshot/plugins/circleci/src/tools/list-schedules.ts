import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawSchedule, mapSchedule, scheduleSchema } from './schemas.js';

export const listSchedules = defineTool({
  name: 'list_schedules',
  displayName: 'List Schedules',
  description: 'List scheduled pipeline triggers for a project.',
  summary: 'List scheduled triggers',
  icon: 'clock',
  group: 'Schedules',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    schedules: z.array(scheduleSchema).describe('List of schedules'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ project_slug, page_token }) => {
    const data = await api<Paginated<RawSchedule>>(`/project/${project_slug}/schedule`, {
      query: { 'page-token': page_token },
    });
    return {
      schedules: (data.items ?? []).map(mapSchedule),
      next_page_token: data.next_page_token ?? '',
    };
  },
});

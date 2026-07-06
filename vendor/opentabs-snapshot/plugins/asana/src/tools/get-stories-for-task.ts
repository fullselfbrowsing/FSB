import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawStory, STORY_OPT_FIELDS, mapStory, storySchema } from './schemas.js';

export const getStoriesForTask = defineTool({
  name: 'get_stories_for_task',
  displayName: 'Get Stories for Task',
  description: 'List stories (comments and activity) on a task.',
  summary: 'List stories on a task',
  icon: 'message-square',
  group: 'Stories',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to retrieve stories for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of stories to return (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  }),
  output: z.object({
    stories: z.array(storySchema).describe('List of stories on the task'),
    next_page: z.string().nullable().describe('Offset token for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawStory>>(`/tasks/${params.task_gid}/stories`, {
      query: {
        opt_fields: STORY_OPT_FIELDS,
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      stories: (data.data ?? []).map(mapStory),
      next_page: data.next_page?.offset ?? null,
    };
  },
});

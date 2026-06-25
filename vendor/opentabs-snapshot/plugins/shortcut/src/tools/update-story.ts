import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawStory, mapStoryDetail, storyDetailSchema } from './schemas.js';

export const updateStory = defineTool({
  name: 'update_story',
  displayName: 'Update Story',
  description: 'Update an existing story. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update a story',
  icon: 'pencil',
  group: 'Stories',
  input: z.object({
    story_id: z.number().int().describe('Story numeric ID'),
    name: z.string().optional().describe('New story title'),
    story_type: z.enum(['feature', 'bug', 'chore']).optional().describe('New story type'),
    description: z.string().optional().describe('New description in Markdown'),
    workflow_state_id: z.number().int().optional().describe('New workflow state ID'),
    epic_id: z.number().int().nullable().optional().describe('Epic ID to associate, or null to remove'),
    iteration_id: z.number().int().nullable().optional().describe('Iteration ID to associate, or null to remove'),
    group_id: z.string().nullable().optional().describe('Team UUID, or null to remove'),
    owner_ids: z.array(z.string()).optional().describe('Replace all owners with these member UUIDs'),
    label_ids: z.array(z.number().int()).optional().describe('Replace all labels with these IDs'),
    estimate: z.number().nullable().optional().describe('Story point estimate, or null to clear'),
    deadline: z.string().nullable().optional().describe('Deadline in ISO 8601, or null to clear'),
    archived: z.boolean().optional().describe('Whether to archive the story'),
  }),
  output: z.object({ story: storyDetailSchema }),
  handle: async params => {
    const body = stripUndefined({
      name: params.name,
      story_type: params.story_type,
      description: params.description,
      workflow_state_id: params.workflow_state_id,
      epic_id: params.epic_id,
      iteration_id: params.iteration_id,
      group_id: params.group_id,
      owner_ids: params.owner_ids,
      labels: params.label_ids?.map(id => ({ id })),
      estimate: params.estimate,
      deadline: params.deadline,
      archived: params.archived,
    });
    const data = await api<RawStory>(`/stories/${params.story_id}`, { method: 'PUT', body });
    return { story: mapStoryDetail(data) };
  },
});

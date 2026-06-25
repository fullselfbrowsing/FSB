import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawStory, mapStoryDetail, storyDetailSchema } from './schemas.js';

export const createStory = defineTool({
  name: 'create_story',
  displayName: 'Create Story',
  description:
    'Create a new story in Shortcut. Requires a name and story type. Optionally set description, workflow state, epic, iteration, owners, labels, estimate, and deadline.',
  summary: 'Create a new story',
  icon: 'plus',
  group: 'Stories',
  input: z.object({
    name: z.string().describe('Story title'),
    story_type: z.enum(['feature', 'bug', 'chore']).optional().describe('Story type (default: feature)'),
    description: z.string().optional().describe('Story description in Markdown'),
    workflow_state_id: z.number().int().optional().describe('Workflow state ID to place the story in'),
    epic_id: z.number().int().optional().describe('Epic ID to associate'),
    iteration_id: z.number().int().optional().describe('Iteration ID to associate'),
    group_id: z.string().optional().describe('Team (group) UUID to assign'),
    owner_ids: z.array(z.string()).optional().describe('Member UUIDs to set as owners'),
    label_ids: z.array(z.number().int()).optional().describe('Label IDs to attach'),
    estimate: z.number().optional().describe('Story point estimate'),
    deadline: z.string().optional().describe('Deadline in ISO 8601 format'),
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
    });
    const data = await api<RawStory>('/stories', { method: 'POST', body });
    return { story: mapStoryDetail(data) };
  },
});

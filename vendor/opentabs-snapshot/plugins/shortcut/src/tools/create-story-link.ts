import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';

export const createStoryLink = defineTool({
  name: 'create_story_link',
  displayName: 'Create Story Link',
  description:
    'Create a relationship between two stories. Types: "blocks" (subject blocks object), "duplicates" (subject duplicates object), "relates to" (bidirectional).',
  summary: 'Link two stories together',
  icon: 'link',
  group: 'Stories',
  input: z.object({
    subject_id: z.number().int().describe('Subject story numeric ID'),
    object_id: z.number().int().describe('Object story numeric ID'),
    verb: z.enum(['blocks', 'duplicates', 'relates to']).describe('Relationship type'),
  }),
  output: z.object({
    id: z.number().int().describe('Story link ID'),
    subject_id: z.number().int().describe('Subject story ID'),
    object_id: z.number().int().describe('Object story ID'),
    verb: z.string().describe('Relationship type'),
  }),
  handle: async params => {
    const data = await api<{ id?: number; subject_id?: number; object_id?: number; verb?: string }>('/story-links', {
      method: 'POST',
      body: { subject_id: params.subject_id, object_id: params.object_id, verb: params.verb },
    });
    return {
      id: data.id ?? 0,
      subject_id: data.subject_id ?? 0,
      object_id: data.object_id ?? 0,
      verb: data.verb ?? '',
    };
  },
});

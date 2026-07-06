import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getTeamId, softDelete } from '../posthog-api.js';

export const deleteAnnotation = defineTool({
  name: 'delete_annotation',
  displayName: 'Delete Annotation',
  description: 'Delete an annotation by marking it as deleted (soft delete).',
  summary: 'Delete an annotation',
  icon: 'trash-2',
  group: 'Annotations',
  input: z.object({
    annotation_id: z.number().int().describe('Annotation ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await softDelete(`/api/projects/${getTeamId()}/annotations/${params.annotation_id}/`);
    return { success: true };
  },
});

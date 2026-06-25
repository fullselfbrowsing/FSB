import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawAnnotation, annotationSchema, mapAnnotation } from './schemas.js';

export const createAnnotation = defineTool({
  name: 'create_annotation',
  displayName: 'Create Annotation',
  description: 'Create a new annotation to mark an important event on PostHog charts.',
  summary: 'Create a new annotation',
  icon: 'plus',
  group: 'Annotations',
  input: z.object({
    content: z.string().describe('Annotation text content'),
    date_marker: z.string().describe('ISO 8601 timestamp the annotation marks'),
    scope: z.string().optional().describe('Annotation scope: "project" (default), "organization", or "dashboard_item"'),
  }),
  output: z.object({
    annotation: annotationSchema.describe('The newly created annotation'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      content: params.content,
      date_marker: params.date_marker,
    };
    if (params.scope !== undefined) body.scope = params.scope;

    const data = await api<RawAnnotation>(`/api/projects/${getTeamId()}/annotations/`, { method: 'POST', body });

    return { annotation: mapAnnotation(data) };
  },
});

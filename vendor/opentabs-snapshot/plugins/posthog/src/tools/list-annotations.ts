import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawAnnotation,
  annotationSchema,
  mapAnnotation,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listAnnotations = defineTool({
  name: 'list_annotations',
  displayName: 'List Annotations',
  description: 'List annotations in the current PostHog project. Annotations mark important events on charts.',
  summary: 'List annotations',
  icon: 'message-square-text',
  group: 'Annotations',
  input: paginationInput.extend({
    search: z.string().optional().describe('Search annotations by content'),
  }),
  output: paginationOutput.extend({
    annotations: z.array(annotationSchema).describe('List of annotations'),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawAnnotation>>(`/api/projects/${getTeamId()}/annotations/`, {
      query: { limit: params.limit, offset: params.offset, search: params.search },
    });

    return {
      annotations: (data.results ?? []).map(mapAnnotation),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});

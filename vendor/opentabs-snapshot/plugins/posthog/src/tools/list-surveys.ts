import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawSurvey,
  mapSurvey,
  paginationInput,
  paginationOutput,
  surveySchema,
} from './schemas.js';

export const listSurveys = defineTool({
  name: 'list_surveys',
  displayName: 'List Surveys',
  description:
    'List surveys in the current PostHog project. Surveys collect user feedback via popover, button, email, or API.',
  summary: 'List surveys',
  icon: 'clipboard-list',
  group: 'Surveys',
  input: paginationInput.extend({
    archived: z.boolean().optional().describe('Filter by archived status'),
  }),
  output: paginationOutput.extend({
    surveys: z.array(surveySchema).describe('List of surveys'),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawSurvey>>(`/api/projects/${getTeamId()}/surveys/`, {
      query: { limit: params.limit, offset: params.offset, archived: params.archived },
    });

    return {
      surveys: (data.results ?? []).map(mapSurvey),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});

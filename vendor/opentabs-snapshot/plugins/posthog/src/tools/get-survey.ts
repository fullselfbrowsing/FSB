import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawSurvey, mapSurvey, surveySchema } from './schemas.js';

export const getSurvey = defineTool({
  name: 'get_survey',
  displayName: 'Get Survey',
  description: 'Get detailed information about a specific survey including its type, dates, and archive status.',
  summary: 'Get survey details',
  icon: 'clipboard-list',
  group: 'Surveys',
  input: z.object({
    survey_id: z.string().describe('Survey UUID'),
  }),
  output: z.object({
    survey: surveySchema.describe('The survey details'),
  }),
  handle: async params => {
    const data = await api<RawSurvey>(`/api/projects/${getTeamId()}/surveys/${params.survey_id}/`);
    return { survey: mapSurvey(data) };
  },
});

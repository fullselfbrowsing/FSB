import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawPerson, mapPerson, personSchema } from './schemas.js';

export const getPerson = defineTool({
  name: 'get_person',
  displayName: 'Get Person',
  description: 'Get detailed information about a specific person including their properties and distinct IDs.',
  summary: 'Get person details',
  icon: 'user',
  group: 'Persons',
  input: z.object({
    person_id: z.number().int().describe('Person internal ID'),
  }),
  output: z.object({
    person: personSchema.describe('The person details'),
  }),
  handle: async params => {
    const data = await api<RawPerson>(`/api/environments/${getTeamId()}/persons/${params.person_id}/`);
    return { person: mapPerson(data) };
  },
});

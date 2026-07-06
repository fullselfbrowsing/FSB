import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../carta-api.js';
import { companyProfileSchema } from './schemas.js';

interface ProfileResponse {
  legal_name: string;
  date_of_incorporation: string | null;
  address: string | null;
  ceo: string | null;
  website: string | null;
  description: string | null;
}

export const getCompanyProfile = defineTool({
  name: 'get_company_profile',
  displayName: 'Get Company Profile',
  description:
    'Get detailed profile for a company including legal name, incorporation date, address, CEO, website, and description.',
  summary: 'Get company profile details',
  icon: 'building',
  group: 'Portfolio',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({ profile: companyProfileSchema }),
  handle: async params => {
    const data = await api<ProfileResponse>(`/api/portfolio/v1/issuers/${params.corporation_id}/profile/`);
    return {
      profile: {
        legal_name: data.legal_name,
        date_of_incorporation: data.date_of_incorporation,
        address: data.address,
        ceo: data.ceo,
        website: data.website,
        description: data.description,
      },
    };
  },
});

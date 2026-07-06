import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';
import { type RawMembershipResponse, mapMembership, membershipSchema } from './schemas.js';

export const getMembership = defineTool({
  name: 'get_membership',
  displayName: 'Get Membership',
  description:
    'Get Uber One membership details including average monthly savings, monthly membership price, and potential savings for non-members.',
  summary: 'Get Uber One membership details and savings',
  icon: 'crown',
  group: 'Account',
  input: z.object({}),
  output: z.object({ membership: membershipSchema }),
  handle: async () => {
    const data = await api<RawMembershipResponse>('/getMembershipAttributes?localeCode=en', {
      body: {
        responseAttributes: [
          'membership_member_state',
          'savings_member_cycle_savings',
          'offering_member_billing_type',
          'membership_member_acquisition_price',
          'membership_member_start_date',
          'savings_average_monthly_savings',
          'offering_monthly_offering_price',
          'savings_nonmember_potential_savings',
          'membership_member_cycle_start_date',
          'membership_member_signup_country_iso2',
        ],
      },
    });
    return { membership: mapMembership(data) };
  },
});

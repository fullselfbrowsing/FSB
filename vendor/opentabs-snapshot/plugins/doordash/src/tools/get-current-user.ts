import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { consumerSchema, mapConsumer } from './schemas.js';

const QUERY = `query consumer {
  consumer {
    id userId firstName lastName email phoneNumber timezone
    defaultCountry isGuest
    localizedNames { informalName formalName }
    phoneNumberComponents { formattedNationalNumber countryCode countryShortname }
    defaultAddress { id addressId street city state zipCode lat lng printableAddress shortname }
  }
}`;

interface ConsumerResponse {
  consumer: Record<string, unknown>;
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated DoorDash user profile including name, email, phone number, and default delivery address.',
  summary: 'Get your DoorDash profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ consumer: consumerSchema }),
  handle: async () => {
    const data = await gql<ConsumerResponse>('consumer', QUERY);
    return { consumer: mapConsumer(data.consumer) };
  },
});

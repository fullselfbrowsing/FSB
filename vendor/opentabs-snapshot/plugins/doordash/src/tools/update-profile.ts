import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { consumerSchema, mapConsumer } from './schemas.js';

const MUTATION = `mutation editConsumerProfileInformation(
  $firstName: String
  $lastName: String
  $email: String
  $phoneNumber: String
  $defaultCountry: String
) {
  updateConsumerProfileInformation(
    firstName: $firstName
    lastName: $lastName
    email: $email
    phoneNumber: $phoneNumber
    defaultCountry: $defaultCountry
  ) {
    id userId firstName lastName email phoneNumber timezone
    defaultCountry isGuest
    defaultAddress { id addressId street city state zipCode lat lng printableAddress shortname }
  }
}`;

interface UpdateProfileResponse {
  updateConsumerProfileInformation: Record<string, unknown>;
}

export const updateProfile = defineTool({
  name: 'update_profile',
  displayName: 'Update Profile',
  description:
    'Update the authenticated DoorDash user profile. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update your DoorDash profile',
  icon: 'user-pen',
  group: 'Account',
  input: z.object({
    first_name: z.string().optional().describe('New first name'),
    last_name: z.string().optional().describe('New last name'),
    email: z.string().optional().describe('New email address'),
    phone_number: z.string().optional().describe('New phone number in E.164 format (e.g., +18005551234)'),
    default_country: z.string().optional().describe('New default country'),
  }),
  output: z.object({ consumer: consumerSchema }),
  handle: async params => {
    const variables: Record<string, unknown> = {};
    if (params.first_name !== undefined) variables.firstName = params.first_name;
    if (params.last_name !== undefined) variables.lastName = params.last_name;
    if (params.email !== undefined) variables.email = params.email;
    if (params.phone_number !== undefined) variables.phoneNumber = params.phone_number;
    if (params.default_country !== undefined) variables.defaultCountry = params.default_country;

    const data = await gql<UpdateProfileResponse>('editConsumerProfileInformation', MUTATION, variables);
    return { consumer: mapConsumer(data.updateConsumerProfileInformation) };
  },
});

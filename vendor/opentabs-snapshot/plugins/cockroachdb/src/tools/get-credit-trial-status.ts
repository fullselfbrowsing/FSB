import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';

export const getCreditTrialStatus = defineTool({
  name: 'get_credit_trial_status',
  displayName: 'Get Trial Status',
  description:
    'Get the credit trial status for the current organization, including remaining credits and trial expiration.',
  summary: 'Get credit trial status',
  icon: 'gift',
  group: 'Billing',
  input: z.object({}),
  output: z.object({
    trial: z.record(z.string(), z.unknown()).describe('Trial status details'),
  }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<Record<string, unknown>>('GetCreditTrialStatus', p.GetCreditTrialStatusResponse);
    return { trial: data };
  },
});

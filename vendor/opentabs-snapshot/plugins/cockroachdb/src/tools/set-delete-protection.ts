import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getResponseClass, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const setDeleteProtection = defineTool({
  name: 'set_delete_protection',
  displayName: 'Set Delete Protection',
  description:
    'Enable or disable delete protection on a CockroachDB cluster. When enabled, the cluster cannot be deleted until protection is removed.',
  summary: 'Enable or disable cluster delete protection',
  icon: 'shield',
  group: 'Clusters',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
    enabled: z.boolean().describe('Whether to enable (true) or disable (false) delete protection'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the setting was updated') }),
  handle: async params => {
    await grpc('SetDeleteProtection', getResponseClass('Empty'), () => {
      const req = newRequest('SetDeleteProtectionRequest');
      setField(req, 'setClusterId', params.cluster_id);
      setField(req, 'setDeleteProtection', params.enabled ? 1 : 2);
      return req;
    });
    return { success: true };
  },
});

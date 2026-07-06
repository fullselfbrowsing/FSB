import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const getSecurityAdvisors = defineTool({
  name: 'get_security_advisors',
  displayName: 'Get Security Advisors',
  description:
    'Get security advisor recommendations for a Supabase project. ' +
    'Identifies potential security issues like exposed credentials, weak RLS policies, and auth misconfigurations.',
  summary: 'Get security advisor recommendations',
  icon: 'shield-check',
  group: 'Advisors',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    advisors: z.array(z.record(z.string(), z.unknown())).describe('Security advisories'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/advisors/security`);
    return { advisors: Array.isArray(data) ? data : [] };
  },
});

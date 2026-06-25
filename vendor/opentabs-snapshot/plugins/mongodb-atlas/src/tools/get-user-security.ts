import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';

interface RawUserSecurity {
  ldap?: { authenticationEnabled?: boolean; authorizationEnabled?: boolean };
  customerX509?: { cas?: string };
}

export const getUserSecurity = defineTool({
  name: 'get_user_security',
  displayName: 'Get User Security',
  description:
    'Get the authentication security settings for the current MongoDB Atlas project including LDAP authentication, LDAP authorization, and custom X.509 certificate authority status.',
  summary: 'Get project security settings',
  icon: 'lock',
  group: 'Security',
  input: z.object({}),
  output: z.object({
    ldap_auth_enabled: z.boolean().describe('Whether LDAP authentication is enabled'),
    ldap_authz_enabled: z.boolean().describe('Whether LDAP authorization is enabled'),
    has_custom_x509_cas: z.boolean().describe('Whether custom X.509 certificate authorities are configured'),
  }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawUserSecurity>(`/nds/${groupId}/userSecurity`);
    return {
      ldap_auth_enabled: raw.ldap?.authenticationEnabled ?? false,
      ldap_authz_enabled: raw.ldap?.authorizationEnabled ?? false,
      has_custom_x509_cas: (raw.customerX509?.cas ?? '').length > 0,
    };
  },
});

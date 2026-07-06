import { getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserInfo } from '../netflix-api.js';
import { type RawProfile, mapProfile, profileSchema } from './schemas.js';

export const listProfiles = defineTool({
  name: 'list_profiles',
  displayName: 'List Profiles',
  description:
    'List all profiles on the Netflix account. Returns each profile with its name, avatar, and whether it is the currently active profile.',
  summary: 'List all Netflix profiles',
  icon: 'users',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    profiles: z.array(profileSchema).describe('Netflix profiles'),
  }),
  handle: async () => {
    const profiles: ReturnType<typeof mapProfile>[] = [];

    const userInfo = getUserInfo();
    const currentGuid = (userInfo?.guid ?? userInfo?.userGuid) as string | undefined;

    // Read profiles from the Falcor cache inline (avoids circular reference issues)
    const falcorCache = getPageGlobal('netflix.falcorCache') as Record<string, unknown> | undefined;
    const profilesList = falcorCache?.profilesList as Record<string, unknown> | undefined;
    const profilesMap = falcorCache?.profiles as Record<string, Record<string, unknown>> | undefined;

    if (profilesList && profilesMap) {
      const summary = profilesList.summary as { length?: number } | undefined;
      const count = summary?.length ?? 10;

      for (let i = 0; i < count; i++) {
        const profileRef = profilesList[String(i)] as Record<string, unknown> | undefined;
        if (!profileRef) continue;

        // Falcor refs use { $type: 'ref', value: ['profiles', '<guid>'] }
        const refValue = (profileRef as { $type?: string; value?: string[] }).value;
        const guid = refValue?.[1] as string | undefined;
        if (!guid) continue;

        const profile = profilesMap[guid] as Record<string, unknown> | undefined;
        // Falcor wraps data in { $type: 'atom', value: { ... } } — unwrap the atom
        const summaryAtom = profile?.summary as { $type?: string; value?: Record<string, unknown> } | undefined;
        const profileData =
          summaryAtom?.$type === 'atom' ? summaryAtom.value : (summaryAtom as Record<string, unknown> | undefined);

        const raw: RawProfile = {
          guid,
          profileName: (profileData?.profileName as string | undefined) ?? '',
          firstName: (profileData?.firstName as string | undefined) ?? '',
          isKids: (profileData?.isKids as boolean | undefined) ?? false,
          avatarUrl: '',
          isActive: guid === currentGuid,
        };

        profiles.push(mapProfile(raw));
      }
    } else if (currentGuid && userInfo) {
      // Fallback: return just the current profile from userInfo
      const raw: RawProfile = {
        guid: currentGuid,
        profileName: (userInfo.accountOwnerName as string | undefined) ?? (userInfo.name as string | undefined) ?? '',
        firstName:
          (userInfo.accountOwnerName as string | undefined) ?? (userInfo.firstName as string | undefined) ?? '',
        isKids: false,
        avatarUrl: '',
        isActive: true,
      };
      profiles.push(mapProfile(raw));
    }

    return { profiles };
  },
});

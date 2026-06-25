import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getVuexSlice } from '../chipotle-api.js';
import { type RawMenuGroup, mapMenuGroup, menuGroupSchema } from './schemas.js';

export const getMenuGroups = defineTool({
  name: 'get_menu_groups',
  displayName: 'Get Menu Groups',
  description:
    'Get menu group categories (e.g. "Burrito", "Bowl", "Tacos") from the locally cached Vuex store. No API call is made — reads from the current page state.',
  summary: 'Get menu categories from local page state',
  icon: 'layout-grid',
  group: 'Menu',
  input: z.object({}),
  output: z.object({
    groups: z.array(menuGroupSchema).describe('Menu group categories'),
  }),
  handle: async () => {
    const data = getVuexSlice<Record<string, RawMenuGroup>>('menu.metadata.groups');
    const groups = data ? Object.values(data).map(mapMenuGroup) : [];
    return { groups };
  },
});

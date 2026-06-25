import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiGet, getUserId } from '../airtable-api.js';
import { baseSchema, mapBase, mapWorkspace, workspaceSchema } from './schemas.js';

interface WorkspaceRecord {
  id?: string;
  name?: string;
  visibleApplicationOrder?: string[];
  sharedWithCurrentUser?: { directPermissionLevel?: string };
}

interface BaseRecord {
  id?: string;
  name?: string;
  color?: string;
  currentUserEffectivePermissionLevel?: string;
}

interface ListResult {
  workspaceRecordById?: { [key: string]: WorkspaceRecord };
  applicationRecordById?: { [key: string]: BaseRecord };
}

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  displayName: 'List Workspaces',
  description:
    'List all workspaces and bases the current user has access to. Returns workspace metadata with nested base (application) information.',
  summary: 'List all workspaces and their bases',
  icon: 'layout-grid',
  group: 'Workspaces',
  input: z.object({}),
  output: z.object({
    workspaces: z.array(workspaceSchema).describe('All accessible workspaces'),
    bases: z.array(baseSchema).describe('All accessible bases across all workspaces'),
  }),
  handle: async () => {
    const userId = getUserId();
    const data = await apiGet<ListResult>(`user/${userId}/listApplicationsAndPageBundlesForDisplay`);

    const workspaceRecords = data.workspaceRecordById ?? {};
    const workspaces = (Object.values(workspaceRecords) as WorkspaceRecord[]).map(mapWorkspace);
    const baseRecords = data.applicationRecordById ?? {};
    const bases = (Object.values(baseRecords) as BaseRecord[]).map(mapBase);

    return { workspaces, bases };
  },
});

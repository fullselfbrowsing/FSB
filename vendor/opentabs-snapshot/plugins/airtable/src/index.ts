import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './airtable-api.js';
import { createComment } from './tools/create-comment.js';
import { getBaseSchema } from './tools/get-base-schema.js';
import { getFieldChoices } from './tools/get-field-choices.js';
import { getRecord } from './tools/get-record.js';
import { getRecordActivity } from './tools/get-record-activity.js';
import { listRecords } from './tools/list-records.js';
import { listWorkspaces } from './tools/list-workspaces.js';
import { updateCell } from './tools/update-cell.js';

class AirtablePlugin extends OpenTabsPlugin {
  readonly name = 'airtable';
  readonly description =
    'OpenTabs plugin for Airtable — read and write data in Airtable bases, tables, and records through the authenticated browser session.';
  override readonly displayName = 'Airtable';
  readonly urlPatterns = ['*://*.airtable.com/*'];
  override readonly homepage = 'https://airtable.com';
  readonly tools: ToolDefinition[] = [
    listWorkspaces,
    getBaseSchema,
    listRecords,
    getRecord,
    updateCell,
    getRecordActivity,
    createComment,
    getFieldChoices,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new AirtablePlugin();

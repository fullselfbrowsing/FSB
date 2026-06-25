// Vendored metadata slice of the OpenTabs airtable plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Airtable is a REST app (host airtable.com -> derived stem 'airtable', NOT in
// STEM_OVERRIDES). Its ops GET/POST/PATCH/DELETE against the Airtable Web API, so the
// side-effect class derives from the named-verb helper + {method:'...'} literal + the
// op-name verb. The delete_record op is the destructive proof for this sub-batch: it
// calls apiVoid {method:'DELETE'} (DELETE classes destructive) AND its op-name is in
// the SIDE_EFFECT_OVERRIDES floor (delete_record -> destructive) -- the cross-check
// FAILS the build if it were ever under-stated as read. Part of the Phase-37
// dev/productivity batch-A sub-batch 2.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listRecords } from './tools/list-records.js';
import { getRecord } from './tools/get-record.js';
import { createRecord } from './tools/create-record.js';
import { updateRecord } from './tools/update-record.js';
import { deleteRecord } from './tools/delete-record.js';

class AirtablePlugin extends OpenTabsPlugin {
  readonly name = 'airtable';
  readonly description =
    'OpenTabs plugin for Airtable — manage records in bases and tables via the Airtable Web API';
  override readonly displayName = 'Airtable';
  readonly urlPatterns = ['*://airtable.com/*'];
  override readonly homepage = 'https://airtable.com';
  readonly tools: ToolDefinition[] = [
    // Records (the vendored dev/productivity batch-A sub-batch-2 slice)
    listRecords,
    getRecord,
    createRecord,
    updateRecord,
    deleteRecord,
  ];
}

const plugin = new AirtablePlugin();
export default plugin;
export { plugin };

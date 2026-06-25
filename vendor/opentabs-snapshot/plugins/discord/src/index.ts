// Vendored metadata slice of the OpenTabs discord plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Discord is the messaging app whose WRITES are the sensitive-write concern. Its
// upstream host is discord.com -- the EXACT origin Phase 35 + Plan 38-01 classified
// SENSITIVE -- so the merge-time classifyGate passes on a screened origin. The
// host-derived stem ('discord') is CORRECT -> NO STEM_OVERRIDES entry. Part of
// Phase-38 batch B sub-batch 2 (messaging + content-reads). Its ops list channels +
// a channel's messages (reads), POST a new message (send_message -> the sensitive
// messaging WRITE -- the END-TO-END sensitive-write-import proof origin, Plan 38-03
// Task 3), and DELETE a message (delete_message -> DESTRUCTIVE); posture-B re-gates
// the writes because the origin is sensitive. backing:'dom' (the frozen default) ->
// DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listChannels } from './tools/list-channels.js';
import { listMessages } from './tools/list-messages.js';
import { sendMessage } from './tools/send-message.js';
import { deleteMessage } from './tools/delete-message.js';

class DiscordPlugin extends OpenTabsPlugin {
  readonly name = 'discord';
  readonly description =
    'OpenTabs plugin for Discord — list your channels, read a channel’s messages, send a message, and delete a message';
  override readonly displayName = 'Discord';
  readonly urlPatterns = ['*://discord.com/*'];
  override readonly homepage = 'https://discord.com';
  readonly tools: ToolDefinition[] = [
    // Channels + messages (reads), sending (the sensitive write), and deleting (destructive).
    listChannels,
    listMessages,
    sendMessage,
    deleteMessage,
  ];
}

const plugin = new DiscordPlugin();
export default plugin;
export { plugin };

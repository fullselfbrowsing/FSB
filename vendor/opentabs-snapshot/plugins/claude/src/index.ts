// Vendored metadata slice of the OpenTabs claude plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Claude is the Anthropic AI-chat app. Its upstream host is claude.ai -- the EXACT
// origin Plan 38-01 classified SENSITIVE -- so the merge-time classifyGate passes on
// a screened origin. The host-derived stem ('claude') is CORRECT -> NO STEM_OVERRIDES
// entry. Part of Phase-38 batch B sub-batch 1 (AI-chat + microblog/fediverse). Its
// ops GET the conversation list + a single conversation (reads) and POST a message
// (send_message -> the sensitive AI-chat WRITE; posture-B re-gates it because the
// origin is sensitive). backing:'dom' (the frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listConversations } from './tools/list-conversations.js';
import { getConversation } from './tools/get-conversation.js';
import { sendMessage } from './tools/send-message.js';

class ClaudePlugin extends OpenTabsPlugin {
  readonly name = 'claude';
  readonly description =
    'OpenTabs plugin for Claude — list your conversations, read a conversation, and send a message to Claude';
  override readonly displayName = 'Claude';
  readonly urlPatterns = ['*://claude.ai/*'];
  override readonly homepage = 'https://claude.ai';
  readonly tools: ToolDefinition[] = [
    // Conversation list + one conversation (reads) and sending a message (the sensitive write).
    listConversations,
    getConversation,
    sendMessage,
  ];
}

const plugin = new ClaudePlugin();
export default plugin;
export { plugin };

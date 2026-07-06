import { isSlackAuthenticated, waitForSlackAuth } from './slack-api.js';
import { addReaction } from './tools/add-reaction.js';
import { createChannel } from './tools/create-channel.js';
import { deleteMessage } from './tools/delete-message.js';
import { editMessage } from './tools/edit-message.js';
import { getChannelInfo } from './tools/get-channel-info.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { inviteToChannel } from './tools/invite-to-channel.js';
import { listChannels } from './tools/list-channels.js';
import { listFiles } from './tools/list-files.js';
import { listMembers } from './tools/list-members.js';
import { listUsers } from './tools/list-users.js';
import { openDm } from './tools/open-dm.js';
import { pinMessage } from './tools/pin-message.js';
import { readMessages } from './tools/read-messages.js';
import { readThread } from './tools/read-thread.js';
import { removeReaction } from './tools/remove-reaction.js';
import { searchMessages } from './tools/search-messages.js';
import { sendMessage } from './tools/send-message.js';
import { setChannelPurpose } from './tools/set-channel-purpose.js';
import { setChannelTopic } from './tools/set-channel-topic.js';
import { unpinMessage } from './tools/unpin-message.js';
import { uploadFile } from './tools/upload-file.js';
import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';

class SlackPlugin extends OpenTabsPlugin {
  readonly name = 'slack';
  readonly description = 'OpenTabs plugin for Slack (standard workspaces). For Enterprise Grid, use slack-enterprise.';
  override readonly displayName = 'Slack';
  readonly urlPatterns = ['*://*.slack.com/*'];
  override readonly homepage = 'https://app.slack.com';
  readonly tools: ToolDefinition[] = [
    sendMessage,
    editMessage,
    deleteMessage,
    readMessages,
    readThread,
    searchMessages,
    listChannels,
    getChannelInfo,
    createChannel,
    setChannelTopic,
    setChannelPurpose,
    inviteToChannel,
    listMembers,
    getUserProfile,
    listUsers,
    openDm,
    uploadFile,
    listFiles,
    addReaction,
    removeReaction,
    pinMessage,
    unpinMessage,
  ];

  /**
   * Check if the Slack session is authenticated. On app.slack.com (SPA),
   * auth globals may not be populated when the page first reaches
   * `status=complete`. This method retries briefly to handle the SPA
   * hydration delay, checking up to 3 seconds with 500ms intervals.
   */
  async isReady(): Promise<boolean> {
    if (isSlackAuthenticated()) return true;
    return waitForSlackAuth();
  }
}

export default new SlackPlugin();

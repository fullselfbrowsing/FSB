import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './twilio-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { listSubaccounts } from './tools/list-subaccounts.js';
import { getBalance } from './tools/get-balance.js';

// Phone Numbers
import { listPhoneNumbers } from './tools/list-phone-numbers.js';
import { getPhoneNumber } from './tools/get-phone-number.js';
import { updatePhoneNumber } from './tools/update-phone-number.js';
import { searchAvailableNumbers } from './tools/search-available-numbers.js';
import { listCallerIds } from './tools/list-caller-ids.js';

// Messages
import { listMessages } from './tools/list-messages.js';
import { getMessage } from './tools/get-message.js';
import { sendMessage } from './tools/send-message.js';
import { deleteMessage } from './tools/delete-message.js';

// Calls
import { listCalls } from './tools/list-calls.js';
import { getCall } from './tools/get-call.js';
import { createCall } from './tools/create-call.js';
import { updateCall } from './tools/update-call.js';

// Recordings
import { listRecordings } from './tools/list-recordings.js';
import { getRecording } from './tools/get-recording.js';
import { deleteRecording } from './tools/delete-recording.js';

// Usage
import { listUsageRecords } from './tools/list-usage-records.js';
import { listUsageTriggers } from './tools/list-usage-triggers.js';

// Messaging Services
import { listMessagingServices } from './tools/list-messaging-services.js';
import { getMessagingService } from './tools/get-messaging-service.js';
import { createMessagingService } from './tools/create-messaging-service.js';

// Verify
import { listVerifyServices } from './tools/list-verify-services.js';
import { getVerifyService } from './tools/get-verify-service.js';
import { createVerifyService } from './tools/create-verify-service.js';

// Alerts
import { listAlerts } from './tools/list-alerts.js';
import { getAlert } from './tools/get-alert.js';

// API Keys
import { listApiKeys } from './tools/list-api-keys.js';
import { createApiKey } from './tools/create-api-key.js';
import { deleteApiKey } from './tools/delete-api-key.js';

// Applications
import { listApplications } from './tools/list-applications.js';
import { getApplication } from './tools/get-application.js';
import { createApplication } from './tools/create-application.js';

class TwilioPlugin extends OpenTabsPlugin {
  readonly name = 'twilio';
  readonly description = 'OpenTabs plugin for Twilio Console';
  override readonly displayName = 'Twilio';
  readonly urlPatterns = ['*://console.twilio.com/*'];
  override readonly homepage = 'https://console.twilio.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    listSubaccounts,
    getBalance,
    listPhoneNumbers,
    getPhoneNumber,
    updatePhoneNumber,
    searchAvailableNumbers,
    listCallerIds,
    listMessages,
    getMessage,
    sendMessage,
    deleteMessage,
    listCalls,
    getCall,
    createCall,
    updateCall,
    listRecordings,
    getRecording,
    deleteRecording,
    listUsageRecords,
    listUsageTriggers,
    listMessagingServices,
    getMessagingService,
    createMessagingService,
    listVerifyServices,
    getVerifyService,
    createVerifyService,
    listAlerts,
    getAlert,
    listApiKeys,
    createApiKey,
    deleteApiKey,
    listApplications,
    getApplication,
    createApplication,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TwilioPlugin();

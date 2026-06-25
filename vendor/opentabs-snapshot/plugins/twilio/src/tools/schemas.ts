import { z } from 'zod';

// --- Account ---

export const accountSchema = z.object({
  sid: z.string().describe('Account SID (e.g., ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  friendly_name: z.string().describe('Account friendly name'),
  status: z.string().describe('Account status (active, suspended, closed)'),
  type: z.string().describe('Account type (Trial or Full)'),
  date_created: z.string().describe('Account creation date'),
  date_updated: z.string().describe('Last update date'),
  owner_account_sid: z.string().describe('Owner account SID (same as SID for main accounts)'),
});

export interface RawAccount {
  sid?: string;
  friendly_name?: string;
  status?: string;
  type?: string;
  date_created?: string;
  date_updated?: string;
  owner_account_sid?: string;
}

export const mapAccount = (a: RawAccount) => ({
  sid: a.sid ?? '',
  friendly_name: a.friendly_name ?? '',
  status: a.status ?? '',
  type: a.type ?? '',
  date_created: a.date_created ?? '',
  date_updated: a.date_updated ?? '',
  owner_account_sid: a.owner_account_sid ?? '',
});

export const balanceSchema = z.object({
  account_sid: z.string().describe('Account SID'),
  balance: z.string().describe('Current balance amount'),
  currency: z.string().describe('Currency code (e.g., USD)'),
});

export interface RawBalance {
  account_sid?: string;
  balance?: string;
  currency?: string;
}

export const mapBalance = (b: RawBalance) => ({
  account_sid: b.account_sid ?? '',
  balance: b.balance ?? '0',
  currency: b.currency ?? 'USD',
});

// --- Phone Numbers ---

export const phoneNumberSchema = z.object({
  sid: z.string().describe('Phone number SID (PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  phone_number: z.string().describe('Phone number in E.164 format (e.g., +15551234567)'),
  friendly_name: z.string().describe('Friendly name for the phone number'),
  capabilities: z.object({
    voice: z.boolean().describe('Whether the number supports voice'),
    sms: z.boolean().describe('Whether the number supports SMS'),
    mms: z.boolean().describe('Whether the number supports MMS'),
    fax: z.boolean().describe('Whether the number supports fax'),
  }),
  status: z.string().describe('Number status'),
  voice_url: z.string().describe('URL for incoming voice calls'),
  voice_method: z.string().describe('HTTP method for voice URL'),
  sms_url: z.string().describe('URL for incoming SMS'),
  sms_method: z.string().describe('HTTP method for SMS URL'),
  status_callback: z.string().describe('Status callback URL'),
  date_created: z.string().describe('Creation date'),
});

interface RawCapabilities {
  voice?: boolean;
  sms?: boolean;
  mms?: boolean;
  fax?: boolean;
}

export interface RawPhoneNumber {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
  capabilities?: RawCapabilities;
  status?: string;
  voice_url?: string;
  voice_method?: string;
  sms_url?: string;
  sms_method?: string;
  status_callback?: string;
  date_created?: string;
}

export const mapPhoneNumber = (n: RawPhoneNumber) => ({
  sid: n.sid ?? '',
  phone_number: n.phone_number ?? '',
  friendly_name: n.friendly_name ?? '',
  capabilities: {
    voice: n.capabilities?.voice ?? false,
    sms: n.capabilities?.sms ?? false,
    mms: n.capabilities?.mms ?? false,
    fax: n.capabilities?.fax ?? false,
  },
  status: n.status ?? '',
  voice_url: n.voice_url ?? '',
  voice_method: n.voice_method ?? '',
  sms_url: n.sms_url ?? '',
  sms_method: n.sms_method ?? '',
  status_callback: n.status_callback ?? '',
  date_created: n.date_created ?? '',
});

export const availableNumberSchema = z.object({
  phone_number: z.string().describe('Phone number in E.164 format'),
  friendly_name: z.string().describe('Friendly name'),
  locality: z.string().describe('City or locality'),
  region: z.string().describe('State or region'),
  iso_country: z.string().describe('ISO country code'),
  capabilities: z.object({
    voice: z.boolean().describe('Whether the number supports voice'),
    sms: z.boolean().describe('Whether the number supports SMS'),
    mms: z.boolean().describe('Whether the number supports MMS'),
    fax: z.boolean().describe('Whether the number supports fax'),
  }),
  address_requirements: z.string().describe('Address requirements (none, any, local, foreign)'),
});

export interface RawAvailableNumber {
  phone_number?: string;
  friendly_name?: string;
  locality?: string;
  region?: string;
  iso_country?: string;
  capabilities?: RawCapabilities;
  address_requirements?: string;
}

export const mapAvailableNumber = (n: RawAvailableNumber) => ({
  phone_number: n.phone_number ?? '',
  friendly_name: n.friendly_name ?? '',
  locality: n.locality ?? '',
  region: n.region ?? '',
  iso_country: n.iso_country ?? '',
  capabilities: {
    voice: n.capabilities?.voice ?? false,
    sms: n.capabilities?.sms ?? false,
    mms: n.capabilities?.mms ?? false,
    fax: n.capabilities?.fax ?? false,
  },
  address_requirements: n.address_requirements ?? 'none',
});

export const callerIdSchema = z.object({
  sid: z.string().describe('Caller ID SID'),
  phone_number: z.string().describe('Phone number in E.164 format'),
  friendly_name: z.string().describe('Friendly name'),
  date_created: z.string().describe('Creation date'),
  date_updated: z.string().describe('Last update date'),
});

export interface RawCallerId {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
  date_created?: string;
  date_updated?: string;
}

export const mapCallerId = (c: RawCallerId) => ({
  sid: c.sid ?? '',
  phone_number: c.phone_number ?? '',
  friendly_name: c.friendly_name ?? '',
  date_created: c.date_created ?? '',
  date_updated: c.date_updated ?? '',
});

// --- Messages ---

export const messageSchema = z.object({
  sid: z.string().describe('Message SID (SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  from: z.string().describe('Sender phone number'),
  to: z.string().describe('Recipient phone number'),
  body: z.string().describe('Message body text'),
  status: z.string().describe('Message status (queued, sending, sent, delivered, failed, etc.)'),
  direction: z.string().describe('Direction (inbound, outbound-api, outbound-call, outbound-reply)'),
  price: z.string().describe('Price charged for the message'),
  price_unit: z.string().describe('Currency unit for price'),
  num_segments: z.string().describe('Number of message segments'),
  date_created: z.string().describe('Creation date'),
  date_sent: z.string().describe('Date the message was sent'),
  error_code: z.number().nullable().describe('Error code if the message failed'),
  error_message: z.string().describe('Error message if the message failed'),
});

export interface RawMessage {
  sid?: string;
  from?: string;
  to?: string;
  body?: string;
  status?: string;
  direction?: string;
  price?: string | null;
  price_unit?: string;
  num_segments?: string;
  date_created?: string;
  date_sent?: string | null;
  error_code?: number | null;
  error_message?: string | null;
}

export const mapMessage = (m: RawMessage) => ({
  sid: m.sid ?? '',
  from: m.from ?? '',
  to: m.to ?? '',
  body: m.body ?? '',
  status: m.status ?? '',
  direction: m.direction ?? '',
  price: m.price ?? '0',
  price_unit: m.price_unit ?? 'USD',
  num_segments: m.num_segments ?? '0',
  date_created: m.date_created ?? '',
  date_sent: m.date_sent ?? '',
  error_code: m.error_code ?? null,
  error_message: m.error_message ?? '',
});

// --- Calls ---

export const callSchema = z.object({
  sid: z.string().describe('Call SID (CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  from: z.string().describe('Caller phone number'),
  to: z.string().describe('Called phone number'),
  status: z
    .string()
    .describe('Call status (queued, ringing, in-progress, completed, busy, no-answer, canceled, failed)'),
  direction: z.string().describe('Direction (inbound, outbound-api, outbound-dial)'),
  duration: z.string().describe('Duration in seconds'),
  price: z.string().describe('Price charged for the call'),
  price_unit: z.string().describe('Currency unit for price'),
  start_time: z.string().describe('Call start time'),
  end_time: z.string().describe('Call end time'),
  date_created: z.string().describe('Creation date'),
});

export interface RawCall {
  sid?: string;
  from?: string;
  to?: string;
  status?: string;
  direction?: string;
  duration?: string | null;
  price?: string | null;
  price_unit?: string;
  start_time?: string | null;
  end_time?: string | null;
  date_created?: string;
}

export const mapCall = (c: RawCall) => ({
  sid: c.sid ?? '',
  from: c.from ?? '',
  to: c.to ?? '',
  status: c.status ?? '',
  direction: c.direction ?? '',
  duration: c.duration ?? '0',
  price: c.price ?? '0',
  price_unit: c.price_unit ?? 'USD',
  start_time: c.start_time ?? '',
  end_time: c.end_time ?? '',
  date_created: c.date_created ?? '',
});

// --- Recordings ---

export const recordingSchema = z.object({
  sid: z.string().describe('Recording SID (RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  call_sid: z.string().describe('Call SID this recording belongs to'),
  duration: z.string().describe('Duration in seconds'),
  channels: z.number().describe('Number of audio channels'),
  source: z.string().describe('Recording source (DialVerb, Conference, etc.)'),
  status: z.string().describe('Recording status (processing, completed, absent)'),
  price: z.string().describe('Price charged'),
  price_unit: z.string().describe('Currency unit'),
  date_created: z.string().describe('Creation date'),
});

export interface RawRecording {
  sid?: string;
  call_sid?: string;
  duration?: string;
  channels?: number;
  source?: string;
  status?: string;
  price?: string | null;
  price_unit?: string;
  date_created?: string;
}

export const mapRecording = (r: RawRecording) => ({
  sid: r.sid ?? '',
  call_sid: r.call_sid ?? '',
  duration: r.duration ?? '0',
  channels: r.channels ?? 1,
  source: r.source ?? '',
  status: r.status ?? '',
  price: r.price ?? '0',
  price_unit: r.price_unit ?? 'USD',
  date_created: r.date_created ?? '',
});

// --- Usage ---

export const usageRecordSchema = z.object({
  category: z.string().describe('Usage category (e.g., sms, calls, phonenumbers)'),
  description: z.string().describe('Human-readable description'),
  count: z.string().describe('Usage count'),
  count_unit: z.string().describe('Unit for count'),
  usage: z.string().describe('Usage amount'),
  usage_unit: z.string().describe('Unit for usage'),
  price: z.string().describe('Price charged'),
  price_unit: z.string().describe('Currency unit'),
  start_date: z.string().describe('Period start date (YYYY-MM-DD)'),
  end_date: z.string().describe('Period end date (YYYY-MM-DD)'),
});

export interface RawUsageRecord {
  category?: string;
  description?: string;
  count?: string;
  count_unit?: string;
  usage?: string;
  usage_unit?: string;
  price?: string;
  price_unit?: string;
  start_date?: string;
  end_date?: string;
}

export const mapUsageRecord = (u: RawUsageRecord) => ({
  category: u.category ?? '',
  description: u.description ?? '',
  count: u.count ?? '0',
  count_unit: u.count_unit ?? '',
  usage: u.usage ?? '0',
  usage_unit: u.usage_unit ?? '',
  price: u.price ?? '0',
  price_unit: u.price_unit ?? 'USD',
  start_date: u.start_date ?? '',
  end_date: u.end_date ?? '',
});

export const usageTriggerSchema = z.object({
  sid: z.string().describe('Trigger SID'),
  friendly_name: z.string().describe('Friendly name'),
  usage_category: z.string().describe('Usage category being triggered'),
  trigger_value: z.string().describe('Value that triggers the callback'),
  current_value: z.string().describe('Current usage value'),
  recurring: z.string().describe('Recurrence (daily, monthly, yearly, alltime)'),
  callback_url: z.string().describe('URL called when triggered'),
  date_created: z.string().describe('Creation date'),
});

export interface RawUsageTrigger {
  sid?: string;
  friendly_name?: string;
  usage_category?: string;
  trigger_value?: string;
  current_value?: string;
  recurring?: string;
  callback_url?: string;
  date_created?: string;
}

export const mapUsageTrigger = (t: RawUsageTrigger) => ({
  sid: t.sid ?? '',
  friendly_name: t.friendly_name ?? '',
  usage_category: t.usage_category ?? '',
  trigger_value: t.trigger_value ?? '',
  current_value: t.current_value ?? '',
  recurring: t.recurring ?? '',
  callback_url: t.callback_url ?? '',
  date_created: t.date_created ?? '',
});

// --- Messaging Services ---

export const messagingServiceSchema = z.object({
  sid: z.string().describe('Messaging Service SID (MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  friendly_name: z.string().describe('Friendly name'),
  inbound_request_url: z.string().describe('URL for incoming messages'),
  inbound_method: z.string().describe('HTTP method for incoming messages'),
  fallback_url: z.string().describe('Fallback URL'),
  status_callback: z.string().describe('Status callback URL'),
  sticky_sender: z.boolean().describe('Whether sticky sender is enabled'),
  smart_encoding: z.boolean().describe('Whether smart encoding is enabled'),
  area_code_geomatch: z.boolean().describe('Whether area code geomatch is enabled'),
  validity_period: z.number().describe('Validity period in seconds'),
  date_created: z.string().describe('Creation date'),
  date_updated: z.string().describe('Last update date'),
});

export interface RawMessagingService {
  sid?: string;
  friendly_name?: string;
  inbound_request_url?: string;
  inbound_method?: string;
  fallback_url?: string;
  status_callback?: string;
  sticky_sender?: boolean;
  smart_encoding?: boolean;
  area_code_geomatch?: boolean;
  validity_period?: number;
  date_created?: string;
  date_updated?: string;
}

export const mapMessagingService = (s: RawMessagingService) => ({
  sid: s.sid ?? '',
  friendly_name: s.friendly_name ?? '',
  inbound_request_url: s.inbound_request_url ?? '',
  inbound_method: s.inbound_method ?? 'POST',
  fallback_url: s.fallback_url ?? '',
  status_callback: s.status_callback ?? '',
  sticky_sender: s.sticky_sender ?? false,
  smart_encoding: s.smart_encoding ?? false,
  area_code_geomatch: s.area_code_geomatch ?? false,
  validity_period: s.validity_period ?? 14400,
  date_created: s.date_created ?? '',
  date_updated: s.date_updated ?? '',
});

// --- Verify Services ---

export const verifyServiceSchema = z.object({
  sid: z.string().describe('Verify Service SID (VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  friendly_name: z.string().describe('Friendly name'),
  code_length: z.number().describe('Length of the verification code'),
  lookup_enabled: z.boolean().describe('Whether lookup is enabled'),
  do_not_share_warning_enabled: z.boolean().describe('Whether do-not-share warning is enabled'),
  push_enabled: z.boolean().describe('Whether push verification is enabled'),
  totp_enabled: z.boolean().describe('Whether TOTP is enabled'),
  date_created: z.string().describe('Creation date'),
  date_updated: z.string().describe('Last update date'),
});

export interface RawVerifyService {
  sid?: string;
  friendly_name?: string;
  code_length?: number;
  lookup_enabled?: boolean;
  do_not_share_warning_enabled?: boolean;
  push_enabled?: boolean;
  totp_enabled?: boolean;
  date_created?: string;
  date_updated?: string;
}

export const mapVerifyService = (s: RawVerifyService) => ({
  sid: s.sid ?? '',
  friendly_name: s.friendly_name ?? '',
  code_length: s.code_length ?? 6,
  lookup_enabled: s.lookup_enabled ?? false,
  do_not_share_warning_enabled: s.do_not_share_warning_enabled ?? false,
  push_enabled: s.push_enabled ?? false,
  totp_enabled: s.totp_enabled ?? false,
  date_created: s.date_created ?? '',
  date_updated: s.date_updated ?? '',
});

// --- Alerts ---

export const alertSchema = z.object({
  sid: z.string().describe('Alert SID'),
  error_code: z.string().describe('Error code'),
  log_level: z.string().describe('Log level (warning, error)'),
  alert_text: z.string().describe('Alert text'),
  resource_sid: z.string().describe('Resource SID that triggered the alert'),
  request_url: z.string().describe('URL of the request that triggered the alert'),
  request_method: z.string().describe('HTTP method of the triggering request'),
  date_created: z.string().describe('Creation date'),
  date_updated: z.string().describe('Last update date'),
});

export interface RawAlert {
  sid?: string;
  error_code?: string;
  log_level?: string;
  alert_text?: string;
  resource_sid?: string;
  request_url?: string;
  request_method?: string;
  date_created?: string;
  date_updated?: string;
}

export const mapAlert = (a: RawAlert) => ({
  sid: a.sid ?? '',
  error_code: a.error_code ?? '',
  log_level: a.log_level ?? '',
  alert_text: a.alert_text ?? '',
  resource_sid: a.resource_sid ?? '',
  request_url: a.request_url ?? '',
  request_method: a.request_method ?? '',
  date_created: a.date_created ?? '',
  date_updated: a.date_updated ?? '',
});

// --- API Keys ---

export const apiKeySchema = z.object({
  sid: z.string().describe('API Key SID (SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  friendly_name: z.string().describe('Friendly name'),
  date_created: z.string().describe('Creation date'),
  date_updated: z.string().describe('Last update date'),
});

export interface RawApiKey {
  sid?: string;
  friendly_name?: string;
  date_created?: string;
  date_updated?: string;
}

export const mapApiKey = (k: RawApiKey) => ({
  sid: k.sid ?? '',
  friendly_name: k.friendly_name ?? '',
  date_created: k.date_created ?? '',
  date_updated: k.date_updated ?? '',
});

export const newApiKeySchema = z.object({
  sid: z.string().describe('API Key SID'),
  friendly_name: z.string().describe('Friendly name'),
  secret: z.string().describe('API key secret — only returned once at creation time'),
  date_created: z.string().describe('Creation date'),
});

export interface RawNewApiKey {
  sid?: string;
  friendly_name?: string;
  secret?: string;
  date_created?: string;
}

export const mapNewApiKey = (k: RawNewApiKey) => ({
  sid: k.sid ?? '',
  friendly_name: k.friendly_name ?? '',
  secret: k.secret ?? '',
  date_created: k.date_created ?? '',
});

// --- Applications ---

export const applicationSchema = z.object({
  sid: z.string().describe('Application SID (APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  friendly_name: z.string().describe('Friendly name'),
  voice_url: z.string().describe('URL for incoming voice requests'),
  voice_method: z.string().describe('HTTP method for voice URL'),
  voice_fallback_url: z.string().describe('Fallback URL for voice'),
  sms_url: z.string().describe('URL for incoming SMS'),
  sms_method: z.string().describe('HTTP method for SMS URL'),
  status_callback: z.string().describe('Status callback URL'),
  status_callback_method: z.string().describe('HTTP method for status callback'),
  date_created: z.string().describe('Creation date'),
  date_updated: z.string().describe('Last update date'),
});

export interface RawApplication {
  sid?: string;
  friendly_name?: string;
  voice_url?: string;
  voice_method?: string;
  voice_fallback_url?: string;
  sms_url?: string;
  sms_method?: string;
  status_callback?: string;
  status_callback_method?: string;
  date_created?: string;
  date_updated?: string;
}

export const mapApplication = (a: RawApplication) => ({
  sid: a.sid ?? '',
  friendly_name: a.friendly_name ?? '',
  voice_url: a.voice_url ?? '',
  voice_method: a.voice_method ?? 'POST',
  voice_fallback_url: a.voice_fallback_url ?? '',
  sms_url: a.sms_url ?? '',
  sms_method: a.sms_method ?? 'POST',
  status_callback: a.status_callback ?? '',
  status_callback_method: a.status_callback_method ?? 'POST',
  date_created: a.date_created ?? '',
  date_updated: a.date_updated ?? '',
});

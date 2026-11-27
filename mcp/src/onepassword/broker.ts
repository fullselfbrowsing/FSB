import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { FSB_MCP_VERSION } from '../version.js';
import {
  bestWebsiteMatch,
  defaultSchemeForHost,
  parseHostTarget,
  websiteDetails,
  websiteHosts,
  type HostTarget,
  type MatchStrength,
} from './domain-match.js';
import {
  emptyOnePasswordConfig,
  getOnePasswordConfigPath,
  isValidAccountName,
  isValidVaultId,
  isPlausibleServiceAccountToken,
  ONEPASSWORD_ACCOUNT_ENV,
  ONEPASSWORD_TOKEN_ENV,
  isVaultScope,
  readOnePasswordConfig,
  removeOnePasswordConfig,
  writeOnePasswordConfig,
  type OnePasswordConfig,
  type OnePasswordVaultScope,
} from './config.js';

/**
 * OnePasswordBroker: the only FSB component that talks to 1Password.
 *
 * It runs inside the local FSB server process (the bridge hub) and answers the
 * extension's `onepassword.*` requests. Secret values it returns go to the
 * extension over the paired loopback bridge and from there straight into page
 * fields. Nothing here is reachable from an MCP tool result: MCP tools only see
 * what the extension chooses to project (ids, titles, hosts, usernames, last4).
 *
 * Guard rails:
 *   - Only vaults in scope are read: every vault the sign-in can see except
 *     transfer and unsupported ones, or the user's allowlist when they set one.
 *   - Logins are released only for a host one of their websites matches.
 *   - Item ids are composite "<vaultId>:<itemId>" and re-checked per call.
 */

const INTEGRATION_NAME = 'FSB';
const OVERVIEW_CACHE_TTL_MS = 30_000;
// Reads with every vault in scope need the vault list; this keeps a burst of
// lookups (list, resolve, fill) from asking 1Password for it each time.
const VAULT_LIST_CACHE_TTL_MS = 30_000;
// Vault types that never hold the user's logins or cards.
const UNREADABLE_VAULT_TYPES = new Set(['transfer', 'unsupported']);
const GET_ALL_CHUNK = 25;
const MAX_LISTED_ITEMS = 500;
const MAX_IMPORT_ENTRIES = 1000;
// The extension waits at most 120s for one import request (its bridge cap).
// No new item is started after this, so the reply, and with it the list of
// what was saved, always arrives before the extension gives up.
const IMPORT_TIME_LIMIT_MS = 60_000;
const MAX_FIELD_LENGTH = 4096;

// ---------------------------------------------------------------------------
// Minimal structural view of @1password/sdk (0.5.x). Keeping it local means the
// broker compiles and tests without the SDK, and only loads it on first use.
// ---------------------------------------------------------------------------

export interface SdkWebsite { url: string; label?: string; autofillBehavior?: string }
export interface SdkField {
  id: string;
  title: string;
  sectionId?: string;
  fieldType: string;
  value: string;
  details?: { type: string; content?: Record<string, unknown> };
}
export interface SdkItemOverview {
  id: string;
  title: string;
  category: string;
  vaultId: string;
  websites?: SdkWebsite[];
  tags?: string[];
  updatedAt?: Date | string;
  state?: string;
}
export interface SdkItem extends SdkItemOverview {
  fields: SdkField[];
  notes?: string;
}
export interface SdkVaultOverview { id: string; title: string; activeItemCount?: number; vaultType?: string }
export interface SdkClient {
  items: {
    list(vaultId: string, ...filters: unknown[]): Promise<SdkItemOverview[]>;
    get(vaultId: string, itemId: string): Promise<SdkItem>;
    getAll(vaultId: string, itemIds: string[]): Promise<{ individualResponses: Array<{ content?: SdkItem; error?: unknown }> }>;
    create(params: Record<string, unknown>): Promise<SdkItem>;
  };
  vaults: {
    list(params?: Record<string, unknown>): Promise<SdkVaultOverview[]>;
  };
}
export interface SdkModule {
  createClient(config: Record<string, unknown>): Promise<SdkClient>;
  DesktopAuth: new (accountName: string) => unknown;
}

export type BrokerErrorCode =
  | 'onepassword_not_configured'
  | 'onepassword_no_vaults'
  | 'onepassword_sdk_unavailable'
  | 'onepassword_auth_failed'
  | 'onepassword_rate_limited'
  | 'onepassword_request_failed'
  | 'onepassword_save_vault_missing'
  | 'invalid_request'
  | 'credential_not_found'
  | 'credential_needs_https'
  | 'credential_domain_mismatch'
  | 'multiple_credentials'
  | 'payment_method_not_found';

export class BrokerError extends Error {
  readonly code: BrokerErrorCode;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: BrokerErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export interface LoginSummary {
  id: string;
  title: string;
  domains: string[];
  /** How each saved website matches (host, autofill rule, scheme). No secrets. */
  websites: Array<{ host: string; rule: 'site' | 'exact'; protocol: 'http' | 'https' | '' }>;
  username: string;
  /** Whether the item holds a one-time password. The code itself is never listed. */
  hasOneTimeCode: boolean;
  vaultId: string;
}

export interface ResolvedLogin {
  id: string;
  title: string;
  username: string;
  password: string;
  oneTimeCode: string;
  match: MatchStrength;
}

export interface CardSummary {
  id: string;
  title: string;
  cardBrand: string;
  last4: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYearLast2: string;
  /** Whether a billing address is saved on the card. The address is never listed. */
  hasBillingAddress: boolean;
  vaultId: string;
}

export interface ResolvedCard {
  id: string;
  title: string;
  cardBrand: string;
  last4: string;
  cardNumber: string;
  cvv: string;
  expiryMonth: string;
  expiryYear: string;
  cardholderName: string;
  billingName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
}

export interface BrokerStatus {
  /** A sign-in is set. Which vaults it may read is vaultScope's job. */
  configured: boolean;
  authKind: 'desktop' | 'service-account' | null;
  accountName: string | null;
  tokenSource: 'env' | 'config' | null;
  vaultScope: OnePasswordVaultScope;
  /** The allowlist; empty when vaultScope is 'all'. */
  vaultIds: string[];
  /** The stored choice, which may name a vault that is gone. */
  saveVaultId: string | null;
  /**
   * Where a new login would be saved: saveVaultId while it is still in scope.
   * With every vault in scope this is checked against the last vault list; a
   * server that has not listed vaults yet trusts the stored choice.
   */
  effectiveSaveVaultId: string | null;
  /** Vaults in scope, with titles once 1Password has listed them. */
  vaults: Array<{ id: string; title: string }>;
  connection: 'idle' | 'connected' | 'error';
  lastError: { code: string; message: string } | null;
}

export interface LegacyLoginRecord {
  domain: string;
  username: string;
  password: string;
  notes?: string;
  allowSubdomains?: boolean;
}

export interface LegacyCardRecord {
  nickname?: string;
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  billingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  country?: string;
}

export interface LegacyImportResult {
  logins: { imported: number; failed: number };
  cards: { imported: number; failed: number };
  importedLoginDomains: string[];
  importedCardIndexes: number[];
  /**
   * Set when the import ended partway (rate limit, expired session, or the
   * request's time limit). Entries not reached were never sent and stay in
   * the old vault.
   */
  stopped: {
    code: 'onepassword_rate_limited' | 'onepassword_auth_failed' | 'onepassword_import_time_limit';
    notAttempted: { logins: number; cards: number };
  } | null;
}

export interface OnePasswordBrokerOptions {
  loadSdk?: () => Promise<SdkModule>;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  /** Whether the 1Password app's SDK library is installed. Tests replace it. */
  ipcLibraryPresent?: () => boolean;
}

export interface VaultSummary { id: string; title: string; itemCount: number; vaultType: string }

/** Non-secret settings configure() accepts, unchecked: it validates each one. */
export interface ConfigureInput {
  authKind?: unknown;
  accountName?: unknown;
  vaultIds?: unknown;
  saveVaultId?: unknown;
  vaultScope?: unknown;
}

async function defaultLoadSdk(): Promise<SdkModule> {
  // Indirect specifier keeps TypeScript from requiring the SDK's types at build
  // time and keeps the multi-megabyte WASM core off the startup path.
  const specifier = '@1password/sdk';
  const loaded = await import(specifier) as Record<string, unknown> & { default?: Record<string, unknown> };
  const candidate = (typeof loaded.createClient === 'function' ? loaded : loaded.default) as unknown;
  if (!candidate || typeof (candidate as SdkModule).createClient !== 'function') {
    throw new Error('1Password SDK did not expose createClient');
  }
  return candidate as SdkModule;
}

export function makeItemRef(vaultId: string, itemId: string): string {
  return `${vaultId}:${itemId}`;
}

export function parseItemRef(value: unknown): { vaultId: string; itemId: string } | null {
  if (typeof value !== 'string') return null;
  const match = /^([A-Za-z0-9]{1,64}):([A-Za-z0-9]{1,64})$/.exec(value.trim());
  return match ? { vaultId: match[1], itemId: match[2] } : null;
}

function clip(value: unknown, max = MAX_FIELD_LENGTH): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function timeOf(value: Date | string | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

/** Strip anything token-shaped from an SDK error before it leaves the broker. */
export function sanitizeSdkMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return raw
    .replace(/ops_[A-Za-z0-9+/=_.-]+/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9+/=_.-]{10,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'Unknown 1Password error';
}

/**
 * Where @1password/sdk 0.5.x looks for the 1Password app's SDK library
 * (find1PasswordLibPath in dist/shared_lib_core.js, which it does not
 * export). When none is there the SDK reports only "Native library is not
 * available.", the same words it uses when the library fails to load, so the
 * broker checks these paths itself to tell "1Password is not installed" from
 * "1Password refused FSB". tests/onepassword-broker.test.js compares this list
 * with the installed SDK, so an SDK update that moves the library fails there.
 */
export function onePasswordIpcLibraryPaths(platform: string = process.platform, home: string = homedir()): string[] {
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/1Password.app/Contents/Frameworks/libop_sdk_ipc_client.dylib',
        posix.join(home, '/Applications/1Password.app/Contents/Frameworks/libop_sdk_ipc_client.dylib'),
      ];
    case 'linux':
      return [
        '/usr/bin/1password/libop_sdk_ipc_client.so',
        '/opt/1Password/libop_sdk_ipc_client.so',
        '/snap/bin/1password/libop_sdk_ipc_client.so',
      ];
    case 'win32':
      return [
        win32.join(home, '/AppData/Local/1Password/op_sdk_ipc_client.dll'),
        'C:/Program Files/1Password/app/8/op_sdk_ipc_client.dll',
        'C:/Program Files (x86)/1Password/app/8/op_sdk_ipc_client.dll',
        win32.join(home, '/AppData/Local/1Password/app/8/op_sdk_ipc_client.dll'),
      ];
    default:
      return [];
  }
}

export function isOnePasswordIpcLibraryPresent(): boolean {
  return onePasswordIpcLibraryPaths().some((candidate) => existsSync(candidate));
}

/**
 * Why a sign-in failed, for the UI. The code stays onepassword_auth_failed and
 * this detail picks the next step:
 *   app_missing     no 1Password app on this computer: offer the download.
 *   integration_off the app is installed but refused or closed the channel,
 *                   which is what it does while "Integrate with 1Password
 *                   SDKs" is off: open Settings > Developer.
 *   declined        the user said no in the approval prompt.
 *   locked          1Password is locked or the session ended.
 *   unknown         anything else; the message says what 1Password said.
 */
export type SignInFailureReason = 'app_missing' | 'integration_off' | 'declined' | 'locked' | 'unknown';

export const ONEPASSWORD_SDK_TOGGLE = 'Settings > Developer > Integrate with 1Password SDKs';

// 1Password does not document its refusal messages, so these lean toward
// matching. A wrong guess only changes which hint the user sees first.
const DECLINED_TEXT = /denied|declined|rejected|cancel/i;
const LOCKED_TEXT = /locked|session expired|unlock/i;
const INTEGRATION_OFF_TEXT = /integrat|not enabled|disabled|turn(ed)? on|refus|closed|connect|channel|\bipc\b|pipe|socket|not running|unreachable/i;
// A wrong account name is not a closed channel, even if the words overlap.
const UNKNOWN_ACCOUNT_TEXT = /no (such |matching )?account|account[^.]*\b(not found|unknown|does not exist|not recogni[sz]ed)/i;

export function signInFailureReason(
  kind: 'desktop' | 'service-account',
  message: string,
  ipcLibraryPresent: () => boolean = isOnePasswordIpcLibraryPresent,
): SignInFailureReason {
  if (kind === 'desktop' && !ipcLibraryPresent()) return 'app_missing';
  if (kind === 'desktop' && DECLINED_TEXT.test(message)) return 'declined';
  if (LOCKED_TEXT.test(message)) return 'locked';
  if (kind === 'desktop' && !UNKNOWN_ACCOUNT_TEXT.test(message) && INTEGRATION_OFF_TEXT.test(message)) {
    return 'integration_off';
  }
  return 'unknown';
}

function describeSignInFailure(reason: SignInFailureReason, message: string): string {
  switch (reason) {
    case 'app_missing':
      return `The 1Password desktop app was not found. Install it, sign in, and turn on ${ONEPASSWORD_SDK_TOGGLE}.`;
    case 'integration_off':
      // The raw text stays at the end because the reason is a best guess.
      return `The 1Password app did not let FSB connect. In 1Password, turn on ${ONEPASSWORD_SDK_TOGGLE}, then try again. 1Password said: ${message}`;
    case 'declined':
      return 'The request was declined in the 1Password app.';
    default:
      return message;
  }
}

function sessionKeyOf(config: OnePasswordConfig): string | null {
  if (!config.auth) return null;
  return config.auth.kind === 'desktop'
    ? `desktop:${config.auth.accountName}`
    : `service:${(config.auth.token || '').slice(-12)}`;
}

function isReadableVault(vault: { vaultType: string }): boolean {
  return !UNREADABLE_VAULT_TYPES.has(vault.vaultType.toLowerCase());
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object') {
    const ctor = (error as { constructor?: { name?: string } }).constructor;
    if (ctor?.name) return ctor.name;
  }
  return '';
}

function isSessionExpiry(error: unknown): boolean {
  const name = errorName(error);
  return name === 'DesktopSessionExpiredError' || name === 'AuthExpiredError';
}

function isRateLimit(error: unknown): boolean {
  return errorName(error) === 'RateLimitExceededError';
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

function fieldById(fields: SdkField[], ids: string[]): SdkField | undefined {
  return fields.find((field) => ids.includes(String(field.id || '').toLowerCase()));
}

function fieldByTitle(fields: SdkField[], pattern: RegExp, types?: string[]): SdkField | undefined {
  return fields.find((field) => pattern.test(String(field.title || ''))
    && (!types || types.includes(field.fieldType)));
}

export function extractLoginFields(item: SdkItem): { username: string; password: string; oneTimeCode: string } {
  const fields = Array.isArray(item.fields) ? item.fields : [];
  const username = fieldById(fields, ['username'])
    || fieldByTitle(fields, /^(username|user name|email|e-mail|login)$/i, ['Text', 'Email']);
  const password = fieldById(fields, ['password'])
    || fieldByTitle(fields, /^password$/i, ['Concealed']);
  const totp = fields.find((field) => field.fieldType === 'Totp');
  const otpCode = totp?.details?.type === 'Otp' && typeof totp.details.content?.code === 'string'
    ? totp.details.content.code
    : '';
  return {
    username: clip(username?.value),
    password: clip(password?.value),
    oneTimeCode: /^\d{4,10}$/.test(otpCode) ? otpCode : '',
  };
}

const BRAND_BY_TYPE: Record<string, string> = {
  visa: 'visa', mc: 'mastercard', mastercard: 'mastercard', amex: 'amex',
  'american express': 'amex', discover: 'discover', diners: 'diners',
  'diners club': 'diners', jcb: 'jcb', unionpay: 'unionpay', maestro: 'maestro',
};

export function detectCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (!digits) return 'unknown';
  if (/^4\d{12}(\d{3}){0,2}$/.test(digits)) return 'visa';
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7([01]\d{12}|20\d{12})))$/.test(digits)) return 'mastercard';
  if (/^3[47]\d{13}$/.test(digits)) return 'amex';
  if (/^(6011\d{12}|65\d{14}|64[4-9]\d{13})$/.test(digits)) return 'discover';
  if (/^(30[0-5]\d{11}|36\d{12}|38\d{12}|39\d{12})$/.test(digits)) return 'diners';
  if (/^(2131|1800|35\d{3})\d{11}$/.test(digits)) return 'jcb';
  return 'unknown';
}

export function parseExpiry(value: string): { month: string; year: string } {
  const text = String(value || '').trim();
  let month = '';
  let year = '';
  let match = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(text);
  if (match) {
    month = match[1];
    year = match[2];
  } else if ((match = /^(\d{4})(\d{2})$/.exec(text))) {
    year = match[1];
    month = match[2];
  } else if ((match = /^(\d{4})-(\d{1,2})$/.exec(text))) {
    year = match[1];
    month = match[2];
  }
  const monthNumber = Number(month);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return { month: '', year: '' };
  if (year.length === 2) year = `20${year}`;
  return { month: String(monthNumber).padStart(2, '0'), year };
}

export function extractCardFields(item: SdkItem): Omit<ResolvedCard, 'id' | 'title'> {
  const fields = Array.isArray(item.fields) ? item.fields : [];
  const numberField = fields.find((field) => field.fieldType === 'CreditCardNumber')
    || fieldById(fields, ['ccnum', 'number']);
  const cardNumber = clip(numberField?.value).replace(/\D/g, '');
  const typeField = fields.find((field) => field.fieldType === 'CreditCardType') || fieldById(fields, ['type']);
  const typedBrand = BRAND_BY_TYPE[String(typeField?.value || '').trim().toLowerCase()] || '';
  const cvvField = fieldById(fields, ['cvv'])
    || fieldByTitle(fields, /verification|cvv|cvc|security code/i, ['Concealed', 'Text']);
  const expiryField = fieldById(fields, ['expiry'])
    || fields.find((field) => field.fieldType === 'MonthYear' && /expir/i.test(field.title || ''))
    || fields.find((field) => field.fieldType === 'MonthYear' && !/valid/i.test(field.title || ''));
  const holderField = fieldById(fields, ['cardholder'])
    || fieldByTitle(fields, /cardholder|name on card/i, ['Text']);
  const addressField = fields.find((field) => field.fieldType === 'Address');
  const address = (addressField?.details?.type === 'Address' ? addressField.details.content : undefined) || {};
  const expiry = parseExpiry(clip(expiryField?.value, 32));
  const cardholderName = clip(holderField?.value, 200).trim();

  return {
    cardBrand: typedBrand || detectCardBrand(cardNumber),
    last4: cardNumber.slice(-4),
    cardNumber,
    cvv: clip(cvvField?.value, 8).replace(/\D/g, '').slice(0, 4),
    expiryMonth: expiry.month,
    expiryYear: expiry.year,
    cardholderName,
    billingName: cardholderName,
    addressLine1: clip(address.street, 300).trim(),
    addressLine2: '',
    city: clip(address.city, 200).trim(),
    stateRegion: clip(address.state, 200).trim(),
    postalCode: clip(address.zip, 32).trim(),
    country: clip(address.country, 100).trim(),
  };
}

// ---------------------------------------------------------------------------
// Broker
// ---------------------------------------------------------------------------

export class OnePasswordBroker {
  private readonly loadSdk: () => Promise<SdkModule>;
  private readonly configPath: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => number;
  private readonly ipcLibraryPresent: () => boolean;
  private sdk: SdkModule | null = null;
  private client: Promise<SdkClient> | null = null;
  private clientKey: string | null = null;
  /** The signed-in client once its sign-in finished, so checks can skip waiting on one. */
  private liveClient: SdkClient | null = null;
  private connection: BrokerStatus['connection'] = 'idle';
  private lastError: BrokerStatus['lastError'] = null;
  private vaultTitles = new Map<string, string>();
  private overviewCache = new Map<string, { at: number; items: SdkItemOverview[] }>();
  /** The last vault list 1Password returned, and for which sign-in. */
  private vaultList: { key: string; at: number; vaults: VaultSummary[] } | null = null;
  /** configure() calls run one at a time, in the order they arrived. */
  private configureQueue: Promise<unknown> = Promise.resolve();

  constructor(options: OnePasswordBrokerOptions = {}) {
    this.loadSdk = options.loadSdk ?? defaultLoadSdk;
    this.configPath = options.configPath ?? getOnePasswordConfigPath();
    this.env = options.env ?? process.env;
    this.now = options.now ?? Date.now;
    this.ipcLibraryPresent = options.ipcLibraryPresent ?? isOnePasswordIpcLibraryPresent;
  }

  // ----- configuration ------------------------------------------------------

  readConfig(): OnePasswordConfig {
    return this.withEnvironment(readOnePasswordConfig(this.configPath) ?? emptyOnePasswordConfig(0));
  }

  /** A stored config with the sign-in the environment supplies, if any. */
  private withEnvironment(stored: OnePasswordConfig): OnePasswordConfig {
    const envAccount = this.env[ONEPASSWORD_ACCOUNT_ENV];
    const envToken = this.env[ONEPASSWORD_TOKEN_ENV];
    if (isPlausibleServiceAccountToken(envToken)) {
      return { ...stored, auth: { kind: 'service-account', token: envToken.trim() } };
    }
    if (!stored.auth && isValidAccountName(envAccount)) {
      return { ...stored, auth: { kind: 'desktop', accountName: envAccount.trim() } };
    }
    return stored;
  }

  private tokenSource(): BrokerStatus['tokenSource'] {
    if (isPlausibleServiceAccountToken(this.env[ONEPASSWORD_TOKEN_ENV])) return 'env';
    const stored = readOnePasswordConfig(this.configPath);
    return stored?.auth?.kind === 'service-account' && stored.auth.token ? 'config' : null;
  }

  private authReady(config: OnePasswordConfig): boolean {
    if (!config.auth) return false;
    if (config.auth.kind === 'desktop') return isValidAccountName(config.auth.accountName);
    return isPlausibleServiceAccountToken(config.auth.token);
  }

  status(): BrokerStatus {
    const config = this.readConfig();
    const listed = this.lastVaultList(config);
    const readable = listed ? listed.filter(isReadableVault) : null;
    return {
      configured: this.authReady(config),
      authKind: config.auth?.kind ?? null,
      accountName: config.auth?.kind === 'desktop' ? config.auth.accountName : null,
      tokenSource: config.auth?.kind === 'service-account' ? this.tokenSource() : null,
      vaultScope: config.vaultScope,
      vaultIds: [...config.vaultIds],
      saveVaultId: config.saveVaultId,
      effectiveSaveVaultId: this.effectiveSaveVaultId(config, readable ? readable.map((vault) => vault.id) : null),
      vaults: config.vaultScope === 'all'
        ? (readable ?? []).map((vault) => ({ id: vault.id, title: vault.title }))
        : config.vaultIds.map((id) => ({ id, title: this.vaultTitles.get(id) ?? '' })),
      connection: this.connection,
      lastError: this.lastError,
    };
  }

  /**
   * The save vault while it is still in scope. `readableIds` is the vault
   * list for scope 'all', or null when this server has not listed vaults yet
   * (the stored choice is then trusted and checked again on use).
   */
  private effectiveSaveVaultId(config: OnePasswordConfig, readableIds: string[] | null): string | null {
    const id = config.saveVaultId;
    if (!id) return null;
    if (config.vaultScope === 'listed') return config.vaultIds.includes(id) ? id : null;
    return readableIds && !readableIds.includes(id) ? null : id;
  }

  /**
   * Update non-secret settings. Service-account tokens are deliberately not
   * accepted here: they are set from the CLI or the environment only.
   *
   * Vault scope: a non-empty vaultIds limits FSB to those vaults ('listed');
   * vaultScope 'all' clears the list. A sign-in to a different desktop account
   * starts over with every vault in scope and the Personal vault as the save
   * vault, because vault ids belong to one account.
   */
  async configure(input: ConfigureInput): Promise<BrokerStatus> {
    // Extension requests are dispatched without waiting for the one before,
    // so two changes can overlap. Run them in turn.
    const run = this.configureQueue.then(() => this.configureNow(input));
    this.configureQueue = run.catch(() => undefined);
    return run;
  }

  private async configureNow(input: ConfigureInput): Promise<BrokerStatus> {
    // Checking a save vault against every vault may wait on 1Password. That
    // wait happens on a draft. What is written is rebuilt from a fresh read
    // with no wait in between, so a change saved meanwhile by another process
    // (a vault limit from the CLI, say) is not written over.
    const draft = this.configured(this.readStoredConfig(), input, null);
    const visible = this.checksSaveVaultAgainstVisible(draft, input)
      ? await this.visibleVaultIdsNow(this.withEnvironment(draft))
      : null;
    const stored = this.readStoredConfig();
    let next = this.configured(stored, input, visible);
    // That vault list belongs to the sign-in it was read for. If the sign-in
    // changed meanwhile, the choice is trusted and checked again on use.
    if (visible && sessionKeyOf(this.withEnvironment(next)) !== sessionKeyOf(this.withEnvironment(draft))) {
      next = this.configured(stored, input, null);
    }

    writeOnePasswordConfig(next, this.configPath);
    // Vault settings change what is read, not who signs in, so the session
    // (and the user's approval of it) survives them.
    if (sessionKeyOf(this.withEnvironment(stored)) !== sessionKeyOf(this.withEnvironment(next))) {
      this.resetClient();
    }
    return this.status();
  }

  private readStoredConfig(): OnePasswordConfig {
    return readOnePasswordConfig(this.configPath) ?? emptyOnePasswordConfig();
  }

  /** A save vault chosen while every vault is in scope is checked against 1Password's list. */
  private checksSaveVaultAgainstVisible(next: OnePasswordConfig, input: ConfigureInput): boolean {
    return typeof input.saveVaultId === 'string' && input.saveVaultId !== '' && next.vaultScope !== 'listed';
  }

  /**
   * The config `input` makes of `stored`, without reading or writing
   * anything. `visible` is the readable vault list for the sign-in, or null
   * to accept a save vault and check it on use.
   */
  private configured(stored: OnePasswordConfig, input: ConfigureInput, visible: string[] | null): OnePasswordConfig {
    const next: OnePasswordConfig = { ...stored, vaultIds: [...stored.vaultIds], updatedAt: this.now() };

    if (input.authKind === 'desktop') {
      if (!isValidAccountName(input.accountName)) {
        throw new BrokerError('invalid_request', 'Enter the 1Password account name shown in the desktop app sidebar');
      }
      const accountName = input.accountName.trim();
      const sameAccount = stored.auth?.kind === 'desktop' && stored.auth.accountName === accountName;
      next.auth = { kind: 'desktop', accountName };
      if (!sameAccount) {
        next.vaultScope = 'all';
        next.vaultIds = [];
        next.saveVaultId = null;
        next.pickPersonalSaveVault = true;
      }
    } else if (input.authKind === 'service-account') {
      const token = stored.auth?.kind === 'service-account' ? stored.auth.token : null;
      next.auth = { kind: 'service-account', token };
    } else if (input.authKind !== undefined) {
      throw new BrokerError('invalid_request', 'Unknown 1Password sign-in method');
    }

    if (input.vaultScope !== undefined && !isVaultScope(input.vaultScope)) {
      throw new BrokerError('invalid_request', 'Unknown 1Password vault scope');
    }
    if (input.vaultIds !== undefined) {
      if (!Array.isArray(input.vaultIds) || !input.vaultIds.every(isValidVaultId)) {
        throw new BrokerError('invalid_request', 'Vault ids are invalid');
      }
      const ids = [...new Set(input.vaultIds as string[])].slice(0, 32);
      if (ids.length > 0 && input.vaultScope === 'all') {
        throw new BrokerError('invalid_request', 'Choose every vault or a list of vaults, not both');
      }
      next.vaultIds = ids;
      if (ids.length > 0) next.vaultScope = 'listed';
    }
    if (input.vaultScope === 'all') {
      next.vaultScope = 'all';
      next.vaultIds = [];
    } else if (input.vaultScope === 'listed') {
      next.vaultScope = 'listed';
    }

    if (input.saveVaultId !== undefined) {
      next.pickPersonalSaveVault = false;
      if (input.saveVaultId === null || input.saveVaultId === '') {
        next.saveVaultId = null;
      } else if (!isValidVaultId(input.saveVaultId)) {
        throw new BrokerError('invalid_request', 'Vault ids are invalid');
      } else if (next.vaultScope === 'listed') {
        if (!next.vaultIds.includes(input.saveVaultId)) {
          throw new BrokerError('invalid_request', 'The save vault must be one of the allowed vaults');
        }
        next.saveVaultId = input.saveVaultId;
      } else {
        if (visible && !visible.includes(input.saveVaultId)) {
          throw new BrokerError('invalid_request', 'The save vault must be a vault this 1Password sign-in can use');
        }
        next.saveVaultId = input.saveVaultId;
      }
    }
    if (next.vaultScope === 'listed' && next.saveVaultId && !next.vaultIds.includes(next.saveVaultId)) {
      next.saveVaultId = null;
    }
    return next;
  }

  /** Store a service-account token (CLI only). */
  setServiceAccountToken(token: string, vaultIds?: string[]): void {
    if (!isPlausibleServiceAccountToken(token)) {
      throw new BrokerError('invalid_request', 'That does not look like a 1Password service account token');
    }
    const stored = readOnePasswordConfig(this.configPath) ?? emptyOnePasswordConfig();
    const next: OnePasswordConfig = {
      ...stored,
      auth: { kind: 'service-account', token: token.trim() },
      updatedAt: this.now(),
    };
    if (vaultIds) {
      next.vaultIds = vaultIds.filter(isValidVaultId);
      if (next.vaultIds.length > 0) next.vaultScope = 'listed';
    }
    writeOnePasswordConfig(next, this.configPath);
    this.resetClient();
  }

  disconnect(forget: boolean): BrokerStatus {
    this.resetClient();
    if (forget) removeOnePasswordConfig(this.configPath);
    this.connection = 'idle';
    this.lastError = null;
    return this.status();
  }

  private resetClient(): void {
    this.client = null;
    this.clientKey = null;
    this.liveClient = null;
    this.overviewCache.clear();
    this.vaultList = null;
  }

  // ----- client lifecycle ---------------------------------------------------

  /** The shared sign-in for this config, started if none is running. */
  private session(config: OnePasswordConfig): Promise<SdkClient> {
    const key = sessionKeyOf(config);
    if (!this.authReady(config) || !config.auth || !key) {
      return Promise.reject(new BrokerError('onepassword_not_configured', 'Log in to 1Password on the Vault page in FSB first'));
    }
    if (this.client && this.clientKey === key) return this.client;

    // Stored before the first await, so requests that arrive while the SDK
    // loads or the user approves FSB share this one sign-in instead of each
    // opening their own (two approval prompts in the desktop app).
    const pending = this.connect(config.auth);
    this.clientKey = key;
    this.client = pending;
    // A failed sign-in is not reused. Callers still see the rejection.
    pending.then(
      (client) => { if (this.client === pending) this.liveClient = client; },
      () => this.dropSession(pending),
    );
    return pending;
  }

  /**
   * Forget one sign-in. Another request may already have replaced it with a
   * fresh one (after the same session expiry, say); that one stays and is
   * shared, so the desktop app asks for approval once.
   */
  private dropSession(session: Promise<SdkClient>): void {
    if (this.client === session) this.resetClient();
  }

  private async connect(auth: NonNullable<OnePasswordConfig['auth']>): Promise<SdkClient> {
    if (!this.sdk) {
      try {
        this.sdk = await this.loadSdk();
      } catch (error) {
        this.noteError('onepassword_sdk_unavailable', sanitizeSdkMessage(error));
        throw new BrokerError('onepassword_sdk_unavailable', 'The 1Password SDK is not available in this FSB server install');
      }
    }
    const sdk = this.sdk;
    try {
      const client = await sdk.createClient({
        auth: auth.kind === 'desktop' ? new sdk.DesktopAuth(auth.accountName) : auth.token,
        integrationName: INTEGRATION_NAME,
        integrationVersion: `v${FSB_MCP_VERSION}`,
      });
      this.connection = 'connected';
      this.lastError = null;
      return client;
    } catch (error) {
      const raw = sanitizeSdkMessage(error);
      const reason = signInFailureReason(auth.kind, raw, this.ipcLibraryPresent);
      const message = describeSignInFailure(reason, raw);
      this.noteError('onepassword_auth_failed', message);
      throw new BrokerError('onepassword_auth_failed', `1Password sign-in failed: ${message}`, { reason });
    }
  }

  private noteError(code: string, message: string): void {
    this.connection = 'error';
    this.lastError = { code, message };
  }

  /**
   * Run fn with a signed-in client. `retire` drops the sign-in fn was given
   * (and only that one), for callers that end early on an expired session.
   */
  private async withClient<T>(
    fn: (client: SdkClient, config: OnePasswordConfig, retire: () => void) => Promise<T>,
  ): Promise<T> {
    const config = this.readConfig();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = this.session(config);
      const client = await session;
      const retire = (): void => this.dropSession(session);
      try {
        return await fn(client, config, retire);
      } catch (error) {
        if (error instanceof BrokerError) throw error;
        if (isSessionExpiry(error) && attempt === 0) {
          retire();
          continue;
        }
        if (isRateLimit(error)) {
          this.noteError('onepassword_rate_limited', 'Rate limited by 1Password');
          throw new BrokerError('onepassword_rate_limited', '1Password rate limit reached. Try again shortly.');
        }
        const message = sanitizeSdkMessage(error);
        this.noteError('onepassword_request_failed', message);
        throw new BrokerError('onepassword_request_failed', `1Password request failed: ${message}`);
      }
    }
    throw new BrokerError('onepassword_auth_failed', '1Password session expired', { reason: 'locked' });
  }

  // ----- vaults in scope ----------------------------------------------------

  /** Ask 1Password for the vault list and remember it for this sign-in. */
  private async fetchVaults(client: SdkClient, config: OnePasswordConfig): Promise<VaultSummary[]> {
    const vaults = await client.vaults.list({ decryptDetails: true });
    const list = (Array.isArray(vaults) ? vaults : []).map((vault) => ({
      id: String(vault.id),
      title: clip(vault.title, 200),
      itemCount: Number.isFinite(vault.activeItemCount) ? Number(vault.activeItemCount) : 0,
      // personal, everyone, transfer, userCreated: tells the UI which vault
      // is the user's own and which are shared before access is granted.
      vaultType: typeof vault.vaultType === 'string' ? clip(vault.vaultType, 40) : '',
    })).filter((vault) => isValidVaultId(vault.id));
    for (const vault of list) this.vaultTitles.set(vault.id, vault.title);
    const key = sessionKeyOf(config);
    if (key) this.vaultList = { key, at: this.now(), vaults: list };
    return list;
  }

  /** The last vault list for this config's sign-in, however old. */
  private lastVaultList(config: OnePasswordConfig): VaultSummary[] | null {
    const key = sessionKeyOf(config);
    return key && this.vaultList?.key === key ? this.vaultList.vaults : null;
  }

  /**
   * The vault ids FSB reads for this config: the allowlist, or with every
   * vault in scope each vault 1Password lists except transfer and unsupported
   * ones. May set the save vault (see adoptPersonalSaveVault).
   */
  private async vaultsFor(client: SdkClient, config: OnePasswordConfig): Promise<string[]> {
    if (config.vaultScope === 'listed') {
      if (config.vaultIds.length === 0) {
        throw new BrokerError('onepassword_no_vaults', 'Choose which 1Password vaults FSB may use');
      }
      return config.vaultIds;
    }
    const cached = this.vaultList;
    const list = cached && cached.key === sessionKeyOf(config) && this.now() - cached.at < VAULT_LIST_CACHE_TTL_MS
      ? cached.vaults
      : await this.fetchVaults(client, config);
    this.adoptPersonalSaveVault(config, list);
    const ids = list.filter(isReadableVault).map((vault) => vault.id);
    if (ids.length === 0) {
      throw new BrokerError('onepassword_no_vaults', 'This 1Password sign-in has no vault FSB can read');
    }
    return ids;
  }

  /**
   * After a new desktop sign-in with every vault in scope, the first vault
   * list sets the save vault to the user's Personal vault, once. With no
   * Personal vault (a service account, or a business policy) it stays unset
   * and the settings page asks. `config` is the caller's own copy and is
   * updated so the rest of the request sees the choice.
   */
  private adoptPersonalSaveVault(config: OnePasswordConfig, vaults: VaultSummary[]): void {
    if (config.vaultScope !== 'all' || config.saveVaultId || !config.pickPersonalSaveVault) return;
    try {
      const stored = readOnePasswordConfig(this.configPath) ?? emptyOnePasswordConfig(this.now());
      const current = this.withEnvironment(stored);
      // The settings changed since this request started: leave them alone.
      if (current.vaultScope !== 'all' || !current.pickPersonalSaveVault
        || sessionKeyOf(current) !== sessionKeyOf(config)) {
        config.pickPersonalSaveVault = false;
        if (current.saveVaultId && sessionKeyOf(current) === sessionKeyOf(config)) config.saveVaultId = current.saveVaultId;
        return;
      }
      const personal = vaults.find((vault) => vault.vaultType.toLowerCase() === 'personal');
      writeOnePasswordConfig({
        ...stored,
        saveVaultId: personal ? personal.id : null,
        pickPersonalSaveVault: false,
        updatedAt: this.now(),
      }, this.configPath);
      config.saveVaultId = personal ? personal.id : null;
      config.pickPersonalSaveVault = false;
    } catch {
      // Not saved; the next vault list tries again.
    }
  }

  /**
   * Vault ids to check a save-vault choice against, without starting a
   * sign-in or waiting on one: the cached list, or a fresh one from a client
   * that is already signed in for this config. Null means "cannot tell now";
   * the choice is then checked again when something is saved.
   */
  private async visibleVaultIdsNow(config: OnePasswordConfig): Promise<string[] | null> {
    const key = sessionKeyOf(config);
    if (!key) return null;
    const cached = this.vaultList;
    if (cached && cached.key === key && this.now() - cached.at < VAULT_LIST_CACHE_TTL_MS) {
      return cached.vaults.filter(isReadableVault).map((vault) => vault.id);
    }
    if (!this.liveClient || this.clientKey !== key) return null;
    try {
      return (await this.fetchVaults(this.liveClient, config)).filter(isReadableVault).map((vault) => vault.id);
    } catch {
      return null;
    }
  }

  private requireAllowedRef(vaultIds: string[], ref: unknown): { vaultId: string; itemId: string } {
    const parsed = parseItemRef(ref);
    if (!parsed || !vaultIds.includes(parsed.vaultId)) {
      throw new BrokerError('invalid_request', 'Unknown item id');
    }
    return parsed;
  }

  private async overviews(client: SdkClient, vaultId: string): Promise<SdkItemOverview[]> {
    const cached = this.overviewCache.get(vaultId);
    if (cached && this.now() - cached.at < OVERVIEW_CACHE_TTL_MS) return cached.items;
    const items = await client.items.list(vaultId);
    const active = (Array.isArray(items) ? items : []).filter((item) => !item.state || item.state === 'active');
    this.overviewCache.set(vaultId, { at: this.now(), items: active });
    return active;
  }

  private async getMany(client: SdkClient, vaultId: string, ids: string[]): Promise<SdkItem[]> {
    const out: SdkItem[] = [];
    for (let index = 0; index < ids.length; index += GET_ALL_CHUNK) {
      const chunk = ids.slice(index, index + GET_ALL_CHUNK);
      const response = await client.items.getAll(vaultId, chunk);
      for (const entry of response?.individualResponses ?? []) {
        if (entry?.content) out.push(entry.content);
      }
    }
    return out;
  }

  // ----- operations ---------------------------------------------------------

  /** Every vault the sign-in can see, in scope or not, for the settings page. */
  async listVaults(): Promise<VaultSummary[]> {
    return this.withClient(async (client, config) => {
      const list = await this.fetchVaults(client, config);
      this.adoptPersonalSaveVault(config, list);
      return list;
    });
  }

  async listLogins(): Promise<LoginSummary[]> {
    return this.withClient(async (client, config) => {
      const results: LoginSummary[] = [];
      for (const vaultId of await this.vaultsFor(client, config)) {
        const logins = (await this.overviews(client, vaultId)).filter((item) => item.category === 'Login');
        const items = await this.getMany(client, vaultId, logins.slice(0, MAX_LISTED_ITEMS).map((item) => item.id));
        for (const item of items) {
          results.push({
            id: makeItemRef(vaultId, item.id),
            title: clip(item.title, 200),
            domains: websiteHosts(item.websites),
            websites: websiteDetails(item.websites),
            username: extractLoginFields(item).username.slice(0, 320),
            hasOneTimeCode: Array.isArray(item.fields) && item.fields.some((field) => field && field.fieldType === 'Totp'),
            vaultId,
          });
          if (results.length >= MAX_LISTED_ITEMS) return results;
        }
      }
      return results;
    });
  }

  /**
   * Find the login for a page. With an itemId the item must still match the
   * host; without one the best match wins unless `requireUnique` is set and
   * several logins match, in which case the candidates (no secrets) come back.
   */
  async resolveLogin(input: { url: unknown; itemId?: unknown; requireUnique?: boolean }): Promise<ResolvedLogin> {
    const target = parseHostTarget(input.url);
    if (!target) throw new BrokerError('invalid_request', 'A page URL is required');
    return this.withClient(async (client, config) => {
      const vaults = await this.vaultsFor(client, config);
      const requested = input.itemId !== undefined && input.itemId !== null && input.itemId !== ''
        ? this.requireAllowedRef(vaults, input.itemId)
        : null;

      const candidates: Array<{ overview: SdkItemOverview; vaultId: string; match: MatchStrength }> = [];
      for (const vaultId of vaults) {
        if (requested && requested.vaultId !== vaultId) continue;
        for (const overview of await this.overviews(client, vaultId)) {
          if (overview.category !== 'Login') continue;
          if (requested && overview.id !== requested.itemId) continue;
          const match = bestWebsiteMatch(overview.websites, target);
          if (match) candidates.push({ overview, vaultId, match });
        }
      }

      if (candidates.length === 0) {
        // An https login exists for this host but the page is plain http: a
        // refusal on purpose, with its own code, so FSB never offers to type
        // a login there instead.
        if (!requested && target.protocol === 'http:') {
          const secureTarget: HostTarget = { ...target, protocol: 'https:' };
          for (const vaultId of vaults) {
            for (const overview of await this.overviews(client, vaultId)) {
              if (overview.category === 'Login' && bestWebsiteMatch(overview.websites, secureTarget)) {
                throw new BrokerError('credential_needs_https', `A 1Password login is saved for https://${target.hostname}, and FSB never fills it on an http:// page`);
              }
            }
          }
        }
        // On a plain-http page, say why an https login that exists was withheld.
        const httpNote = target.protocol === 'http:'
          ? ' on this http:// page. Logins saved for https:// websites are never filled on http:// pages'
          : '';
        if (requested) {
          throw new BrokerError('credential_domain_mismatch', `That 1Password item is not saved for ${target.hostname}${httpNote}`);
        }
        throw new BrokerError('credential_not_found', `No 1Password login is saved for ${target.hostname}${httpNote}`);
      }

      candidates.sort((a, b) => {
        if (a.match !== b.match) return a.match === 'exact' ? -1 : 1;
        return timeOf(b.overview.updatedAt) - timeOf(a.overview.updatedAt);
      });

      // Only the strongest tier competes: one exact-host login beats any
      // number of logins that merely share the registrable domain.
      const topTier = candidates.filter((entry) => entry.match === candidates[0].match);
      if (!requested && input.requireUnique && topTier.length > 1) {
        // The vault name tells apart copies of one login kept in two vaults
        // (a Personal and a Shared "Netflix" with the same username).
        const described: Array<{ id: string; title: string; username: string; vault: string }> = [];
        for (const vaultId of new Set(topTier.map((entry) => entry.vaultId))) {
          const ids = topTier.filter((entry) => entry.vaultId === vaultId).map((entry) => entry.overview.id);
          for (const item of await this.getMany(client, vaultId, ids.slice(0, 10))) {
            described.push({
              id: makeItemRef(vaultId, item.id),
              title: clip(item.title, 200),
              username: extractLoginFields(item).username.slice(0, 320),
              vault: this.vaultTitles.get(vaultId) ?? '',
            });
          }
        }
        throw new BrokerError(
          'multiple_credentials',
          `Several 1Password logins match ${target.hostname}. Pass credential_id to choose one.`,
          { candidates: described },
        );
      }

      const chosen = candidates[0];
      const item = await client.items.get(chosen.vaultId, chosen.overview.id);
      const fields = extractLoginFields(item);
      if (!fields.username && !fields.password && !fields.oneTimeCode) {
        throw new BrokerError('credential_not_found', 'The matching 1Password item has no username, password, or one-time code');
      }
      return {
        id: makeItemRef(chosen.vaultId, item.id),
        title: clip(item.title, 200),
        username: fields.username,
        password: fields.password,
        oneTimeCode: fields.oneTimeCode,
        match: chosen.match,
      };
    });
  }

  async listCards(): Promise<CardSummary[]> {
    return this.withClient(async (client, config) => {
      const results: CardSummary[] = [];
      for (const vaultId of await this.vaultsFor(client, config)) {
        const cards = (await this.overviews(client, vaultId)).filter((item) => item.category === 'CreditCard');
        for (const item of await this.getMany(client, vaultId, cards.slice(0, MAX_LISTED_ITEMS).map((card) => card.id))) {
          const fields = extractCardFields(item);
          results.push({
            id: makeItemRef(vaultId, item.id),
            title: clip(item.title, 200),
            cardBrand: fields.cardBrand,
            last4: fields.last4,
            cardholderName: fields.cardholderName,
            expiryMonth: fields.expiryMonth,
            expiryYearLast2: fields.expiryYear.slice(-2),
            hasBillingAddress: !!(fields.addressLine1 || fields.city || fields.postalCode || fields.country),
            vaultId,
          });
        }
      }
      return results;
    });
  }

  private async getCardItem(client: SdkClient, config: OnePasswordConfig, itemId: unknown): Promise<{
    ref: { vaultId: string; itemId: string };
    item: SdkItem;
    fields: Omit<ResolvedCard, 'id' | 'title'>;
  }> {
    const ref = this.requireAllowedRef(await this.vaultsFor(client, config), itemId);
    let item: SdkItem;
    try {
      item = await client.items.get(ref.vaultId, ref.itemId);
    } catch (error) {
      if (isSessionExpiry(error) || isRateLimit(error)) throw error;
      throw new BrokerError('payment_method_not_found', 'Payment method not found in 1Password');
    }
    if (item.category !== 'CreditCard') {
      throw new BrokerError('payment_method_not_found', 'That 1Password item is not a credit card');
    }
    const fields = extractCardFields(item);
    if (!fields.cardNumber) {
      throw new BrokerError('payment_method_not_found', 'The 1Password card has no card number');
    }
    return { ref, item, fields };
  }

  /** Card metadata for the confirmation prompt. No card number or CVV leaves here. */
  async describeCard(input: { itemId: unknown }): Promise<CardSummary> {
    return this.withClient(async (client, config) => {
      const { ref, item, fields } = await this.getCardItem(client, config, input.itemId);
      return {
        id: makeItemRef(ref.vaultId, item.id),
        title: clip(item.title, 200),
        cardBrand: fields.cardBrand,
        last4: fields.last4,
        cardholderName: fields.cardholderName,
        expiryMonth: fields.expiryMonth,
        expiryYearLast2: fields.expiryYear.slice(-2),
        hasBillingAddress: !!(fields.addressLine1 || fields.city || fields.postalCode || fields.country),
        vaultId: ref.vaultId,
      };
    });
  }

  /** Full card data. The extension calls this only after the user approves the fill. */
  async resolveCard(input: { itemId: unknown }): Promise<ResolvedCard> {
    return this.withClient(async (client, config) => {
      const { ref, item, fields } = await this.getCardItem(client, config, input.itemId);
      return { id: makeItemRef(ref.vaultId, item.id), title: clip(item.title, 200), ...fields };
    });
  }

  async saveLogin(input: { url: unknown; username: unknown; password: unknown }): Promise<{ id: string; title: string }> {
    const target = parseHostTarget(input.url);
    if (!target) throw new BrokerError('invalid_request', 'A page URL is required');
    const username = clip(input.username, 320);
    const password = clip(input.password);
    if (!username && !password) throw new BrokerError('invalid_request', 'Nothing to save');
    return this.withClient(async (client, config) => {
      const vaultId = await this.requireSaveVault(client, config);
      const created = await client.items.create(this.loginCreateParams(vaultId, {
        // Record the page's own scheme: an http page saved as https:// would
        // never be offered this login again.
        scheme: target.protocol ?? defaultSchemeForHost(target.hostname),
        domain: target.port ? `${target.hostname}:${target.port}` : target.hostname,
        username,
        password,
        allowSubdomains: true,
      }));
      this.overviewCache.delete(vaultId);
      return { id: makeItemRef(vaultId, created.id), title: clip(created.title, 200) };
    });
  }

  async importLegacy(input: { logins?: unknown; cards?: unknown }): Promise<LegacyImportResult> {
    const logins = Array.isArray(input.logins) ? input.logins.slice(0, MAX_IMPORT_ENTRIES) : [];
    const cards = Array.isArray(input.cards) ? input.cards.slice(0, MAX_IMPORT_ENTRIES) : [];
    // Measured from the request, not the callback: a sign-in wait counts too,
    // since the extension's timer is already running. A session-expiry retry
    // keeps the same start.
    const startedAt = this.now();
    const outOfTime = (): boolean => this.now() - startedAt >= IMPORT_TIME_LIMIT_MS;
    return this.withClient(async (client, config, retire) => {
      const vaultId = await this.requireSaveVault(client, config);
      const result: LegacyImportResult = {
        logins: { imported: 0, failed: 0 },
        cards: { imported: 0, failed: 0 },
        importedLoginDomains: [],
        importedCardIndexes: [],
        stopped: null,
      };
      // withClient runs this callback again after a session expiry, which is
      // safe only while nothing has been written. After the first save, an
      // expired session or a rate limit ends the import here and reports what
      // was saved, so neither the retry nor the user's next attempt creates
      // a duplicate.
      const stopImport = (error: unknown, loginsLeft: number, cardsLeft: number): boolean => {
        if (!isSessionExpiry(error) && !isRateLimit(error)) return false;
        if (result.logins.imported + result.cards.imported === 0) throw error;
        if (isRateLimit(error)) {
          this.noteError('onepassword_rate_limited', 'Rate limited by 1Password');
        } else {
          // The next request signs in again.
          retire();
        }
        result.stopped = {
          code: isRateLimit(error) ? 'onepassword_rate_limited' : 'onepassword_auth_failed',
          notAttempted: { logins: loginsLeft, cards: cardsLeft },
        };
        return true;
      };

      for (let index = 0; index < logins.length; index += 1) {
        if (outOfTime()) {
          result.stopped = {
            code: 'onepassword_import_time_limit',
            notAttempted: { logins: logins.length - index, cards: cards.length },
          };
          break;
        }
        const record = logins[index] as LegacyLoginRecord;
        const target = parseHostTarget(record?.domain);
        if (!target || (!record.username && !record.password)) {
          result.logins.failed += 1;
          continue;
        }
        try {
          await client.items.create(this.loginCreateParams(vaultId, {
            // The old vault kept hostnames only, without a scheme.
            scheme: target.protocol ?? defaultSchemeForHost(target.hostname),
            domain: target.port ? `${target.hostname}:${target.port}` : target.hostname,
            username: clip(record.username, 320),
            password: clip(record.password),
            notes: clip(record.notes, 10_000),
            allowSubdomains: record.allowSubdomains === true,
          }));
          result.logins.imported += 1;
          result.importedLoginDomains.push(String(record.domain));
        } catch (error) {
          if (stopImport(error, logins.length - index, cards.length)) break;
          result.logins.failed += 1;
        }
      }
      for (let index = 0; !result.stopped && index < cards.length; index += 1) {
        if (outOfTime()) {
          result.stopped = {
            code: 'onepassword_import_time_limit',
            notAttempted: { logins: 0, cards: cards.length - index },
          };
          break;
        }
        const record = cards[index] as LegacyCardRecord;
        const digits = clip(record?.cardNumber, 32).replace(/\D/g, '');
        if (!digits) {
          result.cards.failed += 1;
          continue;
        }
        try {
          await client.items.create(this.cardCreateParams(vaultId, record, digits));
          result.cards.imported += 1;
          result.importedCardIndexes.push(index);
        } catch (error) {
          if (stopImport(error, 0, cards.length - index)) break;
          result.cards.failed += 1;
        }
      }
      this.overviewCache.delete(vaultId);
      return result;
    });
  }

  private async requireSaveVault(client: SdkClient, config: OnePasswordConfig): Promise<string> {
    const readable = await this.vaultsFor(client, config);
    const vaultId = this.effectiveSaveVaultId(config, readable);
    if (!vaultId) {
      throw new BrokerError('onepassword_save_vault_missing', 'Choose a 1Password vault for FSB to save new items into');
    }
    return vaultId;
  }

  private loginCreateParams(vaultId: string, entry: {
    scheme: 'http:' | 'https:';
    domain: string;
    username: string;
    password: string;
    notes?: string;
    allowSubdomains: boolean;
  }): Record<string, unknown> {
    const fields: SdkField[] = [];
    if (entry.username) fields.push({ id: 'username', title: 'username', fieldType: 'Text', value: entry.username });
    if (entry.password) fields.push({ id: 'password', title: 'password', fieldType: 'Concealed', value: entry.password });
    return {
      category: 'Login',
      vaultId,
      title: entry.domain,
      fields,
      notes: entry.notes || '',
      tags: ['FSB'],
      websites: [{
        url: `${entry.scheme}//${entry.domain}`,
        label: 'website',
        autofillBehavior: entry.allowSubdomains ? 'AnywhereOnWebsite' : 'ExactDomain',
      }],
    };
  }

  private cardCreateParams(vaultId: string, record: LegacyCardRecord, digits: string): Record<string, unknown> {
    const expiry = parseExpiry(`${clip(record.expiryMonth, 4)}/${clip(record.expiryYear, 4)}`);
    const brand = detectCardBrand(digits);
    const fields: SdkField[] = [
      { id: 'cardholder', title: 'cardholder name', fieldType: 'Text', value: clip(record.cardholderName, 200) },
      { id: 'ccnum', title: 'number', fieldType: 'CreditCardNumber', value: digits },
    ];
    const cvv = clip(record.cvv, 8).replace(/\D/g, '');
    if (cvv) fields.push({ id: 'cvv', title: 'verification number', fieldType: 'Concealed', value: cvv });
    if (expiry.month && expiry.year) {
      fields.push({ id: 'expiry', title: 'expiry date', fieldType: 'MonthYear', value: `${expiry.month}/${expiry.year}` });
    }
    const billing = [
      record.billingName, record.addressLine1, record.addressLine2,
      [record.city, record.stateRegion, record.postalCode].filter(Boolean).join(' '),
      record.country,
    ].map((part) => clip(part, 300).trim()).filter(Boolean);
    const nickname = clip(record.nickname, 120).trim();
    return {
      category: 'CreditCard',
      vaultId,
      title: nickname || `${brand === 'unknown' ? 'Card' : brand.toUpperCase()} ${digits.slice(-4)}`,
      fields,
      notes: billing.length ? `Billing address (imported from FSB):\n${billing.join('\n')}` : '',
      tags: ['FSB'],
    };
  }
}

let sharedBroker: OnePasswordBroker | null = null;

/** Process-wide broker used by the bridge hub. */
export function getSharedOnePasswordBroker(): OnePasswordBroker {
  sharedBroker ??= new OnePasswordBroker();
  return sharedBroker;
}

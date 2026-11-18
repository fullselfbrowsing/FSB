import type { ExtRequest, ExtRequestHandler } from '../types.js';
import { BrokerError, getSharedOnePasswordBroker, type OnePasswordBroker } from './broker.js';

/**
 * Extension -> FSB server requests for 1Password.
 *
 * The extension is the only caller (frames arrive on the paired, origin-pinned
 * loopback socket). Responses that carry secret values go back on that socket
 * only; nothing here is wired to MCP tool output.
 */

export const ONEPASSWORD_EXT_METHOD_PREFIX = 'onepassword.';

export const ONEPASSWORD_EXT_METHODS = Object.freeze([
  'onepassword.status',
  'onepassword.configure',
  'onepassword.list-vaults',
  'onepassword.list-logins',
  'onepassword.resolve-login',
  'onepassword.list-cards',
  'onepassword.describe-card',
  'onepassword.resolve-card',
  'onepassword.save-login',
  'onepassword.import-legacy',
  'onepassword.disconnect',
] as const);

const METHOD_SET = new Set<string>(ONEPASSWORD_EXT_METHODS);

export function isOnePasswordExtMethod(method: unknown): boolean {
  return typeof method === 'string' && method.startsWith(ONEPASSWORD_EXT_METHOD_PREFIX);
}

function onlyKeys(payload: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(payload).every((key) => allowed.includes(key));
}

function fail(errorCode: string, error: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ok: false, errorCode, error, ...(extra ?? {}) };
}

export async function handleOnePasswordRequest(
  broker: OnePasswordBroker,
  request: Pick<ExtRequest, 'method' | 'payload'>,
): Promise<Record<string, unknown>> {
  const { method } = request;
  const payload = request.payload ?? {};
  if (!METHOD_SET.has(method)) return fail('invalid_request', 'Unknown 1Password request');

  try {
    switch (method) {
      case 'onepassword.status':
        return { ok: true, status: broker.status() };

      case 'onepassword.configure':
        if (!onlyKeys(payload, ['authKind', 'accountName', 'vaultIds', 'saveVaultId'])) {
          return fail('invalid_request', 'Unexpected 1Password settings');
        }
        return { ok: true, status: broker.configure(payload) };

      case 'onepassword.list-vaults':
        return { ok: true, vaults: await broker.listVaults() };

      case 'onepassword.list-logins':
        return { ok: true, logins: await broker.listLogins() };

      case 'onepassword.resolve-login':
        if (!onlyKeys(payload, ['url', 'itemId', 'requireUnique'])) {
          return fail('invalid_request', 'Unexpected login request fields');
        }
        return {
          ok: true,
          login: await broker.resolveLogin({
            url: payload.url,
            itemId: payload.itemId,
            requireUnique: payload.requireUnique === true,
          }),
        };

      case 'onepassword.list-cards':
        return { ok: true, cards: await broker.listCards() };

      case 'onepassword.describe-card':
        if (!onlyKeys(payload, ['itemId'])) return fail('invalid_request', 'Unexpected card request fields');
        return { ok: true, card: await broker.describeCard({ itemId: payload.itemId }) };

      case 'onepassword.resolve-card':
        if (!onlyKeys(payload, ['itemId'])) return fail('invalid_request', 'Unexpected card request fields');
        return { ok: true, card: await broker.resolveCard({ itemId: payload.itemId }) };

      case 'onepassword.save-login':
        if (!onlyKeys(payload, ['url', 'username', 'password'])) {
          return fail('invalid_request', 'Unexpected save request fields');
        }
        return {
          ok: true,
          saved: await broker.saveLogin({ url: payload.url, username: payload.username, password: payload.password }),
        };

      case 'onepassword.import-legacy':
        if (!onlyKeys(payload, ['logins', 'cards'])) return fail('invalid_request', 'Unexpected import fields');
        return { ok: true, result: await broker.importLegacy(payload) };

      case 'onepassword.disconnect':
        if (!onlyKeys(payload, ['forget'])) return fail('invalid_request', 'Unexpected disconnect fields');
        return { ok: true, status: broker.disconnect(payload.forget === true) };

      default:
        return fail('invalid_request', 'Unknown 1Password request');
    }
  } catch (error) {
    if (error instanceof BrokerError) {
      return fail(error.code, error.message, error.details);
    }
    return fail('onepassword_request_failed', '1Password request failed');
  }
}

/** Handler the bridge hub uses for `onepassword.*` frames. */
export function createOnePasswordExtHandler(
  getBroker: () => OnePasswordBroker = getSharedOnePasswordBroker,
): ExtRequestHandler {
  return async (request) => handleOnePasswordRequest(getBroker(), request);
}

import { BrokerError, OnePasswordBroker, type BrokerStatus } from './broker.js';
import { getOnePasswordConfigPath, isValidVaultId, ONEPASSWORD_TOKEN_ENV } from './config.js';

type FlagValue = boolean | string;

export const ONEPASSWORD_HELP = `  fsb-mcp-server onepassword                     Show the 1Password connection FSB uses
  fsb-mcp-server onepassword --desktop <account> Sign in through the 1Password desktop app
  fsb-mcp-server onepassword --service-account   Use a service account token (prompted, or ${ONEPASSWORD_TOKEN_ENV})
  fsb-mcp-server onepassword --vaults            List vaults the signed-in account can see
  fsb-mcp-server onepassword --allow <id,id>     Limit FSB to these vaults
  fsb-mcp-server onepassword --all-vaults        Let FSB use every vault again (the default)
  fsb-mcp-server onepassword --save-vault <id>   Vault where FSB saves new logins ("none" to stop saving)
  fsb-mcp-server onepassword --reset             Forget FSB's 1Password settings`;

function describeStatus(status: BrokerStatus): string {
  const lines = [`Config file: ${getOnePasswordConfigPath()}`];
  if (!status.authKind) {
    lines.push('Sign-in: not set. Use --desktop <account> or --service-account.');
  } else if (status.authKind === 'desktop') {
    lines.push(`Sign-in: 1Password desktop app (account "${status.accountName}")`);
  } else {
    lines.push(`Sign-in: service account (${status.tokenSource ? `token from ${status.tokenSource}` : 'no token stored'})`);
  }
  if (status.vaultScope === 'all') {
    lines.push('Vaults: All vaults this sign-in can see, except transfer vaults. Use --allow <id,id> to limit FSB.');
  } else if (status.vaultIds.length) {
    lines.push(`Vaults: only ${status.vaultIds.join(', ')}. Use --all-vaults to allow every vault.`);
  } else {
    lines.push('Vaults: none allowed. Run --vaults, then --allow <id>, or use --all-vaults.');
  }
  if (status.saveVaultId) {
    lines.push(`Save vault: ${status.saveVaultId}`);
  } else if (status.vaultScope === 'all' && status.authKind === 'desktop') {
    lines.push('Save vault: not set. FSB picks your Personal vault the first time it lists your vaults, or use --save-vault <id>.');
  } else {
    lines.push('Save vault: not set (FSB will not save new logins)');
  }
  lines.push(`Ready: ${status.configured ? 'yes' : 'no'}`);
  return `${lines.join('\n')}\n`;
}

async function readHiddenLine(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  process.stderr.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('Cancelled'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

function parseVaultList(value: FlagValue | undefined): string[] | null {
  if (typeof value !== 'string') return null;
  const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return ids.length > 0 && ids.every(isValidVaultId) ? ids : null;
}

export async function runOnePasswordCommand(
  flags: Record<string, FlagValue>,
  broker = new OnePasswordBroker(),
): Promise<void> {
  const json = flags.json === true;
  try {
    if (flags.reset === true) {
      const status = broker.disconnect(true);
      process.stdout.write(json ? `${JSON.stringify(status)}\n` : 'FSB 1Password settings removed.\n');
      return;
    }

    if (flags.allow !== undefined && flags['all-vaults'] !== undefined) {
      throw new BrokerError('invalid_request', 'Pass --allow <id,id> or --all-vaults, not both');
    }

    if (typeof flags.desktop === 'string') {
      await broker.configure({ authKind: 'desktop', accountName: flags.desktop });
    } else if (flags.desktop === true) {
      throw new BrokerError('invalid_request', 'Pass the account name shown at the top of the 1Password sidebar: --desktop <account>');
    }

    if (flags['service-account'] === true) {
      const fromEnv = process.env[ONEPASSWORD_TOKEN_ENV];
      const token = fromEnv && fromEnv.trim()
        ? fromEnv.trim()
        : await readHiddenLine('1Password service account token (input hidden): ');
      broker.setServiceAccountToken(token);
    }

    if (flags.allow !== undefined) {
      const ids = parseVaultList(flags.allow);
      if (!ids) throw new BrokerError('invalid_request', 'Pass vault ids separated by commas: --allow <id,id>');
      await broker.configure({ vaultIds: ids });
    }

    if (flags['all-vaults'] === true) {
      await broker.configure({ vaultScope: 'all' });
    } else if (flags['all-vaults'] !== undefined) {
      throw new BrokerError('invalid_request', '--all-vaults takes no value');
    }

    if (flags['save-vault'] !== undefined) {
      const id = typeof flags['save-vault'] === 'string' ? flags['save-vault'].trim() : '';
      await broker.configure({ saveVaultId: id === 'none' ? null : id });
    }

    if (flags.vaults === true) {
      const vaults = await broker.listVaults();
      if (json) {
        process.stdout.write(`${JSON.stringify({ vaults })}\n`);
      } else if (vaults.length === 0) {
        process.stdout.write('No vaults are visible to this 1Password sign-in.\n');
      } else {
        const status = broker.status();
        const allowed = new Set(status.vaultScope === 'all' ? status.vaults.map((vault) => vault.id) : status.vaultIds);
        for (const vault of vaults) {
          const saves = vault.id === status.effectiveSaveVaultId ? '  (new logins are saved here)' : '';
          process.stdout.write(`${allowed.has(vault.id) ? '*' : ' '} ${vault.id}  ${vault.title} (${vault.itemCount} items)${saves}\n`);
        }
        process.stdout.write(status.vaultScope === 'all'
          ? '* = used by FSB (all vaults except transfer vaults)\n'
          : '* = allowed for FSB\n');
      }
      return;
    }

    const status = broker.status();
    process.stdout.write(json ? `${JSON.stringify(status)}\n` : describeStatus(status));
  } catch (error) {
    const message = error instanceof BrokerError ? error.message : (error as Error)?.message || String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

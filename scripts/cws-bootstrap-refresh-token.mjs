#!/usr/bin/env node
// One-shot bootstrap to generate a Chrome Web Store refresh token.
//
// Reads OAuth Desktop client credentials from .secrets/cws-oauth-client.json
// (the JSON download from GCP Console). Starts a loopback HTTP listener,
// opens the Google consent URL in the browser, captures the auth code on
// redirect, exchanges it for a refresh_token, and writes the result to
// .secrets/cws-token.json.
//
// After this runs once, the refresh token never expires (unless revoked).
// Add it to GitHub Actions secret CWS_REFRESH_TOKEN along with
// CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_EXTENSION_ID.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { URL } from 'node:url';

const CLIENT_FILE = '.secrets/cws-oauth-client.json';
const TOKEN_FILE = '.secrets/cws-token.json';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const client = JSON.parse(readFileSync(CLIENT_FILE, 'utf8')).installed;
const clientId = client.client_id;
const clientSecret = client.client_secret;
if (!clientId || !clientSecret) {
  console.error('Missing client_id or client_secret in', CLIENT_FILE);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost`);
  if (u.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end(`OAuth error: ${err}`);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('No code in redirect.');
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html' }).end(
    '<h1>Got it.</h1><p>You can close this tab and return to the terminal.</p>'
  );

  const port = server.address().port;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `http://localhost:${port}`,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await tokenRes.json();
  if (!json.refresh_token) {
    console.error('No refresh_token in response. Full response:');
    console.error(JSON.stringify(json, null, 2));
    server.close();
    process.exit(1);
  }

  writeFileSync(
    TOKEN_FILE,
    JSON.stringify({
      _comment: 'Chrome Web Store OAuth refresh token. Generated ' + new Date().toISOString() + '. DO NOT commit.',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: json.refresh_token,
      scope: SCOPE,
    }, null, 2) + '\n',
    { mode: 0o600 }
  );

  console.log('\nrefresh_token saved to', TOKEN_FILE);
  console.log('\nGitHub Actions secrets to add:');
  console.log('  CWS_CLIENT_ID     =', clientId);
  console.log('  CWS_CLIENT_SECRET =', clientSecret);
  console.log('  CWS_REFRESH_TOKEN =', json.refresh_token);
  console.log('  CWS_EXTENSION_ID  = <fill once published to CWS for the first time>');
  server.close();
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  const url = authUrl.toString();

  console.log('Opening browser for consent...');
  console.log('If it does not open, paste this URL into your browser:');
  console.log(url);
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${opener} "${url}"`);
});

'use strict';

/**
 * Legacy relay sink: what is left of the Live Dashboard relay.
 *
 * The Live Dashboard was retired after FSB v0.9.95, but installs still on
 * v0.9.95 or earlier keep dialing its relay at every browser start:
 * wss://<host>/ws?key=<64 hex>&role=extension. They send a few status frames
 * when the socket opens and a JSON ping every 20 s after that, and they never
 * wait for anything back. They do dim their toolbar icon whenever the socket
 * is down, though, so refusing it would dim the icon of every such install
 * until it updates. This sink exists only to keep those sockets open and quiet
 * until then: it answers the ping with a pong and drops every other frame
 * unread. It keeps no rooms, touches no database and logs nothing per socket.
 *
 * It must never close a socket that is still talking. Those clients reset
 * their reconnect delay to zero when a socket opens, so a server that accepts
 * and then closes makes them reconnect as fast as the network allows, for as
 * long as the browser runs. The only socket the sink closes is one that has
 * sent nothing for more than 90 s, which is four missed pings: its peer is
 * gone. Every other upgrade is refused before the handshake with 410 Gone,
 * which those clients answer with their normal backoff of 1 s up to 30 s.
 *
 * /api/auth and /api/pair answer 410 Gone too, with a JSON body, because the
 * old options page calls resp.json() on whatever comes back. The one exception
 * is POST /api/auth/register. An old install with no stored key calls it before
 * it dials the relay, and retries every 30 s for as long as it gets an error.
 * So register hands out a random, throwaway key in the old response shape. The
 * key is not stored and unlocks nothing; it only lets that install open a quiet
 * sink socket like every other old install.
 *
 * Once an hour the sink logs how many sockets are open and how many upgrades
 * it accepted and refused in that hour. When the open count nears zero, the
 * old installs have updated: delete this file and its mounts in server.js.
 */

const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { isValidHashKeyFormat } = require('../utils/hash');

// Old clients put the active tab's URL in the status frame they send when the
// socket opens. A frame over maxPayload makes ws close the socket, which would
// start the reconnect loop above, so the cap stays at the relay's old 1 MiB.
const MAX_PAYLOAD_BYTES = 1024 * 1024 + 1024;
// A ping is about 40 bytes. Nothing larger is parsed.
const MAX_PING_BYTES = 128;
const IDLE_TIMEOUT_MS = 90 * 1000;
const REAP_INTERVAL_MS = 30 * 1000;
const REPORT_INTERVAL_MS = 60 * 60 * 1000;

// Sent as text: the old client parses every frame as JSON text.
const PONG = '{"type":"pong"}';
const GONE_RESPONSE = 'HTTP/1.1 410 Gone\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const RETIRED_DASHBOARD_BODY = Object.freeze({
  error: 'live_dashboard_retired',
  message: 'The Live Dashboard was retired after FSB v0.9.95.',
});

function noop() {}

function isLegacyExtensionUpgrade(req) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return false;
  }
  return url.pathname === '/ws'
    && url.searchParams.get('role') === 'extension'
    && isValidHashKeyFormat(url.searchParams.get('key'));
}

// Refused the way ws itself refuses a bad handshake: write the answer, then
// destroy the socket once it has been flushed.
function refuseUpgrade(socket) {
  socket.once('finish', () => socket.destroy());
  socket.end(GONE_RESPONSE);
}

/**
 * Take over every HTTP upgrade on `server`.
 *
 * @param {import('http').Server} server
 * @param {{ log?: { log: Function }, reportIntervalMs?: number }} [options]
 * @returns {{ wss: WebSocketServer, counts: () => object, close: () => void }}
 */
function attachLegacyRelaySink(server, options = {}) {
  const log = options.log || console;
  const reportIntervalMs = options.reportIntervalMs || REPORT_INTERVAL_MS;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const lastSeen = new WeakMap();
  let accepted = 0;
  let rejected = 0;
  let reaped = 0;

  function onUpgrade(req, socket, head) {
    // An 'error' with no listener is thrown, and would take the whole server
    // (the site, telemetry, Jev) down with it.
    socket.on('error', noop);
    if (!isLegacyExtensionUpgrade(req)) {
      rejected += 1;
      refuseUpgrade(socket);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      accepted += 1;
      const touch = () => lastSeen.set(ws, Date.now());
      touch();
      // ws reports a bad or oversized frame as an 'error' and closes that
      // socket itself; unheard, the error would crash the process.
      ws.on('error', noop);
      ws.on('ping', touch);
      ws.on('pong', touch);
      ws.on('message', (data, isBinary) => {
        touch();
        if (isBinary || data.length > MAX_PING_BYTES) return;
        try {
          const msg = JSON.parse(data.toString('utf8'));
          if (msg && msg.type === 'ping') ws.send(PONG);
        } catch {
          // Not JSON: dropped like every other frame.
        }
      });
    });
  }
  server.on('upgrade', onUpgrade);

  const reaper = setInterval(() => {
    const cutoff = Date.now() - IDLE_TIMEOUT_MS;
    for (const ws of wss.clients) {
      const seen = lastSeen.get(ws);
      if (seen !== undefined && seen < cutoff) {
        reaped += 1;
        ws.terminate();
      }
    }
  }, REAP_INTERVAL_MS);
  reaper.unref();

  const reporter = setInterval(() => {
    log.log(
      `[legacy-relay-sink] ${wss.clients.size} open sockets; in the last hour ` +
      `${accepted} upgrades accepted, ${rejected} refused, ${reaped} idle sockets closed`
    );
    accepted = 0;
    rejected = 0;
    reaped = 0;
  }, reportIntervalMs);
  reporter.unref();

  return {
    wss,
    counts() {
      return { open: wss.clients.size, accepted, rejected, reaped };
    },
    // For shutdown: stop taking upgrades. Open sockets end with the process.
    close() {
      clearInterval(reaper);
      clearInterval(reporter);
      server.removeListener('upgrade', onUpgrade);
      wss.close();
    },
  };
}

/**
 * Every method and path under its mount answers 410 Gone with a JSON body.
 * With `issueThrowawayKeys`, POST /register instead answers the way the old
 * register endpoint did, with a fresh random key that is never stored.
 */
function createRetiredDashboardRouter(options = {}) {
  const router = express.Router();
  if (options.issueThrowawayKeys) {
    router.post('/register', (req, res) => {
      res.json({ hashKey: crypto.randomBytes(32).toString('hex') });
    });
  }
  router.use((req, res) => {
    res.status(410).json(RETIRED_DASHBOARD_BODY);
  });
  return router;
}

module.exports = {
  attachLegacyRelaySink,
  createRetiredDashboardRouter,
  MAX_PAYLOAD_BYTES,
  IDLE_TIMEOUT_MS,
  RETIRED_DASHBOARD_BODY,
};

const WebSocket = require('ws');
const {
  BACKPRESSURE_BUFFER_LIMIT_BYTES,
  RELAY_PER_MESSAGE_LIMIT_BYTES,
  checkRelayFrameLimit,
  classifyRelayFrame,
  normalizeFsbRelayRole
} = require('./phantomstream-relay-compat');

const ROOM_DIAGNOSTIC_LIMIT = 100;

// Phase 276 STREAM-DEFENSIVE-06: module-level counter of frames dropped due
// to backpressure. Surfaced via getBackpressureDroppedCount() for tests and
// future observability hooks.
let backpressureDroppedCount = 0;

// Room map: hashKey -> { extensions: Set<ws>, dashboards: Set<ws> }
const rooms = new Map();
const roomDiagnostics = new Map();

function getOrCreateRoomDiagnostics(hashKey) {
  if (!roomDiagnostics.has(hashKey)) {
    roomDiagnostics.set(hashKey, {
      events: [],
      receivedByType: {},
      deliveredByType: {},
      droppedByType: {},
      lastClose: null
    });
  }

  return roomDiagnostics.get(hashKey);
}

function incrementRoomCounter(hashKey, bucket, type, amount) {
  if (!type || !amount) return;
  const diagnostics = getOrCreateRoomDiagnostics(hashKey);
  diagnostics[bucket][type] = (diagnostics[bucket][type] || 0) + amount;
}

function pushRoomDiagnosticEvent(hashKey, details) {
  const diagnostics = getOrCreateRoomDiagnostics(hashKey);
  const entry = Object.assign({ ts: Date.now() }, details || {});
  diagnostics.events.push(entry);
  if (diagnostics.events.length > ROOM_DIAGNOSTIC_LIMIT) {
    diagnostics.events.shift();
  }
  return entry;
}

function normalizeCloseReason(reason) {
  if (!reason) return '';
  if (Buffer.isBuffer(reason)) return reason.toString();
  return String(reason);
}

function recordRoomConnectionEvent(hashKey, eventName, role, closeCode, closeReason) {
  const normalizedReason = normalizeCloseReason(closeReason);
  const entry = pushRoomDiagnosticEvent(hashKey, {
    event: eventName,
    role,
    hashKey,
    closeCode: typeof closeCode === 'number' ? closeCode : null,
    closeReason: normalizedReason
  });

  if (eventName === 'closed') {
    getOrCreateRoomDiagnostics(hashKey).lastClose = {
      role,
      hashKey,
      closeCode: typeof closeCode === 'number' ? closeCode : null,
      closeReason: normalizedReason,
      ts: entry.ts
    };
  }
}

function sendToClients(hashKey, clients, data, messageType, direction) {
  const type = messageType || 'unknown';
  let targetCount = 0;
  let deliveredCount = 0;
  let droppedCount = 0;

  for (const client of clients) {
    targetCount += 1;
    if (client.readyState !== WebSocket.OPEN) {
      droppedCount += 1;
      continue;
    }

    // Phase 276 STREAM-DEFENSIVE-06: backpressure drop. If this client's send
    // buffer is already over 16 MiB, skip the send and record the drop in
    // backpressureDroppedCount. Lets a single wedged dashboard fall behind
    // without OOM'ing the Node process or starving the other clients in the
    // same room. The dashboard's existing transport-event-history surfaces
    // the lost frame on the receiver side; this counter surfaces it on the
    // relay side.
    if (typeof client.bufferedAmount === 'number'
        && client.bufferedAmount > BACKPRESSURE_BUFFER_LIMIT_BYTES) {
      backpressureDroppedCount += 1;
      droppedCount += 1;
      pushRoomDiagnosticEvent(hashKey, {
        event: 'backpressure-drop',
        direction,
        type,
        bufferedAmount: client.bufferedAmount,
        limitBytes: BACKPRESSURE_BUFFER_LIMIT_BYTES
      });
      continue;
    }

    try {
      client.send(data);
      deliveredCount += 1;
    } catch {
      droppedCount += 1;
    }
  }

  incrementRoomCounter(hashKey, 'deliveredByType', type, deliveredCount);
  incrementRoomCounter(hashKey, 'droppedByType', type, droppedCount);

  pushRoomDiagnosticEvent(hashKey, {
    event: 'relay',
    direction,
    type,
    targetCount,
    deliveredCount,
    droppedCount
  });

  if (targetCount === 0 || droppedCount > 0) {
    pushRoomDiagnosticEvent(hashKey, {
      event: 'dropped-delivery',
      direction,
      type,
      targetCount,
      deliveredCount,
      droppedCount
    });
  }

  return { targetCount, deliveredCount, droppedCount };
}

function recordMissingRoomDelivery(hashKey, messageType, direction) {
  const type = messageType || 'unknown';
  pushRoomDiagnosticEvent(hashKey, {
    event: 'relay',
    direction,
    type,
    targetCount: 0,
    deliveredCount: 0,
    droppedCount: 0
  });
  pushRoomDiagnosticEvent(hashKey, {
    event: 'dropped-delivery',
    direction,
    type,
    targetCount: 0,
    deliveredCount: 0,
    droppedCount: 0
  });
  return { targetCount: 0, deliveredCount: 0, droppedCount: 0 };
}

function getRoomDiagnostics(hashKey) {
  const diagnostics = roomDiagnostics.get(hashKey);
  if (!diagnostics) return null;
  return {
    events: diagnostics.events.slice(),
    receivedByType: Object.assign({}, diagnostics.receivedByType),
    deliveredByType: Object.assign({}, diagnostics.deliveredByType),
    droppedByType: Object.assign({}, diagnostics.droppedByType),
    lastClose: diagnostics.lastClose ? Object.assign({}, diagnostics.lastClose) : null
  };
}

/**
 * Set up WebSocket connection handling on the given WebSocketServer.
 * Called after upgrade authentication completes in server.js.
 *
 * Phase 276 / STREAM-DEFENSIVE-01 (hypothesis #1 hashKey-room mismatch):
 *
 * Pair-handshake contract:
 *   Dashboard and extension must join the SAME hashKey-keyed room before any
 *   dash: -> ext: or ext: -> dash: relay can succeed. The hashKey is the
 *   QR-pair shared secret, minted server-side via queries.validateHashKey and
 *   threaded through both upgrade handlers (server.js:241-268).
 *
 *   On every WS upgrade we log:
 *     [WS] <role> connected | hashKey=<first-8-of-key>
 *
 *   And once the client has been added to its room we log:
 *     [WS] room-state | roles=<comma-separated> hashKey=<first-8-of-key>
 *
 *   If the dashboard and extension end up in DIFFERENT rooms (different hashKey),
 *   you will see two `room-state` lines with `roles=dash` and `roles=ext`
 *   against DIFFERENT hashKey prefixes -- that is the hypothesis #1 signature.
 *   If they end up in the SAME room you will see a single line `roles=ext,dash`
 *   against ONE hashKey prefix. This is the happy-path signature for the
 *   defensive-diagnostic walk in 276-DIAGNOSTIC.md row 1.
 */
function setupWSHandler(wss) {
  wss.on('connection', (ws, request, { hashKey, role }) => {
    const keyPrefix = hashKey.substring(0, 8);
    console.log(`[WS] ${role} connected | hashKey=${keyPrefix}`);
    addClient(hashKey, ws, role);
    recordRoomConnectionEvent(hashKey, 'connected', role, null, '');
    const room = rooms.get(hashKey);
    const extCount = room ? room.extensions.size : 0;
    const dashCount = room ? room.dashboards.size : 0;
    console.log(`[WS] Room ${keyPrefix}...: ${extCount} ext, ${dashCount} dash`);

    // Phase 276 STREAM-DEFENSIVE-01: room-state line emitted on every connect so
    // DIAGNOSTIC.md row-1 verification can grep for the pair-handshake symptom.
    // When both roles are present, the line reads: roles=ext,dash. When only one
    // role is present, it reads: roles=ext or roles=dash. A hashKey-mismatch bug
    // manifests as two `room-state` lines with mismatched hashKey prefixes.
    const presentRoles = [];
    if (extCount > 0) presentRoles.push('ext');
    if (dashCount > 0) presentRoles.push('dash');
    console.log(`[WS] room-state | roles=${presentRoles.join(',')} hashKey=${keyPrefix}`);

    // Notify dashboards when extension connects
    if (role === 'extension') {
      broadcast(hashKey, 'dashboards', {
        type: 'ext:status', payload: { online: true }, ts: Date.now()
      });
    }

    // When dashboard connects, tell it if an extension is already in the room
    if (role === 'dashboard') {
      const currentRoom = rooms.get(hashKey);
      if (currentRoom && currentRoom.extensions.size > 0) {
        ws.send(JSON.stringify({
          type: 'ext:status', payload: { online: true }, ts: Date.now()
        }));
      }
    }

    ws.on('message', (data) => {
      const rawMessage = data.toString();
      const frameLimit = checkRelayFrameLimit(rawMessage, {
        roomId: hashKey,
        role: normalizeFsbRelayRole(role)
      });
      if (!frameLimit.ok) {
        incrementRoomCounter(hashKey, 'receivedByType', frameLimit.type, 1);
        incrementRoomCounter(hashKey, 'droppedByType', frameLimit.type, 1);
        pushRoomDiagnosticEvent(hashKey, Object.assign({
          event: 'message-too-large',
          role,
          hashKey
        }, frameLimit));
        console.warn(`[WS] dropped oversized frame room=${hashKey.substring(0, 8)} role=${role} type=${frameLimit.type} bytes=${frameLimit.byteSize}/${frameLimit.capBytes}`);
        return;
      }

      let msg;
      try {
        msg = JSON.parse(rawMessage);
      } catch {
        pushRoomDiagnosticEvent(hashKey, {
          event: 'malformed-json',
          role,
          hashKey
        });
        return;
      }

      const messageType = classifyRelayFrame(rawMessage).type;

      if (messageType === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return; // Do NOT relay pings
      }

      incrementRoomCounter(hashKey, 'receivedByType', messageType, 1);
      // TEMP DEBUG (Phase 212 diagnosis): log message types flowing through the relay
      // so we can see whether dash:dom-stream-start, ext:snapshot, ext:page-ready,
      // ext:dom-snapshot, ext:stream-state are firing in the expected order.
      const result = relayToRoom(hashKey, ws, rawMessage, messageType);
      console.log(`[WS] ${role}->${role === 'extension' ? 'dashboard' : 'extension'} room=${hashKey.substring(0, 8)} type=${messageType} delivered=${result?.deliveredCount || 0} dropped=${result?.droppedCount || 0}`);
    });

    ws.on('close', (closeCode, closeReason) => {
      console.log(`[WS] ${role} disconnected, hashKey: ${hashKey.substring(0, 8)}...`);
      recordRoomConnectionEvent(hashKey, 'closed', role, closeCode, closeReason);
      removeClient(hashKey, ws);
      if (role === 'extension') {
        broadcast(hashKey, 'dashboards', {
          type: 'ext:status', payload: { online: false }, ts: Date.now()
        });
      }
    });

    ws.on('error', () => {}); // Prevent unhandled error crashes; onclose fires after
  });
}

/**
 * Add a client to the appropriate room and side.
 */
function addClient(hashKey, ws, role) {
  if (!rooms.has(hashKey)) {
    rooms.set(hashKey, { extensions: new Set(), dashboards: new Set() });
  }
  const room = rooms.get(hashKey);
  const side = role === 'extension' ? 'extensions' : 'dashboards';
  room[side].add(ws);
  ws._fsbRole = role;
  ws._fsbHashKey = hashKey;
}

/**
 * Remove a client from its room. Clean up empty rooms.
 */
function removeClient(hashKey, ws) {
  const room = rooms.get(hashKey);
  if (!room) return;
  room.extensions.delete(ws);
  room.dashboards.delete(ws);
  if (room.extensions.size === 0 && room.dashboards.size === 0) {
    rooms.delete(hashKey);
  }
}

/**
 * Relay a raw message to the opposite side of the room.
 * Extension messages go to dashboards; dashboard messages go to extensions.
 */
function relayToRoom(hashKey, senderWs, rawMessage, messageType) {
  const room = rooms.get(hashKey);
  const direction = senderWs._fsbRole === 'extension'
    ? 'extension->dashboard'
    : 'dashboard->extension';
  if (!room) return recordMissingRoomDelivery(hashKey, messageType, direction);
  const targets = senderWs._fsbRole === 'extension' ? room.dashboards : room.extensions;
  return sendToClients(hashKey, targets, rawMessage, messageType, direction);
}

/**
 * Send a message object to one side of the room.
 * @param {string} hashKey - Room identifier
 * @param {'dashboards'|'extensions'} targetSide - Which side to send to
 * @param {object} messageObj - Will be JSON.stringified
 */
function broadcast(hashKey, targetSide, messageObj) {
  const room = rooms.get(hashKey);
  const direction = targetSide === 'dashboards' ? 'server->dashboard' : 'server->extension';
  if (!room) return recordMissingRoomDelivery(hashKey, messageObj && messageObj.type, direction);
  const data = JSON.stringify(messageObj);
  return sendToClients(hashKey, room[targetSide], data, messageObj && messageObj.type, direction);
}

/**
 * Broadcast a message to all dashboard clients in a room.
 * Used by agents.js for REST-triggered events (agent updates, run completions).
 */
function broadcastToRoom(hashKey, messageObj) {
  return broadcast(hashKey, 'dashboards', messageObj);
}

// Phase 276 STREAM-DEFENSIVE-06: expose the backpressure counter for tests +
// future observability. The setter is for test-only reset (tests/server-ws-backpressure.test.js).
function getBackpressureDroppedCount() { return backpressureDroppedCount; }
function _resetBackpressureDroppedCount() { backpressureDroppedCount = 0; }

module.exports = {
  setupWSHandler,
  broadcastToRoom,
  getRoomDiagnostics,
  rooms,
  // Phase 276 STREAM-DEFENSIVE-06 exports
  sendToClients,
  getBackpressureDroppedCount,
  _resetBackpressureDroppedCount,
  RELAY_PER_MESSAGE_LIMIT_BYTES,
  classifyRelayFrame,
  checkRelayFrameLimit,
  BACKPRESSURE_BUFFER_LIMIT_BYTES
};

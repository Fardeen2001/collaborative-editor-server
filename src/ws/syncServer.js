const { WebSocketServer } = require('ws');
const decoding = require('lib0/decoding');
const encoding = require('lib0/encoding');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const { verifyToken } = require('../utils/jwt');
const { getDocumentAccess } = require('../services/access.service');
const syncService = require('../services/sync.service');
const { config } = require('../config');

class TokenBucket {
  constructor(rate, capacity) {
    this.rate = rate;
    this.capacity = capacity;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function setupWSConnection(ws, documentId, userId, role) {
  const bucket = new TokenBucket(
    config.ws.maxMessagesPerSecond,
    config.ws.maxMessagesPerSecond
  );
  let closed = false;
  let room;
  let syncComplete = false;

  const roomPromise = syncService.loadDocumentState(documentId).then((r) => {
    room = r;
    return r;
  });

  const awareness = new awarenessProtocol.Awareness(
    syncService.getRoom(documentId).ydoc
  );

  const send = (encoder) => {
    if (ws.readyState === 1) {
      ws.send(encoding.toUint8Array(encoder));
    }
  };

  const broadcast = (update, origin) => {
    const wss = ws._server;
    if (!wss) return;
    wss.clients.forEach((client) => {
      if (
        client !== origin &&
        client.readyState === 1 &&
        client._docId === documentId
      ) {
        client.send(update);
      }
    });
  };

  const updateHandler = (update, origin) => {
    if (closed) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, config.yjs.messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    if (origin !== ws) {
      try {
        ws.send(message);
      } catch {
        /* ignore */
      }
    } else {
      broadcast(message, ws);
      if (role !== config.roles.viewer) {
        syncService
          .persistUpdate(documentId, update, userId, Date.now())
          .catch((err) => console.error('Persist error:', err.message));
      }
    }
  };

  roomPromise.then((r) => {
    if (closed) return;
    r.ydoc.on('update', updateHandler);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, config.yjs.messageSync);
    syncProtocol.writeSyncStep1(encoder, r.ydoc);
    send(encoder);
  });

  ws.on('message', async (data) => {
    if (closed) return;
    if (data.byteLength > config.ws.maxMessageSize) {
      ws.close(1009, 'Message too large');
      return;
    }
    if (!bucket.tryConsume()) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    try {
      await roomPromise;
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const messageType = decoding.readVarUint(decoder);

      if (messageType === config.yjs.messageSync) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, config.yjs.messageSync);
        const syncOrigin = role === config.roles.viewer ? null : ws;
        syncProtocol.readSyncMessage(decoder, encoder, room.ydoc, syncOrigin);
        if (encoding.length(encoder) > 1) {
          send(encoder);
        }
        syncComplete = true;
      } else if (messageType === config.yjs.messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          ws
        );
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, config.yjs.messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            awareness,
            Array.from(awareness.getStates().keys())
          )
        );
        broadcast(encoding.toUint8Array(encoder), ws);
      }
    } catch (err) {
      console.error('WS message error:', err.message);
      ws.close(1003, 'Invalid message');
    }
  });

  ws.on('close', () => {
    closed = true;
    if (room) {
      room.ydoc.off('update', updateHandler);
    }
    awarenessProtocol.removeAwarenessStates(
      awareness,
      [awareness.clientID],
      'disconnect'
    );
  });

  ws._docId = documentId;
  ws._isSyncComplete = () => syncComplete;
}

function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: config.ws.path,
    maxPayload: config.ws.maxMessageSize,
  });

  wss.on('connection', async (ws, req) => {
    try {
      const baseUrl = config.server.publicUrl || `http://${req.headers.host || 'localhost'}`;
      const url = new URL(req.url, baseUrl);
      const token = url.searchParams.get(config.ws.queryParams.token);
      const documentId = url.searchParams.get(config.ws.queryParams.documentId);

      if (!token || !documentId) {
        ws.close(1008, 'Missing auth');
        return;
      }

      let payload;
      try {
        payload = verifyToken(token);
      } catch {
        ws.close(1008, 'Invalid token');
        return;
      }

      const access = await getDocumentAccess(documentId, payload.userId);
      if (!access) {
        ws.close(1008, 'Access denied');
        return;
      }

      ws._server = wss;
      setupWSConnection(ws, documentId, payload.userId, access.role);
    } catch (err) {
      console.error('WS connection error:', err);
      ws.close(1011, 'Server error');
    }
  });

  return wss;
}

module.exports = { attachWebSocketServer };

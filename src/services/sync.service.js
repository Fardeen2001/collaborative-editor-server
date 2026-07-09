const Y = require('yjs');
const mongoose = require('mongoose');
const DocUpdate = require('../models/DocUpdate');
const DocSnapshot = require('../models/DocSnapshot');
const { config } = require('../config');
const { binaryByteLength, toUint8Array } = require('../utils/binary');

const rooms = new Map();

function getRoom(documentId) {
  const key = String(documentId);
  if (!rooms.has(key)) {
    rooms.set(key, { ydoc: new Y.Doc(), loaded: false, updateCount: 0 });
  }
  return rooms.get(key);
}

async function loadDocumentState(documentId) {
  const room = getRoom(documentId);
  if (room.loaded) return room;

  const docId = new mongoose.Types.ObjectId(String(documentId));

  const latestSnapshot = await DocSnapshot.findOne({ documentId: docId })
    .sort({ createdAt: -1 })
    .lean();

  if (binaryByteLength(latestSnapshot?.yjsState) > 0) {
    Y.applyUpdate(room.ydoc, toUint8Array(latestSnapshot.yjsState));
  }

  const filter = { documentId: docId };
  if (latestSnapshot) {
    filter.createdAt = { $gt: latestSnapshot.createdAt };
  }

  const updates = await DocUpdate.find(filter).sort({ createdAt: 1 }).lean();
  for (const row of updates) {
    if (binaryByteLength(row.update) > 0) {
      Y.applyUpdate(room.ydoc, toUint8Array(row.update));
    }
  }

  room.updateCount = await DocUpdate.countDocuments({ documentId: docId });
  room.loaded = true;
  return room;
}

async function persistUpdate(documentId, update, clientId, seq) {
  if (!update || update.byteLength === 0) return;
  if (update.byteLength > config.sync.maxUpdateSize) {
    throw new Error('Update exceeds maximum allowed size');
  }

  const docId = new mongoose.Types.ObjectId(String(documentId));
  const count = await DocUpdate.countDocuments({ documentId: docId });
  if (count >= config.sync.maxDocUpdates) {
    throw new Error('Document update log limit reached');
  }

  await DocUpdate.create({
    documentId: docId,
    update: Buffer.from(update),
    clientId: String(clientId),
    seq: Number(seq) || 0,
  });

  const room = getRoom(documentId);
  room.updateCount += 1;

  if (room.updateCount % config.sync.snapshotInterval === 0) {
    await createSnapshot(documentId, null, config.defaults.autoSnapshotLabel);
  }
}

async function createSnapshot(documentId, userId, label) {
  const room = await loadDocumentState(documentId);
  const state = Y.encodeStateAsUpdate(room.ydoc);
  const docId = new mongoose.Types.ObjectId(String(documentId));

  return DocSnapshot.create({
    documentId: docId,
    yjsState: Buffer.from(state),
    label: label || config.defaults.fallbackSnapshotLabel,
    createdBy: userId || undefined,
  });
}

async function getStateAtTime(documentId, timestamp) {
  const scratch = new Y.Doc();
  const docId = new mongoose.Types.ObjectId(String(documentId));

  const snapshot = await DocSnapshot.findOne({
    documentId: docId,
    createdAt: { $lte: timestamp },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (binaryByteLength(snapshot?.yjsState) > 0) {
    Y.applyUpdate(scratch, toUint8Array(snapshot.yjsState));
  }

  const filter = { documentId: docId, createdAt: { $lte: timestamp } };
  if (snapshot) {
    filter.createdAt = { $gt: snapshot.createdAt, $lte: timestamp };
  }

  const updates = await DocUpdate.find(filter).sort({ createdAt: 1 }).lean();
  for (const row of updates) {
    if (binaryByteLength(row.update) > 0) {
      Y.applyUpdate(scratch, toUint8Array(row.update));
    }
  }

  return scratch;
}

async function createRestoreUpdate(documentId, snapshotId) {
  const docId = new mongoose.Types.ObjectId(String(documentId));
  const snapshot = await DocSnapshot.findOne({ _id: snapshotId, documentId: docId }).lean();
  if (!snapshot) {
    throw new Error('Snapshot not found');
  }
  if (binaryByteLength(snapshot.yjsState) === 0) {
    throw new Error('Snapshot has no saved content');
  }

  const room = await loadDocumentState(documentId);
  const targetDoc = new Y.Doc();
  Y.applyUpdate(targetDoc, toUint8Array(snapshot.yjsState));

  const stateVector = Y.encodeStateVector(room.ydoc);
  const restoreUpdate = Y.encodeStateAsUpdate(targetDoc, stateVector);
  if (restoreUpdate.byteLength === 0) {
    return null;
  }
  return restoreUpdate;
}

function applyUpdateToRoom(documentId, update) {
  if (!update || update.byteLength === 0) return;
  const room = getRoom(documentId);
  Y.applyUpdate(room.ydoc, update);
}

function getEncodedState(documentId) {
  const room = getRoom(documentId);
  return Y.encodeStateAsUpdate(room.ydoc);
}

module.exports = {
  getRoom,
  loadDocumentState,
  persistUpdate,
  createSnapshot,
  getStateAtTime,
  createRestoreUpdate,
  applyUpdateToRoom,
  getEncodedState,
};

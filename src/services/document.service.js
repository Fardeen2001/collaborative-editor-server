const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const Document = require('../models/Document');
const DocumentAccess = require('../models/DocumentAccess');
const DocSnapshot = require('../models/DocSnapshot');
const DocUpdate = require('../models/DocUpdate');
const { signToken } = require('../utils/jwt');
const { AppError } = require('../utils/errors');
const { requireDocumentAccess, toObjectId } = require('./access.service');
const syncService = require('./sync.service');
const { toBuffer } = require('../utils/binary');
const { config } = require('../config');

const { validation, roles, defaults, auth } = config;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(validation.password.min).max(validation.password.max),
  name: z.string().min(validation.name.min).max(validation.name.max),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function registerUser(data) {
  const existing = await User.findOne({ email: data.email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(data.password, auth.bcryptRounds);
  const user = await User.create({
    email: data.email.toLowerCase(),
    passwordHash,
    name: data.name,
  });

  const token = signToken({ userId: user._id.toString(), email: user.email });
  return {
    token,
    user: { id: user._id, email: user.email, name: user.name },
  };
}

async function loginUser(data) {
  const user = await User.findOne({ email: data.email.toLowerCase() });
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  const token = signToken({ userId: user._id.toString(), email: user.email });
  return {
    token,
    user: { id: user._id, email: user.email, name: user.name },
  };
}

async function listDocuments(userId) {
  const accessRows = await DocumentAccess.find({ userId: toObjectId(userId) })
    .populate('documentId')
    .lean();

  return accessRows
    .filter((row) => row.documentId)
    .map((row) => ({
      id: row.documentId._id,
      title: row.documentId.title,
      role: row.role,
      updatedAt: row.documentId.updatedAt,
      createdAt: row.documentId.createdAt,
    }));
}

async function createDocument(userId, title) {
  const ownerId = toObjectId(userId);
  const doc = await Document.create({ title, ownerId });
  await DocumentAccess.create({
    documentId: doc._id,
    userId: ownerId,
    role: roles.owner,
  });
  return { id: doc._id, title: doc.title, role: roles.owner };
}

async function getDocument(documentId, userId) {
  const access = await requireDocumentAccess(documentId, userId, roles.viewer);
  const doc = await Document.findById(documentId).lean();
  if (!doc) throw new AppError('Document not found', 404);
  return {
    id: doc._id,
    title: doc.title,
    role: access.role,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

async function updateDocumentTitle(documentId, userId, title) {
  await requireDocumentAccess(documentId, userId, roles.owner);
  const doc = await Document.findByIdAndUpdate(
    documentId,
    { title },
    { new: true }
  ).lean();
  if (!doc) throw new AppError('Document not found', 404);
  return { id: doc._id, title: doc.title };
}

async function shareDocument(documentId, ownerId, email, role) {
  await requireDocumentAccess(documentId, ownerId, roles.owner);
  if (!roles.shareable.includes(role)) {
    throw new AppError('Can only share as editor or viewer', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const owner = await User.findById(ownerId).lean();
  if (owner?.email === normalizedEmail) {
    throw new AppError('You cannot change your own access role', 400);
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError('No account found with that email. They must register first.', 404);
  }

  const docId = toObjectId(documentId);
  const existing = await DocumentAccess.findOne({
    documentId: docId,
    userId: user._id,
  }).lean();
  if (existing?.role === roles.owner) {
    throw new AppError('Cannot change the document owner role', 400);
  }

  const access = await DocumentAccess.findOneAndUpdate(
    { documentId: docId, userId: user._id },
    { role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { userId: access.userId, email: user.email, role: access.role };
}

async function listSnapshots(documentId, userId) {
  await requireDocumentAccess(documentId, userId, roles.viewer);
  const snapshots = await DocSnapshot.find({ documentId })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email')
    .lean();

  return snapshots.map((s) => ({
    id: s._id,
    label: s.label,
    createdAt: s.createdAt,
    createdBy: s.createdBy
      ? { id: s.createdBy._id, name: s.createdBy.name, email: s.createdBy.email }
      : null,
  }));
}

async function saveSnapshot(documentId, userId, label) {
  await requireDocumentAccess(documentId, userId, roles.editor);
  await syncService.loadDocumentState(documentId);
  const snapshot = await syncService.createSnapshot(
    documentId,
    userId,
    label || defaults.snapshotLabel
  );
  return {
    id: snapshot._id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
  };
}

async function restoreSnapshot(documentId, userId, snapshotId) {
  await requireDocumentAccess(documentId, userId, roles.editor);
  const restoreUpdate = await syncService.createRestoreUpdate(documentId, snapshotId);
  if (restoreUpdate) {
    syncService.applyUpdateToRoom(documentId, restoreUpdate);
    await syncService.persistUpdate(
      documentId,
      restoreUpdate,
      `restore-${userId}`,
      Date.now()
    );
  }
  return { success: true, changed: Boolean(restoreUpdate) };
}

async function getUpdatesSince(documentId, userId, since) {
  await requireDocumentAccess(documentId, userId, roles.viewer);
  const filter = { documentId };
  if (since) filter.createdAt = { $gt: new Date(since) };
  const updates = await DocUpdate.find(filter).sort({ createdAt: 1 }).lean();
  return updates.map((u) => ({
    id: u._id,
    update: toBuffer(u.update).toString('base64'),
    clientId: u.clientId,
    seq: u.seq,
    createdAt: u.createdAt,
  }));
}

module.exports = {
  registerSchema,
  loginSchema,
  registerUser,
  loginUser,
  listDocuments,
  createDocument,
  getDocument,
  updateDocumentTitle,
  shareDocument,
  listSnapshots,
  saveSnapshot,
  restoreSnapshot,
  getUpdatesSince,
};

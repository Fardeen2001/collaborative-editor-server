const mongoose = require('mongoose');
const DocumentAccess = require('../models/DocumentAccess');
const { AppError } = require('../utils/errors');
const { config } = require('../config');

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

async function getDocumentAccess(documentId, userId) {
  return DocumentAccess.findOne({
    documentId: toObjectId(documentId),
    userId: toObjectId(userId),
  }).lean();
}

async function requireDocumentAccess(documentId, userId, minRole = config.roles.viewer) {
  const access = await getDocumentAccess(documentId, userId);
  if (!access) {
    throw new AppError('Document not found or access denied', 404);
  }
  if (config.roles.rank[access.role] < config.roles.rank[minRole]) {
    throw new AppError('Insufficient permissions', 403);
  }
  return access;
}

module.exports = {
  getDocumentAccess,
  requireDocumentAccess,
  toObjectId,
};

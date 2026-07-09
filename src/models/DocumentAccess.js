const mongoose = require('mongoose');
const { config } = require('../config');

const documentAccessSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: { type: String, enum: config.roles.all, required: true },
  },
  { timestamps: false }
);

documentAccessSchema.index({ documentId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('DocumentAccess', documentAccessSchema);

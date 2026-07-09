const mongoose = require('mongoose');
const { config } = require('../config');

const docSnapshotSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    yjsState: { type: Buffer, required: true },
    label: { type: String, trim: true, maxlength: config.validation.snapshotLabel.max },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('DocSnapshot', docSnapshotSchema);

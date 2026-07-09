const mongoose = require('mongoose');

const docUpdateSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    update: { type: Buffer, required: true },
    clientId: { type: String, required: true },
    seq: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

docUpdateSchema.index({ documentId: 1, createdAt: 1 });

module.exports = mongoose.model('DocUpdate', docUpdateSchema);

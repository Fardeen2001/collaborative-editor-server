const { Router } = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../utils/errors');
const { authenticate } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validate');
const documentService = require('../services/document.service');
const { config } = require('../config');

const router = Router({ mergeParams: true });

const objectIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid document id'),
});

const snapshotIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid document id'),
  snapshotId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid snapshot id'),
});

const snapshotSchema = z.object({
  label: z
    .string()
    .min(config.validation.snapshotLabel.min)
    .max(config.validation.snapshotLabel.max)
    .optional(),
});

router.use(authenticate);

router.get(
  '/',
  validateParams(objectIdSchema),
  asyncHandler(async (req, res) => {
    const snapshots = await documentService.listSnapshots(
      req.params.id,
      req.user.userId
    );
    res.json({ snapshots });
  })
);

router.post(
  '/',
  validateParams(objectIdSchema),
  validateBody(snapshotSchema),
  asyncHandler(async (req, res) => {
    const snapshot = await documentService.saveSnapshot(
      req.params.id,
      req.user.userId,
      req.body.label
    );
    res.status(201).json({ snapshot });
  })
);

router.post(
  '/:snapshotId/restore',
  validateParams(snapshotIdSchema),
  asyncHandler(async (req, res) => {
    const result = await documentService.restoreSnapshot(
      req.params.id,
      req.user.userId,
      req.params.snapshotId
    );
    res.json(result);
  })
);

module.exports = router;

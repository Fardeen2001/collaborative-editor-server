const { Router } = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../utils/errors');
const { authenticate } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validate');
const documentService = require('../services/document.service');
const { config } = require('../config');

const router = Router();

const objectIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid document id'),
});

const createDocSchema = z.object({
  title: z.string().min(config.validation.title.min).max(config.validation.title.max),
});

const shareSchema = z.object({
  email: z.string().email(),
  role: z.enum(config.roles.shareable),
});

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await documentService.listDocuments(req.user.userId);
    res.json({ documents: docs });
  })
);

router.post(
  '/',
  validateBody(createDocSchema),
  asyncHandler(async (req, res) => {
    const doc = await documentService.createDocument(req.user.userId, req.body.title);
    res.status(201).json({ document: doc });
  })
);

router.get(
  '/:id',
  validateParams(objectIdSchema),
  asyncHandler(async (req, res) => {
    const doc = await documentService.getDocument(req.params.id, req.user.userId);
    res.json({ document: doc });
  })
);

router.patch(
  '/:id',
  validateParams(objectIdSchema),
  validateBody(createDocSchema),
  asyncHandler(async (req, res) => {
    const doc = await documentService.updateDocumentTitle(
      req.params.id,
      req.user.userId,
      req.body.title
    );
    res.json({ document: doc });
  })
);

router.post(
  '/:id/share',
  validateParams(objectIdSchema),
  validateBody(shareSchema),
  asyncHandler(async (req, res) => {
    const access = await documentService.shareDocument(
      req.params.id,
      req.user.userId,
      req.body.email,
      req.body.role
    );
    res.json({ access });
  })
);

module.exports = router;

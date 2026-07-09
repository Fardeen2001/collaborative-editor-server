const { Router } = require('express');
const { asyncHandler } = require('../utils/errors');
const { validateBody } = require('../middleware/validate');
const documentService = require('../services/document.service');

const router = Router();

router.post(
  '/register',
  validateBody(documentService.registerSchema),
  asyncHandler(async (req, res) => {
    const result = await documentService.registerUser(req.body);
    res.status(201).json(result);
  })
);

router.post(
  '/login',
  validateBody(documentService.loginSchema),
  asyncHandler(async (req, res) => {
    const result = await documentService.loginUser(req.body);
    res.json(result);
  })
);

module.exports = router;

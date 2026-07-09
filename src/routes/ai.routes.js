const { Router } = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../utils/errors');
const { authenticate } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { config } = require('../config');

const router = Router();

const improveSchema = z.object({
  text: z.string().min(config.validation.aiText.min).max(config.validation.aiText.max),
  instruction: z.string().max(config.validation.aiInstruction.max).optional(),
});

router.use(authenticate);

router.post(
  '/improve',
  validateBody(improveSchema),
  asyncHandler(async (req, res) => {
    if (!config.ai.apiKey) {
      return res.status(503).json({
        error: 'AI feature not configured. Set OPENAI_API_KEY on the server.',
      });
    }

    const instruction = req.body.instruction || config.defaults.aiInstruction;
    const response = await fetch(config.ai.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [
          { role: 'system', content: config.ai.systemPrompt },
          {
            role: 'user',
            content: `${instruction}\n\nText:\n${req.body.text}`,
          },
        ],
        temperature: config.ai.temperature,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `AI provider error: ${err.slice(0, 200)}` });
    }

    const data = await response.json();
    const improved = data.choices?.[0]?.message?.content?.trim();
    if (!improved) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    res.json({ improved });
  })
);

module.exports = router;

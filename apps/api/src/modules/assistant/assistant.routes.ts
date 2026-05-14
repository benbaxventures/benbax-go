import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

export const assistantRouter = Router();

const adviceSchema = z.object({
  body: z.object({
    intent: z.enum(['ETA', 'ADDRESS_HELP', 'SUPPORT', 'OPTIMIZE_DELIVERY']),
    context: z.record(z.unknown()).default({})
  })
});

assistantRouter.use(requireAuth);

assistantRouter.post(
  '/advice',
  validate(adviceSchema),
  asyncHandler(async (req, res) => {
    const messageByIntent = {
      ETA: 'Your ETA improves when the rider is assigned and live GPS starts streaming.',
      ADDRESS_HELP: 'Add a nearby landmark, a short voice note, and WhatsApp pin for better Ghana address accuracy.',
      SUPPORT: 'I can triage payment, pickup, rider, and delivery proof issues before escalation.',
      OPTIMIZE_DELIVERY: 'Batch nearby stops, avoid peak traffic corridors, and prefer riders with fresh GPS signals.'
    };

    const intent = req.body.intent as keyof typeof messageByIntent;

    return ok(res, {
      intent: req.body.intent,
      suggestion: messageByIntent[intent],
      confidence: 0.82
    });
  })
);

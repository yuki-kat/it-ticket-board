import { Router, Request, Response } from 'express';

const router = Router();

// Check if Vercel AI Gateway is available (no auth required for availability check)
router.get('/check-gemini', (req: Request, res: Response) => {
  const gatewayApiKey = process.env.AI_GATEWAY_API_KEY;
  const available = Boolean(gatewayApiKey?.trim());

  res.json({ available });
});

export default router;

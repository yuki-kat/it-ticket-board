import { Router, Request, Response } from 'express';

const router = Router();

// Check if Gemini API is available (no auth required for availability check)
router.get('/check-gemini', (req: Request, res: Response) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const available = Boolean(geminiApiKey?.trim());

  res.json({ available });
});

export default router;

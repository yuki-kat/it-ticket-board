import { Router, Request, Response } from 'express';
import { defaultProviderRow } from '../utils/aiProviders.js';

const router = Router();

// Whether any AI provider is set up: a saved default (Tools → AI providers) or GEMINI_API_KEY. No auth needed;
// it only answers yes or no. The route keeps its old name because the browser already calls it.
router.get('/check-gemini', async (_req: Request, res: Response) => {
  const available = Boolean(process.env.GEMINI_API_KEY?.trim()) || Boolean(await defaultProviderRow());
  res.json({ available });
});

export default router;

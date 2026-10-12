import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { AiError } from '../utils/aiError.js';
import { generateText } from '../utils/aiProviders.js';
import type { GenerateContentRequest } from '../utils/gemini.js';

const router = Router();
router.use(authMiddleware);

// Generic AI proxy. The browser still sends Gemini-shaped prompts (the route predates other providers); only the
// prompt fields are read, never tools or other options, and the active provider (Tools → AI providers) answers.
router.post('/gemini', async (req: AuthRequest, res: Response) => {
  const { contents, systemInstruction, generationConfig } = (req.body ?? {}) as Partial<GenerateContentRequest>;
  if (!Array.isArray(contents) || !contents.length) {
    return res.status(400).json({ error: 'Gemini request must include at least one message' });
  }
  const textOf = (parts: unknown) => (Array.isArray(parts) ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('') : '');
  const messages = contents.map((message) => ({ role: message?.role === 'model' ? 'assistant' as const : 'user' as const, text: textOf(message?.parts) })).filter((message) => message.text);
  if (!messages.length) return res.status(400).json({ error: 'Gemini request must include at least one message' });

  try {
    const system = textOf(systemInstruction?.parts);
    const answer = await generateText({
      ...(system ? { system } : {}),
      messages,
      maxTokens: typeof generationConfig?.maxOutputTokens === 'number' ? generationConfig.maxOutputTokens : undefined,
      temperature: typeof generationConfig?.temperature === 'number' ? generationConfig.temperature : undefined,
    });
    res.json({ text: answer.text, model: answer.model });
  } catch (error) {
    if (error instanceof AiError) return res.status(error.status).json({ error: error.message });
    console.error('AI proxy error:', error);
    res.status(500).json({ error: 'AI request failed on the server.' });
  }
});

export default router;

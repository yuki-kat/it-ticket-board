import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { answerText, GeminiError, generateContent, type GenerateContentRequest } from '../utils/gemini.js';

const router = Router();
router.use(authMiddleware);

// Generic Gemini proxy: only the prompt fields are forwarded, never tools or other options.
router.post('/gemini', async (req: AuthRequest, res: Response) => {
  const { contents, systemInstruction, generationConfig } = (req.body ?? {}) as Partial<GenerateContentRequest>;
  if (!Array.isArray(contents) || !contents.length) {
    return res.status(400).json({ error: 'Gemini request must include at least one message' });
  }

  try {
    const { data, model } = await generateContent({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(generationConfig ? {
        generationConfig: {
          temperature: generationConfig.temperature,
          topK: generationConfig.topK,
          topP: generationConfig.topP,
          maxOutputTokens: generationConfig.maxOutputTokens,
        },
      } : {}),
    });
    res.json({ text: answerText(data), model });
  } catch (error) {
    if (error instanceof GeminiError) return res.status(error.status).json({ error: error.message });
    console.error('Gemini proxy error:', error);
    res.status(500).json({ error: 'AI request failed on the server.' });
  }
});

export default router;

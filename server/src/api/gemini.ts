import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// Generic Gemini API proxy endpoint
router.post('/ai/gemini', async (req: AuthRequest, res: Response) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini API key not configured on server'
      });
    }

    const geminiRequest: GeminiRequest = req.body;

    const response = await fetch(
      `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Gemini API Error:', error);
      return res.status(response.status).json({
        error: `Gemini API Error: ${error.error?.message || response.statusText}`
      });
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: 'No response from Gemini API'
      });
    }

    res.json({ text, usageMetadata: data.usageMetadata });
  } catch (error) {
    console.error('Gemini proxy error:', error);
    res.status(500).json({
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';

const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

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

interface GeminiInteractionResponse {
  steps?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
  usage?: {
    total_tokens?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
}

// Generic Gemini API proxy endpoint
router.post('/gemini', async (req: Request, res: Response) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'Gemini API key not configured on server'
      });
    }

    const geminiRequest: GeminiRequest = req.body;
    const input = geminiRequest.contents
      ?.map(({ role, parts }) => {
        const speaker = role === 'model' ? 'Assistant' : 'User';
        const text = parts.map(({ text: partText }) => partText).join('\n');
        return `${speaker}: ${text}`;
      })
      .join('\n\n');

    if (!input) {
      return res.status(400).json({ error: 'Gemini request must include at least one message' });
    }

    const systemInstruction = geminiRequest.systemInstruction?.parts
      .map(({ text }) => text)
      .join('\n');
    const generationConfig = geminiRequest.generationConfig;

    const requestBody = {
      input,
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
      ...(generationConfig ? {
        generation_config: {
          ...(generationConfig.temperature !== undefined ? { temperature: generationConfig.temperature } : {}),
          ...(generationConfig.topK !== undefined ? { top_k: generationConfig.topK } : {}),
          ...(generationConfig.topP !== undefined ? { top_p: generationConfig.topP } : {}),
          ...(generationConfig.maxOutputTokens !== undefined ? { max_output_tokens: generationConfig.maxOutputTokens } : {}),
        },
      } : {}),
      store: false,
    };

    let geminiResponse: globalThis.Response | null = null;
    let resultData: GeminiInteractionResponse | null = null;
    let text = '';
    let selectedModel = '';
    for (const [index, model] of GEMINI_MODELS.entries()) {
      try {
        geminiResponse = await fetch(GEMINI_INTERACTIONS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify({ ...requestBody, model }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          if (index < GEMINI_MODELS.length - 1) {
            console.warn(`Gemini model ${model} timed out; trying fallback model ${GEMINI_MODELS[index + 1]}.`);
            continue;
          }
          return res.status(504).json({ error: 'Gemini API timed out on the primary and fallback models' });
        }
        throw error;
      }

      if (geminiResponse.ok) {
        resultData = (await geminiResponse.json()) as GeminiInteractionResponse;
        text = resultData.steps
          ?.filter((step) => step.type === 'model_output')
          .flatMap((step) => step.content ?? [])
          .filter((content) => content.type === 'text')
          .map((content) => content.text ?? '')
          .join('') ?? '';

        if (text) {
          selectedModel = model;
          break;
        }

        if (index < GEMINI_MODELS.length - 1) {
          console.warn(`Gemini model ${model} returned no text; trying fallback model ${GEMINI_MODELS[index + 1]}.`);
          continue;
        }

        return res.status(502).json({ error: 'Gemini API returned no text from the primary and fallback models' });
      }

      const error = await geminiResponse.json().catch(() => ({})) as Record<string, unknown>;
      const message = (error.error as Record<string, unknown>)?.message || geminiResponse.statusText;
      if (geminiResponse.status !== 503 || index === GEMINI_MODELS.length - 1) {
        console.error(`Gemini API Error (${model}):`, error);
        return res.status(geminiResponse.status).json({
          error: `Gemini API Error: ${message}`
        });
      }

      console.warn(`Gemini model ${model} returned 503; trying fallback model ${GEMINI_MODELS[index + 1]}.`);
    }

    if (!geminiResponse?.ok || !resultData) {
      return res.status(502).json({ error: 'Gemini API request failed unexpectedly' });
    }

    res.json({ text, usageMetadata: resultData.usage, model: selectedModel });
  } catch (error) {
    console.error('Gemini proxy error:', error);
    res.status(500).json({
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;

import { createGateway, generateText } from 'ai';
import { Router, Request, Response } from 'express';

const router = Router();
const MAX_INPUT_LENGTH = 24_000;

interface GeminiRequest {
  contents?: unknown;
  systemInstruction?: { parts?: unknown };
  generationConfig?: {
    temperature?: unknown;
    maxOutputTokens?: unknown;
  };
}

const collectText = (value: unknown) => {
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])
    .join('\n');
};

const gatewayStatus = (error: unknown) =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;

router.post('/gemini', async (req: Request, res: Response) => {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    return res.status(503).json({ error: 'AI is not configured (AI_GATEWAY_API_KEY is missing).' });
  }

  const body = req.body as GeminiRequest;
  const contents = Array.isArray(body?.contents) ? body.contents : [];
  const messages = contents.flatMap((item) => {
    if (typeof item !== 'object' || item === null || !('parts' in item) || !('role' in item)) return [];
    if (item.role !== 'user' && item.role !== 'model') return [];
    const content = collectText(item.parts);
    if (!content) return [];
    const role = item.role === 'model' ? 'assistant' as const : 'user' as const;
    return [{ role, content }];
  });
  const promptLength = messages.reduce((length, message) => length + message.content.length, 0);
  if (messages.length === 0 || promptLength > MAX_INPUT_LENGTH) {
    return res.status(400).json({ error: 'The AI request is empty or too large.' });
  }

  const system = collectText(body.systemInstruction?.parts);
  const temperature = typeof body.generationConfig?.temperature === 'number' && Number.isFinite(body.generationConfig.temperature)
    ? Math.min(1, Math.max(0, body.generationConfig.temperature))
    : 0.7;
  const maxOutputTokens = typeof body.generationConfig?.maxOutputTokens === 'number' && Number.isFinite(body.generationConfig.maxOutputTokens)
    ? Math.min(2048, Math.max(64, body.generationConfig.maxOutputTokens))
    : 1024;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await generateText({
        model: createGateway()('moonshotai/kimi-k3'),
        ...(system ? { system } : {}),
        messages,
        temperature,
        maxOutputTokens,
      });
      if (result.text) return res.json({ text: result.text, model: 'moonshotai/kimi-k3' });
    }
    return res.status(502).json({ error: 'AI Gateway returned no text. Please try again.' });
  } catch (error: unknown) {
    const status = gatewayStatus(error);
    if (status === 429 || status === 503) {
      return res.status(503).json({ error: 'AI Gateway is busy right now. Try again shortly.' });
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: 'AI Gateway rejected the request. Check Gateway account access and model availability.' });
    }
    console.error('AI Gateway prompt failed', status ?? 'unknown error');
    return res.status(502).json({ error: 'Could not get a response from AI Gateway.' });
  }
});

export default router;

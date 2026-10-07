import { Router, Request, Response } from 'express';

// "Suggest fix": asks Gemini for likely causes and troubleshooting steps for one ticket.
// Ported from the former Vercel function (app/api/suggest-fix.ts); the key stays on the server.
const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];
const MAX_FIELD = 2000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : '');

const systemInstruction = `You are a senior IT service desk engineer. Given one ticket, suggest how the assigned technician could resolve it.
Be practical and specific to the ticket; do not invent facts about the environment. Keep each item to one sentence.
Give 2-4 likely causes, 3-6 ordered troubleshooting steps, and when to escalate.`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    likelyCauses: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    escalateIf: { type: 'STRING' },
  },
  required: ['likelyCauses', 'steps', 'escalateIf'],
};

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGemini(model: string, ticket: string): Promise<globalThis.Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY as string },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: ticket }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
}

router.post('/suggest-fix', async (req: Request, res: Response) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'AI suggestions are not set up on this site (GEMINI_API_KEY is missing).' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const title = text(body.title);
  if (!title) return res.status(400).json({ error: 'The ticket needs a short description.' });
  const tags = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string').slice(0, 20).join(', ') : '';

  const ticket = [
    `Type: ${text(body.recordType) || 'Incident'}`,
    `Severity: ${text(body.severity) || 'Not set'}`,
    `Assignment group: ${text(body.assignmentGroup) || 'Unassigned'}`,
    `Tags: ${tags || 'None'}`,
    `Short description: ${title}`,
    `Description: ${text(body.description) || 'None'}`,
  ].join('\n');

  try {
    let sawBusy = false;
    for (const [index, model] of GEMINI_MODELS.entries()) {
      let response: globalThis.Response;
      try {
        response = await callGemini(model, ticket);
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError' && index < GEMINI_MODELS.length - 1) {
          console.warn(`suggest-fix: ${model} timed out; trying ${GEMINI_MODELS[index + 1]}.`);
          continue;
        }
        throw error;
      }

      // Gemini often answers "high demand" (503) for a moment; fall back to the next model.
      if (response.status === 503 || response.status === 429) {
        sawBusy = true;
        if (index < GEMINI_MODELS.length - 1) {
          console.warn(`suggest-fix: ${model} returned ${response.status}; trying ${GEMINI_MODELS[index + 1]}.`);
          continue;
        }
        break;
      }

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        console.error(`suggest-fix: Gemini error (${model}):`, error);
        return res.status(502).json({ error: 'Could not get a suggestion from Gemini.' });
      }

      const data = (await response.json()) as GenerateContentResponse;
      const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      const suggestion = JSON.parse(answer || '{}');
      if (!Array.isArray(suggestion.steps) || !suggestion.steps.length) {
        if (index < GEMINI_MODELS.length - 1) {
          console.warn(`suggest-fix: ${model} returned no usable answer; trying ${GEMINI_MODELS[index + 1]}.`);
          continue;
        }
        break;
      }
      return res.json({
        likelyCauses: Array.isArray(suggestion.likelyCauses) ? suggestion.likelyCauses : [],
        steps: suggestion.steps,
        escalateIf: typeof suggestion.escalateIf === 'string' ? suggestion.escalateIf : '',
      });
    }
    if (sawBusy) return res.status(503).json({ error: 'Gemini is busy right now. Try again in a minute.' });
    return res.status(502).json({ error: 'Could not get a suggestion from Gemini.' });
  } catch (error) {
    console.error('suggest-fix failed', error);
    return res.status(502).json({ error: 'Could not get a suggestion from Gemini.' });
  }
});

export default router;

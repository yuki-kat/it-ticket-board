import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { AiError } from '../utils/aiError.js';
import { generateText, parseJsonObject } from '../utils/aiProviders.js';

// "Suggest fix": asks the active AI provider for likely causes and troubleshooting steps for one ticket.
// The AI provider key stays on the server.
const router = Router();
router.use(authMiddleware);

const MAX_FIELD = 2000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : '');

const systemInstruction = `You are a senior IT service desk engineer. Given one ticket, suggest how the assigned technician could resolve it.
Be practical and specific to the ticket; do not invent facts about the environment. Keep each item to one sentence.
Give 2-4 likely causes, 3-6 ordered troubleshooting steps, and when to escalate.
Reply with JSON only, in this shape: {"likelyCauses": string[], "steps": string[], "escalateIf": string}`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    likelyCauses: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    escalateIf: { type: 'STRING' },
  },
  required: ['likelyCauses', 'steps', 'escalateIf'],
};

router.post('/suggest-fix', async (req: AuthRequest, res: Response) => {
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
    const answer = await generateText({ system: systemInstruction, messages: [{ role: 'user', text: ticket }], json: true, geminiSchema: responseSchema, maxTokens: 2048 });
    const suggestion = parseJsonObject(answer.text);
    if (!Array.isArray(suggestion.steps) || !suggestion.steps.length) {
      return res.status(502).json({ error: 'The AI did not return any troubleshooting steps.' });
    }
    return res.json({
      likelyCauses: Array.isArray(suggestion.likelyCauses) ? suggestion.likelyCauses : [],
      steps: suggestion.steps,
      escalateIf: typeof suggestion.escalateIf === 'string' ? suggestion.escalateIf : '',
    });
  } catch (error) {
    if (error instanceof AiError) return res.status(error.status).json({ error: error.message });
    console.error('suggest-fix failed', error);
    return res.status(502).json({ error: 'Could not get a suggestion from the AI.' });
  }
});

export default router;

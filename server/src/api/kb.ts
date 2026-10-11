import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { AiError } from '../utils/aiError.js';
import { generateText, parseJsonObject } from '../utils/aiProviders.js';

// Knowledge base AI: draft an article from a resolved ticket, and answer a question from the articles the browser
// found. The articles live in the browser; the server only builds the prompt, calls the active provider and checks
// the reply. Nothing is stored here.
const router = Router();
router.use(authMiddleware);

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const strings = (value: unknown, maxItems: number, maxLength: number) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems) : [];
// Keeps user text from closing the tags the prompt wraps it in.
const fence = (value: string) => value.replace(/</g, '‹').replace(/>/g, '›');

const fail = (res: Response, error: unknown, context: string) => {
  if (error instanceof AiError) return res.status(error.status).json({ error: error.message });
  console.error(context, error);
  return res.status(502).json({ error: 'The AI request failed on the server.' });
};

const draftSystem = `You write internal IT knowledge base articles from resolved service desk tickets.
Use only facts in the ticket and its work notes; do not invent product names, settings or steps. If the notes do not
say how it was fixed, say so in the cause and keep the steps to what was actually done.
Write for a first-line technician: plain language, imperative steps, one action per step.
Remove personal details (names, emails, phone numbers, device serials) and refer to "the user" instead.
Reply with JSON only, in this shape:
{"title": string, "summary": string, "symptoms": string, "cause": string, "steps": string[], "tags": string[]}`;

const draftSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' }, summary: { type: 'STRING' }, symptoms: { type: 'STRING' }, cause: { type: 'STRING' },
    steps: { type: 'ARRAY', items: { type: 'STRING' } }, tags: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'summary', 'symptoms', 'cause', 'steps', 'tags'],
};

router.post('/ai/kb-draft', async (req: AuthRequest, res: Response) => {
  const ticket = ((req.body ?? {}) as { ticket?: Record<string, unknown> }).ticket ?? {};
  const title = text(ticket.title, 300);
  if (!title) return res.status(400).json({ error: 'Choose a ticket to draft from.' });
  const notes = Array.isArray(ticket.workNotes) ? ticket.workNotes.slice(-30).map((note) => {
    const item = (note ?? {}) as Record<string, unknown>;
    return `- ${text(item.at, 40)} ${text(item.author, 80)}: ${text(item.text, 1500)}`;
  }).join('\n') : '';
  const prompt = [
    '<ticket>',
    fence([
      `Number: ${text(ticket.number, 40)}`,
      `Type: ${text(ticket.type, 60) || 'Incident'}`,
      `Category tags: ${strings(ticket.tags, 15, 40).join(', ') || 'None'}`,
      `Short description: ${title}`,
      `Description: ${text(ticket.description, 4000) || 'None'}`,
      `Work notes (oldest first):\n${notes || 'None'}`,
    ].join('\n')),
    '</ticket>',
  ].join('\n');

  try {
    const answer = await generateText({ system: draftSystem, messages: [{ role: 'user', text: prompt }], json: true, geminiSchema: draftSchema, maxTokens: 2048, temperature: 0.2 });
    const draft = parseJsonObject(answer.text);
    const steps = strings(draft.steps, 20, 500);
    if (!text(draft.title, 200) || !steps.length) throw new AiError(502, 'The AI reply was missing a title or steps. Try again.');
    res.json({
      title: text(draft.title, 200),
      summary: text(draft.summary, 600),
      symptoms: text(draft.symptoms, 1500),
      cause: text(draft.cause, 1500),
      steps,
      tags: strings(draft.tags, 8, 30).map((tag) => tag.toLowerCase()),
      provider: answer.provider,
      model: answer.model,
    });
  } catch (error) {
    fail(res, error, 'kb draft failed');
  }
});

const askSystem = `You answer IT service desk questions using only the knowledge base articles provided.
Cite every article you use by its id in square brackets, for example [KB-0003]. Never cite an id that was not provided.
If the articles do not answer the question, say so plainly in one sentence and set "covered" to false; do not guess.
Keep the answer short: a sentence of context, then numbered steps if there are any.
Reply with JSON only, in this shape: {"answer": string, "citations": string[], "covered": boolean}`;

const askSchema = {
  type: 'OBJECT',
  properties: { answer: { type: 'STRING' }, citations: { type: 'ARRAY', items: { type: 'STRING' } }, covered: { type: 'BOOLEAN' } },
  required: ['answer', 'citations', 'covered'],
};

const ARTICLE_ID = /^KB-\d{1,6}$/;

router.post('/ai/kb-ask', async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as { question?: unknown; articles?: unknown };
  const question = text(body.question, 500);
  if (!question) return res.status(400).json({ error: 'Type a question.' });
  const articles = Array.isArray(body.articles) ? body.articles.map((item) => {
    const article = (item ?? {}) as Record<string, unknown>;
    return { id: text(article.id, 12), title: text(article.title, 200), body: text(article.body, 4000) };
  }).filter((article) => ARTICLE_ID.test(article.id) && article.title).slice(0, 6) : [];
  if (!articles.length) return res.status(400).json({ error: 'No matching articles to answer from.' });

  const prompt = [
    ...articles.map((article) => `<article id="${article.id}">\n${fence(`Title: ${article.title}\n${article.body}`)}\n</article>`),
    `<question>${fence(question)}</question>`,
  ].join('\n\n');

  try {
    const answer = await generateText({ system: askSystem, messages: [{ role: 'user', text: prompt }], json: true, geminiSchema: askSchema, maxTokens: 1500, temperature: 0.1 });
    const reply = parseJsonObject(answer.text);
    const sent = new Set(articles.map((article) => article.id));
    // Only keep citations to articles that were actually sent, in the answer text as well as the list.
    const citations = [...new Set(strings(reply.citations, 10, 12).filter((id) => sent.has(id)))];
    const cleanAnswer = text(reply.answer, 4000).replace(/\[(KB-\d{1,6})\]/g, (match, id: string) => (sent.has(id) ? match : ''));
    for (const id of cleanAnswer.match(/KB-\d{1,6}/g) ?? []) if (sent.has(id) && !citations.includes(id)) citations.push(id);
    if (!cleanAnswer) throw new AiError(502, 'The AI reply was empty. Try again.');
    res.json({ answer: cleanAnswer, citations, covered: reply.covered !== false && citations.length > 0, provider: answer.provider, model: answer.model });
  } catch (error) {
    fail(res, error, 'kb ask failed');
  }
});

export default router;

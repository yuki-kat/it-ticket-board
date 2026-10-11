import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getClient, query } from '../db/connection.js';
import { AiError } from '../utils/aiError.js';
import { activeProvider, checkEndpoint, generateText, KIND_LABELS, parseJsonObject, PROVIDER_KINDS, privateEndpointsAllowed, rowToConfig, type ProviderKind } from '../utils/aiProviders.js';
import { canEncrypt, seal } from '../utils/secretBox.js';

// Tools → AI providers. Any signed-in user can see which provider is active (no secrets); only system admins can
// list, add, change, test or remove providers. API keys are encrypted at rest and only their last 4 characters
// ever leave the server.
const router = Router();
router.use(authMiddleware);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = /^[\w.:/@-]{1,200}$/;
const NEEDS_URL: ProviderKind[] = ['azure_openai', 'openai_compatible'];
const KEY_OPTIONAL: ProviderKind[] = ['openai_compatible'];

const fail = (res: Response, error: unknown, context: string) => {
  if (error instanceof AiError) return res.status(error.status).json({ error: error.message });
  console.error(context, error);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
};

async function requireSystemAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query('SELECT 1 FROM users WHERE id = $1 AND is_system_admin = TRUE', [req.user?.user_id]);
    if (!result.rows.length) return res.status(403).json({ error: 'Only system admins can manage AI providers.' });
    next();
  } catch (error) {
    fail(res, error, 'admin check failed');
  }
}

const publicRow = (row: Record<string, unknown>) => ({
  id: row.id, kind: row.kind, label: row.label, model: row.model, baseUrl: row.base_url,
  keyLast4: row.key_last4, isDefault: row.is_default, updatedAt: row.updated_at,
});

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Validates the form. `existing` is the saved row when editing, so a blank key keeps the saved one. */
async function readForm(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const kind = text(body.kind, 40) as ProviderKind;
  if (!PROVIDER_KINDS.includes(kind)) throw new AiError(400, 'Choose a provider.');
  const label = text(body.label, 120) || KIND_LABELS[kind];
  const model = text(body.model, 200);
  if (!MODEL.test(model)) throw new AiError(400, 'Enter the model name (for Azure, the deployment name) exactly as the provider lists it.');
  const baseUrl = NEEDS_URL.includes(kind) ? await checkEndpoint(kind, text(body.baseUrl, 500)) : null;
  const apiKey = text(body.apiKey, 500);
  const keepKey = !apiKey && existing && existing.kind === kind && existing.key_ciphertext;
  if (!apiKey && !keepKey && !KEY_OPTIONAL.includes(kind)) throw new AiError(400, 'Enter the API key.');
  return {
    kind, label, model, baseUrl,
    keyCiphertext: apiKey ? seal(apiKey) : keepKey ? existing.key_ciphertext : null,
    keyLast4: apiKey ? apiKey.slice(-4) : keepKey ? existing.key_last4 : null,
    makeDefault: body.makeDefault === true,
  };
}

async function setDefault(id: string) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE ai_providers SET is_default = FALSE WHERE is_default AND id <> $1', [id]);
    await client.query('UPDATE ai_providers SET is_default = TRUE, updated_at = NOW() WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Which provider answers AI requests right now. Safe for any signed-in user: no keys, no URLs.
router.get('/ai/status', async (_req: AuthRequest, res: Response) => {
  try {
    const provider = await activeProvider();
    res.json(provider ? { configured: true, label: provider.label, kind: provider.kind, model: provider.model } : { configured: false });
  } catch (error) {
    // A saved key that can't be decrypted still means a provider is configured; say so rather than failing.
    if (error instanceof AiError) return res.json({ configured: true, problem: error.message });
    fail(res, error, 'ai status failed');
  }
});

router.get('/ai/providers', requireSystemAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM ai_providers ORDER BY is_default DESC, created_at');
    res.json({
      canSaveKeys: canEncrypt(),
      privateEndpointsAllowed: privateEndpointsAllowed(),
      envGemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      providers: result.rows.map(publicRow),
    });
  } catch (error) {
    fail(res, error, 'list ai providers failed');
  }
});

router.post('/ai/providers', requireSystemAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const form = await readForm(req.body ?? {});
    const result = await query(
      `INSERT INTO ai_providers (kind, label, model, base_url, key_ciphertext, key_last4, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [form.kind, form.label, form.model, form.baseUrl, form.keyCiphertext, form.keyLast4, req.user?.user_id],
    );
    const id = result.rows[0].id as string;
    const hasDefault = await query('SELECT 1 FROM ai_providers WHERE is_default');
    if (form.makeDefault || !hasDefault.rows.length) await setDefault(id);
    const saved = await query('SELECT * FROM ai_providers WHERE id = $1', [id]);
    res.status(201).json(publicRow(saved.rows[0]));
  } catch (error) {
    fail(res, error, 'save ai provider failed');
  }
});

router.put('/ai/providers/:id', requireSystemAdmin, async (req: AuthRequest, res: Response) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Provider not found.' });
  try {
    const current = await query('SELECT * FROM ai_providers WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Provider not found.' });
    const form = await readForm(req.body ?? {}, current.rows[0]);
    await query(
      `UPDATE ai_providers SET kind = $1, label = $2, model = $3, base_url = $4, key_ciphertext = $5, key_last4 = $6, updated_at = NOW() WHERE id = $7`,
      [form.kind, form.label, form.model, form.baseUrl, form.keyCiphertext, form.keyLast4, req.params.id],
    );
    if (form.makeDefault) await setDefault(req.params.id);
    const saved = await query('SELECT * FROM ai_providers WHERE id = $1', [req.params.id]);
    res.json(publicRow(saved.rows[0]));
  } catch (error) {
    fail(res, error, 'update ai provider failed');
  }
});

router.post('/ai/providers/:id/default', requireSystemAdmin, async (req: AuthRequest, res: Response) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Provider not found.' });
  try {
    const current = await query('SELECT 1 FROM ai_providers WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Provider not found.' });
    await setDefault(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'set default ai provider failed');
  }
});

router.delete('/ai/providers/:id', requireSystemAdmin, async (req: AuthRequest, res: Response) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Provider not found.' });
  try {
    const result = await query('DELETE FROM ai_providers WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Provider not found.' });
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'delete ai provider failed');
  }
});

// Sends a small request shaped like the real ones (system prompt, JSON reply, temperature) so the admin knows the
// key, model and URL work for the KB features before relying on them.
router.post('/ai/providers/:id/test', requireSystemAdmin, async (req: AuthRequest, res: Response) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Provider not found.' });
  try {
    const current = await query('SELECT id, kind, label, model, base_url, key_ciphertext FROM ai_providers WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Provider not found.' });
    const answer = await generateText({
      system: 'You are checking that an API connection works.',
      messages: [{ role: 'user', text: 'Reply with JSON only, exactly: {"reply": "OK"}' }],
      json: true,
      temperature: 0.2,
      maxTokens: 64,
    }, rowToConfig(current.rows[0]));
    const reply = parseJsonObject(answer.text).reply;
    res.json({ ok: true, model: answer.model, reply: typeof reply === 'string' ? reply.slice(0, 80) : answer.text.slice(0, 80) });
  } catch (error) {
    fail(res, error, 'test ai provider failed');
  }
});

export default router;

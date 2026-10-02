// Vercel function: asks Gemini for likely causes and troubleshooting steps for one ticket.
// The key stays on the server (GEMINI_API_KEY in Vercel's project settings, or app/.env for `vercel dev`);
// the page only ever sees the answer.
import { ApiError, GoogleGenAI, Type } from '@google/genai'

const MODEL = 'gemini-2.0-flash'
const MAX_FIELD = 2000

type SuggestFixRequest = { title?: unknown; description?: unknown; recordType?: unknown; severity?: unknown; assignmentGroup?: unknown; tags?: unknown }

const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : '')
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const systemInstruction = `You are a senior IT service desk engineer. Given one ticket, suggest how the assigned technician could resolve it.
Be practical and specific to the ticket; do not invent facts about the environment. Keep each item to one sentence.
Give 2-4 likely causes, 3-6 ordered troubleshooting steps, and when to escalate.`

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    likelyCauses: { type: Type.ARRAY, items: { type: Type.STRING } },
    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    escalateIf: { type: Type.STRING },
  },
  required: ['likelyCauses', 'steps', 'escalateIf'],
}

export async function POST(request: Request) {
  // Only the board itself may use this endpoint, so other sites can't spend the Gemini quota.
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      const host = request.headers.get('host') || ''
      const originUrl = new URL(origin)
      const hostWithoutPort = host.split(':')[0]
      const originHostWithoutPort = originUrl.hostname
      if (originHostWithoutPort !== hostWithoutPort) {
        return json({ error: 'Not allowed.' }, 403)
      }
    } catch {
      return json({ error: 'Not allowed.' }, 403)
    }
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return json({ error: 'AI suggestions are not set up on this site (GEMINI_API_KEY is missing).' }, 500)

  let body: SuggestFixRequest
  try { body = (await request.json()) as SuggestFixRequest } catch { return json({ error: 'Invalid request.' }, 400) }
  const title = text(body.title)
  if (!title) return json({ error: 'The ticket needs a short description.' }, 400)
  const tags = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string').slice(0, 20).join(', ') : ''

  const ticket = [
    `Type: ${text(body.recordType) || 'Incident'}`,
    `Severity: ${text(body.severity) || 'Not set'}`,
    `Assignment group: ${text(body.assignmentGroup) || 'Unassigned'}`,
    `Tags: ${tags || 'None'}`,
    `Short description: ${title}`,
    `Description: ${text(body.description) || 'None'}`,
  ].join('\n')

  try {
    const ai = new GoogleGenAI({ apiKey })
    const ask = () => ai.models.generateContent({
      model: MODEL,
      contents: ticket,
      config: { systemInstruction, responseMimeType: 'application/json', responseSchema, maxOutputTokens: 1024 },
    })
    // Gemini often answers "high demand" (503) for a moment; one quiet retry saves the user a click.
    const response = await ask().catch(async (error: unknown) => {
      if (error instanceof ApiError && (error.status === 503 || error.status === 429)) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return ask()
      }
      throw error
    })
    const suggestion = JSON.parse(response.text || '{}')
    if (!Array.isArray(suggestion.steps) || !suggestion.steps.length) throw new Error('Empty answer')
    return json({ likelyCauses: suggestion.likelyCauses || [], steps: suggestion.steps, escalateIf: suggestion.escalateIf || '' })
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 503 || error.status === 429) {
        return json({ error: 'Gemini is busy right now. Try again in a minute.' }, 503)
      }
    }
    console.error('suggest-fix failed', error)
    return json({ error: 'Could not get a suggestion from Gemini.' }, 502)
  }
}

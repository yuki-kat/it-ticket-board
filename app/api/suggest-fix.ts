import { createGateway, generateText } from 'ai'

const MODEL = 'anthropic/claude-haiku-4.5'
const MAX_FIELD = 2000

type SuggestFixRequest = { title?: unknown; description?: unknown; recordType?: unknown; severity?: unknown; assignmentGroup?: unknown; tags?: unknown }

const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : '')
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const systemInstruction = `You are a senior IT service desk engineer. Given one ticket, suggest how the assigned technician could resolve it.
Be practical and specific to the ticket; do not invent facts about the environment. Keep each item to one sentence.
Give 2-4 likely causes, 3-6 ordered troubleshooting steps, and when to escalate.
Return only a JSON object with string-array fields "likelyCauses" and "steps", and a string field "escalateIf". Do not include Markdown fences or other text.`

const isSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).hostname === (request.headers.get('host') || '').split(':')[0]
  } catch {
    return false
  }
}

const gatewayStatus = (error: unknown) =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined

const asStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null

const parseSuggestion = (result: string) => {
  try {
    const jsonStart = result.indexOf('{')
    const jsonEnd = result.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd < jsonStart) return null
    const suggestion: unknown = JSON.parse(result.slice(jsonStart, jsonEnd + 1))
    if (typeof suggestion !== 'object' || suggestion === null || Array.isArray(suggestion)) return null
    const value = suggestion as Record<string, unknown>
    const likelyCauses = asStringArray(value.likelyCauses)
    const steps = asStringArray(value.steps)
    if (!likelyCauses || !steps?.length || typeof value.escalateIf !== 'string') return null
    return { likelyCauses, steps, escalateIf: value.escalateIf }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Not allowed.' }, 403)
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    return json({ error: 'AI suggestions are not configured (AI_GATEWAY_API_KEY is missing).' }, 500)
  }

  let payload: unknown
  try { payload = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return json({ error: 'Invalid request.' }, 400)
  const body = payload as SuggestFixRequest
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { text: result } = await generateText({
        model: createGateway()(MODEL),
        system: systemInstruction,
        prompt: ticket,
        temperature: 0.2,
        maxOutputTokens: 1024,
      })
      const suggestion = parseSuggestion(result)
      if (suggestion) return json(suggestion)
    }
    console.error('suggest-fix returned an invalid response')
    return json({ error: 'AI Gateway returned an invalid suggestion. Please try again.' }, 502)
  } catch (error: unknown) {
    const status = gatewayStatus(error)
    if (status === 429 || status === 503) {
      return json({ error: 'AI Gateway is busy right now. Try again in a minute.' }, 503)
    }
    console.error('suggest-fix failed', status ?? 'unknown error')
    return json({ error: 'Could not get a suggestion from AI Gateway.' }, 502)
  }
}

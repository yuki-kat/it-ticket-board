import { createGateway, generateText } from 'ai'

const MAX_INPUT_LENGTH = 24_000
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

type GeminiRequest = {
  contents?: unknown
  systemInstruction?: { parts?: unknown }
  generationConfig?: { temperature?: unknown; maxOutputTokens?: unknown }
}

const isSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).hostname === (request.headers.get('host') || '').split(':')[0]
  } catch {
    return false
  }
}

const collectText = (value: unknown) => {
  if (!Array.isArray(value)) return ''
  return value
    .flatMap((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])
    .join('\n')
}

const gatewayStatus = (error: unknown) =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Not allowed.' }, 403)
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    return json({ error: 'AI is not configured (AI_GATEWAY_API_KEY is missing).' }, 503)
  }

  let payload: unknown
  try { payload = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  if (typeof payload !== 'object' || payload === null) return json({ error: 'Invalid request.' }, 400)
  const body = payload as GeminiRequest

  const contents = Array.isArray(body.contents) ? body.contents : []
  const messages = contents.flatMap((message) => {
    if (typeof message !== 'object' || message === null || !('parts' in message)) return []
    if (!('role' in message) || (message.role !== 'user' && message.role !== 'model')) return []
    const content = collectText(message.parts)
    if (!content) return []
    return [{ role: message.role === 'model' ? 'assistant' as const : 'user' as const, content }]
  })
  const promptLength = messages.reduce((length, message) => length + message.content.length, 0)
  if (messages.length === 0 || promptLength > MAX_INPUT_LENGTH) {
    return json({ error: 'The AI request is empty or too large.' }, 400)
  }

  const system = collectText(body.systemInstruction?.parts)
  const temperature = typeof body.generationConfig?.temperature === 'number' && Number.isFinite(body.generationConfig.temperature)
    ? Math.min(1, Math.max(0, body.generationConfig.temperature))
    : 0.7
  const maxOutputTokens = typeof body.generationConfig?.maxOutputTokens === 'number' && Number.isFinite(body.generationConfig.maxOutputTokens)
    ? Math.min(2048, Math.max(64, body.generationConfig.maxOutputTokens))
    : 1024

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await generateText({
        model: createGateway()('anthropic/claude-haiku-4.5'),
        ...(system ? { system } : {}),
        messages,
        temperature,
        maxOutputTokens,
      })
      if (result.text) return json({ text: result.text, model: 'anthropic/claude-haiku-4.5' })
    }
    return json({ error: 'AI Gateway returned no text. Please try again.' }, 502)
  } catch (error: unknown) {
    const status = gatewayStatus(error)
    if (status === 429 || status === 503) return json({ error: 'AI Gateway is busy right now. Try again shortly.' }, 503)
    if (status === 401 || status === 403) return json({ error: 'AI Gateway rejected the request. Check Gateway account access and model availability.' }, 502)
    console.error('AI Gateway prompt failed', status ?? 'unknown error')
    return json({ error: 'Could not get a response from AI Gateway.' }, 502)
  }
}

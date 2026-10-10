// Shared Gemini caller: tries each configured model in turn, retries brief overload/rate-limit
// errors with backoff, and turns failures into messages the UI can show as-is.

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Google retires Gemini models often, so the list can be changed with GEMINI_MODELS (comma-separated)
// on the server without a code change. A model Google reports as missing is skipped.
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']
export const geminiModels = () => {
  const configured = (process.env.GEMINI_MODELS || '').split(',').map((model) => model.trim()).filter(Boolean)
  return configured.length ? configured : DEFAULT_MODELS
}

const ATTEMPT_TIMEOUT_MS = 30_000
const TOTAL_BUDGET_MS = 55_000
const ATTEMPTS_PER_MODEL = 2
const RETRYABLE = new Set([429, 500, 502, 503, 504])
// Newer Flash models spend output tokens on reasoning before answering; a low cap can leave no text.
const MIN_OUTPUT_TOKENS = 4096

export class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
  promptFeedback?: { blockReason?: string }
}

export interface GenerateContentRequest {
  contents: Array<{ role?: 'user' | 'model'; parts: Array<{ text: string }> }>
  systemInstruction?: { parts: Array<{ text: string }> }
  generationConfig?: Record<string, unknown> & { maxOutputTokens?: number }
}

export const answerText = (data: GenerateContentResponse) =>
  data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? ''

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function googleMessage(response: globalThis.Response) {
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
  return body.error?.message || response.statusText || `HTTP ${response.status}`
}

function retryDelay(response: globalThis.Response, attempt: number) {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 5000) : 1000 * attempt
}

export async function generateContent(request: GenerateContentRequest): Promise<{ data: GenerateContentResponse; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new GeminiError(503, 'AI suggestions are not set up on this server (GEMINI_API_KEY is missing).')

  const body = JSON.stringify({
    ...request,
    generationConfig: { ...request.generationConfig, maxOutputTokens: Math.max(request.generationConfig?.maxOutputTokens ?? 0, MIN_OUTPUT_TOKENS) },
  })
  const models = geminiModels()
  const deadline = Date.now() + TOTAL_BUDGET_MS
  let lastError = new GeminiError(502, 'Gemini did not return an answer.')

  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now()
      if (remaining < 2000) throw lastError

      let response: globalThis.Response
      try {
        response = await fetch(`${API_URL}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
        })
      } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError'
        console.warn(`Gemini ${model} attempt ${attempt}: ${timedOut ? 'timed out' : `network error: ${error}`}`)
        lastError = new GeminiError(504, 'Gemini did not answer in time. Try again in a minute.')
        continue
      }

      if (response.ok) {
        const data = await response.json() as GenerateContentResponse
        if (answerText(data)) return { data, model }
        const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason
        console.warn(`Gemini ${model} returned no text${reason ? ` (${reason})` : ''}`)
        lastError = new GeminiError(502, `Gemini returned an empty answer${reason ? ` (${reason})` : ''}.`)
        break
      }

      const message = await googleMessage(response)
      if (response.status === 404 || response.status === 403) {
        console.warn(`Gemini ${model} is not available to this key (${response.status}): ${message}`)
        lastError = new GeminiError(502, `None of the configured Gemini models is available (${models.join(', ')}). Update GEMINI_MODELS on the server. Last error: ${message}`)
        break
      }
      if (RETRYABLE.has(response.status)) {
        console.warn(`Gemini ${model} attempt ${attempt}: ${response.status} ${message}`)
        lastError = new GeminiError(503, 'Gemini is busy right now. Try again in a minute.')
        if (attempt < ATTEMPTS_PER_MODEL) await sleep(Math.min(retryDelay(response, attempt), Math.max(0, deadline - Date.now() - 2000)))
        continue
      }
      console.error(`Gemini ${model} rejected the request (${response.status}): ${message}`)
      throw new GeminiError(502, `Gemini rejected the request: ${message}`)
    }
  }
  throw lastError
}

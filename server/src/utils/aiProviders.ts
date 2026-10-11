// Bring-your-own AI: system admins save a provider (Gemini, OpenAI, Azure OpenAI, Anthropic or any OpenAI-compatible
// server) in Tools → AI providers, and every AI feature uses the default one. Without a saved provider the
// GEMINI_API_KEY env var keeps working as before. Keys are encrypted at rest (secretBox.ts) and never sent back.
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { query } from '../db/connection.js'
import { AiError } from './aiError.js'
import { answerText, generateContent, type GenerateContentRequest } from './gemini.js'
import { unseal } from './secretBox.js'

export const PROVIDER_KINDS = ['gemini', 'openai', 'azure_openai', 'anthropic', 'openai_compatible'] as const
export type ProviderKind = typeof PROVIDER_KINDS[number]

export const KIND_LABELS: Record<ProviderKind, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  azure_openai: 'Azure OpenAI',
  anthropic: 'Anthropic Claude',
  openai_compatible: 'OpenAI-compatible',
}

export interface ProviderConfig { kind: ProviderKind; label: string; model: string; baseUrl?: string | null; apiKey?: string }

export interface AiRequest {
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; text: string }>
  maxTokens?: number
  temperature?: number
  /** Ask for a JSON object. The prompt must also describe the JSON shape (OpenAI's JSON mode requires the word). */
  json?: boolean
  /** Gemini only: a responseSchema for structured output. Other providers rely on the prompt. */
  geminiSchema?: Record<string, unknown>
}

export interface AiAnswer { text: string; model: string; provider: string }

// Reasoning models spend output tokens thinking before they answer; a low cap can leave no text at all.
const MIN_OUTPUT_TOKENS = 4096
const ATTEMPT_TIMEOUT_MS = 45_000
const MAX_ERROR_TEXT = 300

// ---- Which provider answers --------------------------------------------------------------------------------------

interface ProviderRow { id: string; kind: ProviderKind; label: string; model: string; base_url: string | null; key_ciphertext: string | null }

export async function defaultProviderRow(): Promise<ProviderRow | undefined> {
  try {
    const result = await query('SELECT id, kind, label, model, base_url, key_ciphertext FROM ai_providers WHERE is_default LIMIT 1')
    return result.rows[0]
  } catch (error) {
    // The table only exists after `npm run migrate`; until then behave as if nothing is saved.
    console.warn('Could not read ai_providers, falling back to GEMINI_API_KEY:', error instanceof Error ? error.message : error)
    return undefined
  }
}

export const rowToConfig = (row: ProviderRow): ProviderConfig => ({
  kind: row.kind, label: row.label, model: row.model, baseUrl: row.base_url, apiKey: row.key_ciphertext ? unseal(row.key_ciphertext) : undefined,
})

/** The saved default provider, else Gemini from the env var, else nothing. */
export async function activeProvider(): Promise<ProviderConfig | undefined> {
  const row = await defaultProviderRow()
  if (row) return rowToConfig(row)
  if (process.env.GEMINI_API_KEY?.trim()) return { kind: 'gemini', label: 'Google Gemini (server default)', model: '' }
  return undefined
}

export async function generateText(request: AiRequest, provider?: ProviderConfig): Promise<AiAnswer> {
  const config = provider ?? await activeProvider()
  if (!config) throw new AiError(503, 'AI is not set up on this server. A system admin can add a provider in Tools → AI providers.')
  switch (config.kind) {
    case 'gemini': return callGemini(config, request)
    case 'anthropic': return callAnthropic(config, request)
    case 'openai':
    case 'azure_openai':
    case 'openai_compatible': return callChatCompletions(config, request)
  }
}

// ---- Endpoint checks (custom base URLs) --------------------------------------------------------------------------

const AZURE_HOSTS = ['.openai.azure.com', '.services.ai.azure.com', '.cognitiveservices.azure.com']
const allowPrivate = () => process.env.AI_ALLOW_PRIVATE_ENDPOINTS === 'true'
export const privateEndpointsAllowed = allowPrivate

const blocked = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked.addSubnet(net, prefix, 'ipv6')

/**
 * Normalises a provider base URL and refuses ones that would let the server be pointed at internal addresses
 * (cloud metadata, the database, admin panels). Private and loopback addresses, and plain http, are only allowed
 * when the self-hoster sets AI_ALLOW_PRIVATE_ENDPOINTS=true (for example for Ollama on the same machine).
 * Checked when a provider is saved and again before every request. Redirects are never followed.
 */
export async function checkEndpoint(kind: ProviderKind, raw: string): Promise<string> {
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw new AiError(400, 'Enter the base URL in full, for example https://example.com/v1.') }
  if (url.username || url.password) throw new AiError(400, 'Put the API key in the key field, not in the URL.')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowPrivate())) throw new AiError(400, 'The base URL must start with https://.')
  url.search = ''
  url.hash = ''
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (kind === 'azure_openai') {
    if (!AZURE_HOSTS.some((suffix) => host.endsWith(suffix))) throw new AiError(400, 'Use your Azure resource URL, for example https://my-resource.openai.azure.com.')
    if (!/\/openai\/v1\/?$/.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/+$/, '')}/openai/v1`
  } else if (!allowPrivate()) {
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }).catch(() => {
      throw new AiError(400, `Could not find ${host}. Check the base URL.`)
    })
    if (addresses.some(({ address, family }) => blocked.check(address, family === 6 ? 'ipv6' : 'ipv4'))) {
      throw new AiError(400, `${host} is on a private network. To allow it (for example Ollama on this machine), set AI_ALLOW_PRIVATE_ENDPOINTS=true on the server.`)
    }
  }
  return url.toString().replace(/\/+$/, '')
}

// ---- HTTP --------------------------------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const clip = (text: string) => (text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT)}…` : text)

async function postJson(label: string, url: string, headers: Record<string, string>, body: unknown, model: string): Promise<unknown> {
  let last = new AiError(502, `${label} did not return an answer.`)
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: globalThis.Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      console.warn(`${label} attempt ${attempt}: ${timedOut ? 'timed out' : 'network error'}`)
      last = new AiError(504, timedOut ? `${label} did not answer in time. Try again in a minute.` : `Could not reach ${label}. Check the base URL and that the service is running.`)
      continue
    }
    const text = await response.text()
    if (response.ok) {
      try { return JSON.parse(text) } catch { throw new AiError(502, `${label} sent a reply that is not JSON.`) }
    }
    let message = response.statusText || `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      message = (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) || parsed.message || message
    } catch { /* not JSON: keep the status text */ }
    message = clip(message)
    if (response.status >= 300 && response.status < 400) throw new AiError(502, `${label} tried to redirect the request, which is not allowed. Check the base URL.`)
    if (response.status === 401 || response.status === 403) throw new AiError(502, `${label} rejected the API key (${response.status}). Check it in Tools → AI providers. ${message}`)
    if (response.status === 404) throw new AiError(502, `${label} could not find model "${model}" or the endpoint (404). ${message}`)
    if (response.status === 429 || response.status >= 500) {
      console.warn(`${label} attempt ${attempt}: ${response.status} ${message}`)
      last = new AiError(503, `${label} is busy or over its quota right now. Try again in a minute. ${message}`)
      if (attempt < 2) await sleep(1000)
      continue
    }
    throw new AiError(502, `${label} rejected the request (${response.status}): ${message}`)
  }
  throw last
}

const outputTokens = (request: AiRequest) => Math.max(request.maxTokens ?? 0, MIN_OUTPUT_TOKENS)

// ---- Adapters ----------------------------------------------------------------------------------------------------

async function callGemini(config: ProviderConfig, request: AiRequest): Promise<AiAnswer> {
  const body: GenerateContentRequest = {
    contents: request.messages.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }] })),
    ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
    generationConfig: {
      maxOutputTokens: request.maxTokens,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.json ? { responseMimeType: 'application/json', ...(request.geminiSchema ? { responseSchema: request.geminiSchema } : {}) } : {}),
    },
  }
  const { data, model } = await generateContent(body, { apiKey: config.apiKey, models: config.model ? [config.model] : undefined })
  return { text: answerText(data), model, provider: config.label }
}

async function callChatCompletions(config: ProviderConfig, request: AiRequest): Promise<AiAnswer> {
  const label = config.label || KIND_LABELS[config.kind]
  const base = config.kind === 'openai' ? 'https://api.openai.com/v1' : await checkEndpoint(config.kind, config.baseUrl || '')
  if (config.kind !== 'openai_compatible' && !config.apiKey) throw new AiError(503, `${label} has no API key saved.`)
  const headers: Record<string, string> = config.kind === 'azure_openai'
    ? { 'api-key': config.apiKey! }
    : config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
  const messages = [
    ...(request.system ? [{ role: 'system', content: request.system }] : []),
    ...request.messages.map((message) => ({ role: message.role, content: message.text })),
  ]
  const body: Record<string, unknown> = { model: config.model, messages }
  // OpenAI's reasoning models reject any temperature but the default, so it is only sent to compatible servers.
  if (request.temperature !== undefined && config.kind === 'openai_compatible') body.temperature = request.temperature
  // OpenAI and Azure want max_completion_tokens (newer models reject max_tokens); Ollama-style servers expect max_tokens.
  if (config.kind === 'openai_compatible') body.max_tokens = outputTokens(request)
  else body.max_completion_tokens = outputTokens(request)
  if (request.json && config.kind !== 'openai_compatible') body.response_format = { type: 'json_object' }

  const data = await postJson(label, `${base}/chat/completions`, headers, body, config.model) as { model?: string; choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new AiError(502, `${label} returned an empty answer${data.choices?.[0]?.finish_reason ? ` (${data.choices[0].finish_reason})` : ''}.`)
  return { text, model: data.model || config.model, provider: label }
}

async function callAnthropic(config: ProviderConfig, request: AiRequest): Promise<AiAnswer> {
  const label = config.label || KIND_LABELS.anthropic
  if (!config.apiKey) throw new AiError(503, `${label} has no API key saved.`)
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: outputTokens(request),
    messages: request.messages.map((message) => ({ role: message.role, content: message.text })),
  }
  if (request.system) body.system = request.system
  if (request.temperature !== undefined) body.temperature = request.temperature
  const data = await postJson(label, 'https://api.anthropic.com/v1/messages', { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }, body, config.model) as { model?: string; content?: Array<{ type: string; text?: string }>; stop_reason?: string }
  const text = (data.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('').trim()
  if (!text) throw new AiError(502, `${label} returned an empty answer${data.stop_reason ? ` (${data.stop_reason})` : ''}.`)
  return { text, model: data.model || config.model, provider: label }
}

/** Reads the first JSON object in a reply; models without a JSON mode sometimes wrap it in prose or a code fence. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new AiError(502, 'The AI reply did not contain the expected JSON.')
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* fall through */ }
  throw new AiError(502, 'The AI reply did not contain valid JSON.')
}

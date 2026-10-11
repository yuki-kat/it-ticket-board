// AI providers (Tools → AI providers) and the knowledge base AI calls. Keys never come to the browser: the server
// stores them encrypted and calls the provider itself.
import { apiFetch } from './base'

export type ProviderKind = 'gemini' | 'openai' | 'azure_openai' | 'anthropic' | 'openai_compatible'
export type AiProvider = { id: string; kind: ProviderKind; label: string; model: string; baseUrl: string | null; keyLast4: string | null; isDefault: boolean; updatedAt: string }
export type ProviderList = { canSaveKeys: boolean; privateEndpointsAllowed: boolean; envGemini: boolean; providers: AiProvider[] }
export type AiStatus = { configured: boolean; label?: string; kind?: ProviderKind; model?: string; problem?: string }
export type ProviderForm = { kind: ProviderKind; label: string; model: string; baseUrl: string; apiKey: string; makeDefault: boolean }

export const KIND_OPTIONS: { value: ProviderKind; label: string; needsUrl: boolean; keyOptional?: boolean; urlHint?: string; keyHint: string }[] = [
  { value: 'gemini', label: 'Google Gemini', needsUrl: false, keyHint: 'From Google AI Studio' },
  { value: 'openai', label: 'OpenAI', needsUrl: false, keyHint: 'From platform.openai.com' },
  { value: 'azure_openai', label: 'Azure OpenAI', needsUrl: true, urlHint: 'https://your-resource.openai.azure.com', keyHint: 'Keys and Endpoint page of the Azure resource' },
  { value: 'anthropic', label: 'Anthropic Claude', needsUrl: false, keyHint: 'From console.anthropic.com' },
  { value: 'openai_compatible', label: 'OpenAI-compatible', needsUrl: true, keyOptional: true, urlHint: 'https://openrouter.ai/api/v1', keyHint: 'Leave blank if the server needs none (e.g. Ollama)' },
]

export class AiRequestError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

export const HOSTED_ONLY = 'AI needs the hosted site: this copy (a downloaded file or the test link) has no server behind it.'
const TIMEOUT_MS = 120_000

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (location.protocol === 'file:') throw new AiRequestError(HOSTED_ONLY)
  let response: Response
  try {
    response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new AiRequestError('The server did not answer in time. If it was asleep, try again in a minute.')
    throw new AiRequestError(`Could not reach the server. ${HOSTED_ONLY}`)
  }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (response.status === 401) throw new AiRequestError('Sign in (Tools → Sign in) on the hosted site to use AI.', 401)
  if (response.status === 404 && !data?.error) throw new AiRequestError(HOSTED_ONLY, 404)
  if (!response.ok) throw new AiRequestError(data?.error || `The server returned an error (${response.status}).`, response.status)
  return data as T
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const getAiStatus = () => call<AiStatus>('/ai/status')
export const listProviders = () => call<ProviderList>('/ai/providers')
export const createProvider = (form: ProviderForm) => call<AiProvider>('/ai/providers', json('POST', form))
export const updateProvider = (id: string, form: ProviderForm) => call<AiProvider>(`/ai/providers/${id}`, json('PUT', form))
export const deleteProvider = (id: string) => call<{ ok: true }>(`/ai/providers/${id}`, json('DELETE'))
export const makeDefaultProvider = (id: string) => call<{ ok: true }>(`/ai/providers/${id}/default`, json('POST', {}))
export const testProvider = (id: string) => call<{ ok: true; model: string; reply: string }>(`/ai/providers/${id}/test`, json('POST', {}))

export type DraftTicket = { number: string; title: string; description: string; type: string; tags: string[]; workNotes: { at: string; author: string; text: string }[] }
export type ArticleDraft = { title: string; summary: string; symptoms: string; cause: string; steps: string[]; tags: string[]; provider: string; model: string }
export const draftArticle = (ticket: DraftTicket) => call<ArticleDraft>('/ai/kb-draft', json('POST', { ticket }))

export type KbAnswer = { answer: string; citations: string[]; covered: boolean; provider: string; model: string }
export const askKnowledgeBase = (question: string, articles: { id: string; title: string; body: string }[]) => call<KbAnswer>('/ai/kb-ask', json('POST', { question, articles }))

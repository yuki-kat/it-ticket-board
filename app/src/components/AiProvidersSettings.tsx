import { useEffect, useState, type FormEvent } from 'react'
import { BrainCircuit, CheckCircle2, Loader2, Pencil, Plus, Star, Trash2, X, Zap } from 'lucide-react'
import Overlay from './Overlay'
import { AiRequestError, createProvider, deleteProvider, getAiStatus, KIND_OPTIONS, listProviders, makeDefaultProvider, testProvider, updateProvider, type AiProvider, type AiStatus, type ProviderForm, type ProviderList } from '../api/ai'
import '../styles/ai-providers.css'

const emptyForm = (): ProviderForm => ({ kind: 'gemini', label: '', model: '', baseUrl: '', apiKey: '', makeDefault: false })
const kindLabel = (kind: string) => KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind

/**
 * Tools → AI providers. Everyone sees which provider answers AI requests; system admins can add their own keys for
 * Gemini, OpenAI, Azure OpenAI, Anthropic or an OpenAI-compatible server, test them and choose the default.
 */
export default function AiProvidersSettings({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [list, setList] = useState<ProviderList | null>(null)
  const [notice, setNotice] = useState('') // why the admin list is unavailable
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ id: string | null; form: ProviderForm } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [busyId, setBusyId] = useState('')
  const [confirmRemove, setConfirmRemove] = useState('')

  const refresh = async () => {
    try { setStatus(await getAiStatus()) } catch (error) { setStatus(null); setNotice(error instanceof Error ? error.message : 'Could not reach the server.') }
    try {
      setList(await listProviders())
      setNotice('')
    } catch (error) {
      setList(null)
      if (error instanceof AiRequestError && error.status === 403) setNotice('Only system admins can add or change AI providers. Ask your admin if you need a different one.')
      else setNotice(error instanceof Error ? error.message : 'Could not load AI providers.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [])

  const option = KIND_OPTIONS.find((item) => item.value === editing?.form.kind) ?? KIND_OPTIONS[0]
  const setField = <K extends keyof ProviderForm>(field: K, value: ProviderForm[K]) => setEditing((current) => current && { ...current, form: { ...current.form, [field]: value } })
  const editingProvider = editing?.id ? list?.providers.find((provider) => provider.id === editing.id) : undefined

  const startEdit = (provider: AiProvider) => {
    setEditing({ id: provider.id, form: { kind: provider.kind, label: provider.label, model: provider.model, baseUrl: provider.baseUrl ?? '', apiKey: '', makeDefault: provider.isDefault } })
    setFormError('')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setFormError('')
    try {
      if (editing.id) await updateProvider(editing.id, editing.form)
      else await createProvider(editing.form)
      setEditing(null)
      await refresh()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the provider.')
    } finally {
      setSaving(false)
    }
  }

  const act = async (id: string, action: () => Promise<unknown>, onDone?: (value: unknown) => void) => {
    setBusyId(id)
    try {
      const value = await action()
      onDone?.(value)
      await refresh()
    } catch (error) {
      setResults((current) => ({ ...current, [id]: { ok: false, text: error instanceof Error ? error.message : 'Failed.' } }))
    } finally {
      setBusyId('')
    }
  }

  const test = (provider: AiProvider) => act(provider.id, () => testProvider(provider.id), (value) => {
    const result = value as { model: string; reply: string }
    setResults((current) => ({ ...current, [provider.id]: { ok: true, text: `Works: ${result.model} replied “${result.reply}”.` } }))
  })

  return <Overlay className="ai-providers-overlay" onClose={onClose}>
    <section className="ai-providers-panel" role="dialog" aria-modal="true" aria-labelledby="ai-providers-title">
      <header>
        <div><span className="eyebrow">TOOLS · AI</span><h2 id="ai-providers-title">AI providers</h2><p>Choose which AI answers Find resolution, Suggest fix and the knowledge base. Keys stay on the server, encrypted.</p></div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close AI providers"><X size={18} /></button>
      </header>

      <div className="ai-status" role="status">
        <BrainCircuit size={18} aria-hidden="true" />
        {loading ? <span>Checking…</span> : status?.configured
          ? <span><b>In use:</b> {status.label}{status.model ? ` · ${status.model}` : ''}{status.problem ? <em className="ai-problem"> {status.problem}</em> : null}</span>
          : status ? <span><b>No AI provider is set up.</b> AI features show an error until one is added.</span> : <span>{notice}</span>}
      </div>

      {list && <>
        {!list.canSaveKeys && <p className="ai-warning" role="note"><b>Set AI_KEYS_SECRET on the server first.</b> Keys are encrypted with it, so they can’t be saved until it is set (any random string of 24+ characters, for example from <code>openssl rand -base64 48</code>). OpenAI-compatible servers that need no key still work.</p>}
        <p className="ai-note">Every signed-in user’s AI requests use the default provider’s key and are billed to that account. {list.envGemini ? 'When no provider is the default, the server’s GEMINI_API_KEY is used.' : ''}</p>

        {list.providers.length
          ? <ul className="ai-provider-list">{list.providers.map((provider) => <li key={provider.id} className={provider.isDefault ? 'is-default' : ''}>
            <div className="ai-provider-main">
              <b>{provider.label}</b>{provider.isDefault && <span className="ai-default-badge"><Star size={11} aria-hidden="true" /> Default</span>}
              <span className="ai-provider-meta">{kindLabel(provider.kind)} · {provider.model}{provider.keyLast4 ? ` · key ••••${provider.keyLast4}` : ' · no key'}{provider.baseUrl ? ` · ${provider.baseUrl}` : ''}</span>
              {results[provider.id] && <span className={results[provider.id].ok ? 'ai-result ok' : 'ai-result fail'} role="status">{results[provider.id].text}</span>}
            </div>
            <div className="ai-provider-actions">
              <button type="button" onClick={() => test(provider)} disabled={busyId === provider.id}>{busyId === provider.id ? <Loader2 size={13} className="ai-spin" /> : <Zap size={13} />} Test</button>
              {!provider.isDefault && <button type="button" onClick={() => act(provider.id, () => makeDefaultProvider(provider.id))} disabled={busyId === provider.id}><CheckCircle2 size={13} /> Make default</button>}
              <button type="button" onClick={() => startEdit(provider)}><Pencil size={13} /> Edit</button>
              <button type="button" className="ai-danger" onClick={() => setConfirmRemove(provider.id)}><Trash2 size={13} /> Remove</button>
            </div>
            {confirmRemove === provider.id && <div className="ai-confirm" role="alert"><span>Remove {provider.label}? Its saved key is deleted.{provider.isDefault ? ' AI falls back to the server default, if any.' : ''}</span><button type="button" className="ai-danger-solid" onClick={() => { setConfirmRemove(''); void act(provider.id, () => deleteProvider(provider.id)) }}>Remove</button><button type="button" onClick={() => setConfirmRemove('')}>Keep</button></div>}
          </li>)}</ul>
          : <p className="ai-empty">No providers saved yet.</p>}

        {editing
          ? <form className="ai-provider-form" onSubmit={save}>
            <h3>{editing.id ? `Edit ${editingProvider?.label ?? 'provider'}` : 'Add a provider'}</h3>
            <div className="ai-form-grid">
              <label>Provider<select value={editing.form.kind} onChange={(event) => setField('kind', event.target.value as ProviderForm['kind'])}>{KIND_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label><span>Name <small>Optional</small></span><input value={editing.form.label} onChange={(event) => setField('label', event.target.value)} placeholder={option.label} /></label>
              <label><span>Model <small>{editing.form.kind === 'azure_openai' ? 'The deployment name' : 'Exactly as the provider lists it'}</small></span><input value={editing.form.model} onChange={(event) => setField('model', event.target.value)} placeholder="Model name from your provider’s console" autoComplete="off" spellCheck={false} /></label>
              {option.needsUrl && <label>Base URL<input value={editing.form.baseUrl} onChange={(event) => setField('baseUrl', event.target.value)} placeholder={option.urlHint} autoComplete="off" spellCheck={false} inputMode="url" /></label>}
              <label className="ai-key-field"><span>API key <small>{editingProvider?.keyLast4 && editingProvider.kind === editing.form.kind ? `Leave blank to keep ••••${editingProvider.keyLast4}` : option.keyHint}</small></span><input type="password" value={editing.form.apiKey} onChange={(event) => setField('apiKey', event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={option.keyOptional ? 'Optional' : ''} /></label>
            </div>
            {editing.form.kind === 'openai_compatible' && !list.privateEndpointsAllowed && <p className="ai-note">Addresses on your own network (like Ollama on localhost) and plain http need AI_ALLOW_PRIVATE_ENDPOINTS=true on the server.</p>}
            <label className="ai-check"><input type="checkbox" checked={editing.form.makeDefault} onChange={(event) => setField('makeDefault', event.target.checked)} /> Use this provider for all AI features</label>
            {formError && <p className="ai-error" role="alert">{formError}</p>}
            <div className="ai-form-actions"><button type="button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="ai-primary" disabled={saving}>{saving ? 'Saving…' : 'Save provider'}</button></div>
          </form>
          : <button type="button" className="ai-add" onClick={() => { setEditing({ id: null, form: emptyForm() }); setFormError('') }}><Plus size={14} /> Add a provider</button>}
      </>}

      {!list && !loading && notice && status && <p className="ai-note">{notice}</p>}
    </section>
  </Overlay>
}

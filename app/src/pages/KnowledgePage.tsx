import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, Check, Copy, Loader2, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { askKnowledgeBase, draftArticle, getAiStatus, type AiStatus, type KbAnswer } from '../api/ai'
import { articleBody, articleText, loadArticles, matchesFilter, nextArticleId, rankArticles, saveArticles, type ArticleStatus, type KbArticle } from '../lib/kb'
import '../styles/knowledge.css'

/** The parts of a ticket the KB page reads (App's TicketItem has more). */
export type KbTicket = { id: string; title: string; description: string; recordType: string; status: string; tags: string[]; notes: string; resolvedAt?: string; activity?: { at: string; label: string; detail?: string }[] }

type EditorForm = { title: string; summary: string; symptoms: string; cause: string; steps: string; tags: string; status: ArticleStatus }
type AskState = { status: 'idle' } | { status: 'loading' | 'done' | 'error'; question: string; matches: KbArticle[]; answer?: KbAnswer; error?: string }

const formFrom = (article?: KbArticle): EditorForm => ({
  title: article?.title ?? '', summary: article?.summary ?? '', symptoms: article?.symptoms ?? '', cause: article?.cause ?? '',
  steps: article?.steps.join('\n') ?? '', tags: article?.tags.join(', ') ?? '', status: article?.status ?? 'Draft',
})
const dateLabel = (iso: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso))
const isHosted = () => location.protocol !== 'file:'
const signedIn = () => { try { return !!localStorage.getItem('auth_token') } catch { return false } }
const currentUser = () => {
  try { return (JSON.parse(localStorage.getItem('auth_user') || 'null') as { name?: string } | null)?.name || 'Service Desk' } catch { return 'Service Desk' }
}

/** Work notes are one text field, a line per entry; activity adds the state changes. The server keeps the last 30. */
const workNotesOf = (ticket: KbTicket) => [
  ...ticket.notes.split('\n').map((line) => line.trim()).filter(Boolean).map((text) => ({ at: '', author: '', text })),
  ...(ticket.activity ?? []).slice(-10).map((entry) => ({ at: entry.at, author: 'Activity', text: `${entry.label}${entry.detail ? `: ${entry.detail}` : ''}` })),
]

/** Shows an AI answer as plain text, turning [KB-0003] into a link only when that article was cited. */
function AnswerText({ text, cited, open }: { text: string; cited: Set<string>; open: (id: string) => void }) {
  const parts: ReactNode[] = text.split(/(\[KB-\d{1,6}\])/g).map((part, index) => {
    const id = part.match(/^\[(KB-\d{1,6})\]$/)?.[1]
    return id && cited.has(id) ? <button key={index} type="button" className="kb-inline-cite" onClick={() => open(id)}>{id}</button> : part
  })
  return <p className="kb-answer-text">{parts}</p>
}

export default function KnowledgePage({ tickets, openTicket }: { tickets: KbTicket[]; openTicket: (id: string) => void }) {
  const [articles, setArticles] = useState<KbArticle[]>(() => loadArticles())
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | ArticleStatus>('All')
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState<{ id: string | null; form: EditorForm } | null>(null)
  const [editorError, setEditorError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [question, setQuestion] = useState('')
  const [ask, setAsk] = useState<AskState>({ status: 'idle' })
  const [showDraft, setShowDraft] = useState(false)
  const [draftTicketId, setDraftTicketId] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)

  useEffect(() => saveArticles(articles), [articles])
  useEffect(() => {
    if (!isHosted() || !signedIn()) return
    getAiStatus().then(setAiStatus).catch(() => setAiStatus(null))
  }, [])

  const published = useMemo(() => articles.filter((article) => article.status === 'Published'), [articles])
  const visible = useMemo(() => articles
    .filter((article) => statusFilter === 'All' || article.status === statusFilter)
    .filter((article) => matchesFilter(article, filter))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [articles, statusFilter, filter])
  const selected = articles.find((article) => article.id === selectedId)
  const resolvedTickets = useMemo(() => tickets.filter((ticket) => ticket.status === 'Resolved').sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')), [tickets])
  const providerName = aiStatus?.configured ? aiStatus.label : undefined
  const counts = { all: articles.length, published: published.length, drafts: articles.length - published.length }

  const open = (id: string) => { setSelectedId(id); setEditing(null); setConfirmDelete(false); setCopied(false) }
  const update = (id: string, change: (article: KbArticle) => KbArticle) => setArticles((current) => current.map((article) => article.id === id ? change(article) : article))

  const startNew = () => { setSelectedId(''); setEditing({ id: null, form: formFrom() }); setEditorError('') }
  const startEdit = (article: KbArticle) => { setEditing({ id: article.id, form: formFrom(article) }); setEditorError('') }
  const setField = (field: keyof EditorForm, value: string) => setEditing((current) => current && { ...current, form: { ...current.form, [field]: value } })

  const saveEditor = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const { form } = editing
    const steps = form.steps.split('\n').map((step) => step.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
    if (!form.title.trim()) { setEditorError('Give the article a title.'); return }
    if (!steps.length) { setEditorError('Add at least one step, one per line.'); return }
    const now = new Date().toISOString()
    const fields = {
      title: form.title.trim(), summary: form.summary.trim(), symptoms: form.symptoms.trim(), cause: form.cause.trim(), steps,
      tags: [...new Set(form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))], status: form.status, updatedAt: now,
    }
    if (editing.id) {
      // Publishing is the review step for an AI draft, so the AI flag goes once a person publishes it.
      update(editing.id, (article) => ({ ...article, ...fields, aiDraft: fields.status === 'Published' ? undefined : article.aiDraft }))
      setSelectedId(editing.id)
    } else {
      const id = nextArticleId(articles)
      setArticles((current) => [{ id, ...fields, author: currentUser(), createdAt: now }, ...current])
      setSelectedId(id)
    }
    setEditing(null)
  }

  const publish = (article: KbArticle) => update(article.id, (current) => ({ ...current, status: 'Published', aiDraft: undefined, updatedAt: new Date().toISOString() }))
  const remove = (article: KbArticle) => { setArticles((current) => current.filter((item) => item.id !== article.id)); setSelectedId(''); setConfirmDelete(false) }
  const copy = async (article: KbArticle) => {
    try { await navigator.clipboard.writeText(articleText(article)); setCopied(true) } catch { setCopied(false) }
  }

  const runDraft = async () => {
    const ticket = resolvedTickets.find((item) => item.id === draftTicketId)
    if (!ticket) { setDraftError('Choose a resolved ticket.'); return }
    setDrafting(true)
    setDraftError('')
    try {
      const draft = await draftArticle({ number: ticket.id, title: ticket.title, description: ticket.description, type: ticket.recordType, tags: ticket.tags, workNotes: workNotesOf(ticket) })
      const now = new Date().toISOString()
      const id = nextArticleId(articles)
      const article: KbArticle = {
        id, title: draft.title, summary: draft.summary, symptoms: draft.symptoms, cause: draft.cause, steps: draft.steps, tags: draft.tags,
        status: 'Draft', author: currentUser(), createdAt: now, updatedAt: now, sourceTicketId: ticket.id,
        aiDraft: { provider: draft.provider, model: draft.model, at: now },
      }
      setArticles((current) => [article, ...current])
      setShowDraft(false)
      setDraftTicketId('')
      setSelectedId(id)
      setEditing({ id, form: formFrom(article) })
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'Drafting failed.')
    } finally {
      setDrafting(false)
    }
  }

  const runAsk = async (event: FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!text) return
    const matches = rankArticles(published, text).slice(0, 4).map((hit) => hit.article)
    if (!matches.length) { setAsk({ status: 'done', question: text, matches }); return }
    setAsk({ status: 'loading', question: text, matches })
    try {
      const answer = await askKnowledgeBase(text, matches.map((article) => ({ id: article.id, title: article.title, body: articleBody(article) })))
      setAsk({ status: 'done', question: text, matches, answer })
    } catch (error) {
      setAsk({ status: 'error', question: text, matches, error: error instanceof Error ? error.message : 'The question could not be answered.' })
    }
  }

  const reader = selected && !editing && <article className="kb-reader" aria-labelledby="kb-article-title">
    <button type="button" className="kb-back" onClick={() => setSelectedId('')}><ArrowLeft size={15} /> All articles</button>
    <div className="kb-reader-meta">
      <span className="kb-id">{selected.id}</span>
      <span className={`kb-status is-${selected.status.toLowerCase()}`}>{selected.status}</span>
      <span>Updated {dateLabel(selected.updatedAt)} by {selected.author}</span>
      {selected.sourceTicketId && <button type="button" className="kb-ticket-link" onClick={() => openTicket(selected.sourceTicketId!)}>From {selected.sourceTicketId}</button>}
    </div>
    <h2 id="kb-article-title">{selected.title}</h2>
    {selected.aiDraft && <p className="kb-ai-flag" role="note"><Sparkles size={15} aria-hidden="true" /> Drafted by AI ({selected.aiDraft.provider}) from {selected.sourceTicketId}. Check every step against the ticket before publishing.</p>}
    {selected.summary && <p className="kb-summary">{selected.summary}</p>}
    {selected.symptoms && <section><h3>Symptoms</h3><p>{selected.symptoms}</p></section>}
    {selected.cause && <section><h3>Cause</h3><p>{selected.cause}</p></section>}
    <section><h3>Resolution</h3><ol className="kb-steps">{selected.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>
    {!!selected.tags.length && <ul className="kb-tags" aria-label="Tags">{selected.tags.map((tag) => <li key={tag}><button type="button" onClick={() => setFilter(tag)}>{tag}</button></li>)}</ul>}
    <div className="kb-reader-actions">
      {selected.status === 'Draft' && <button type="button" className="kb-primary" onClick={() => publish(selected)}><Check size={15} /> Publish</button>}
      <button type="button" onClick={() => startEdit(selected)}><Pencil size={14} /> Edit</button>
      <button type="button" onClick={() => copy(selected)}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
      <button type="button" className="kb-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</button>
    </div>
    {confirmDelete && <div className="kb-confirm" role="alert"><span>Delete {selected.id}? This can’t be undone.</span><button type="button" className="kb-danger-solid" onClick={() => remove(selected)}>Delete article</button><button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button></div>}
  </article>

  const editor = editing && <form className="kb-editor" onSubmit={saveEditor} aria-labelledby="kb-editor-title">
    <h2 id="kb-editor-title">{editing.id ? `Edit ${editing.id}` : 'New article'}</h2>
    {editing.id && articles.find((article) => article.id === editing.id)?.aiDraft && <p className="kb-ai-flag" role="note"><Sparkles size={15} aria-hidden="true" /> AI draft. Check the cause and every step against the ticket, then set the status to Published.</p>}
    <label>Title<input value={editing.form.title} onChange={(event) => setField('title', event.target.value)} placeholder="What the user sees, e.g. VPN sign-in fails after a password change" /></label>
    <label>Summary<textarea rows={2} value={editing.form.summary} onChange={(event) => setField('summary', event.target.value)} placeholder="One or two sentences on the fix" /></label>
    <div className="kb-editor-pair">
      <label>Symptoms<textarea rows={3} value={editing.form.symptoms} onChange={(event) => setField('symptoms', event.target.value)} /></label>
      <label>Cause<textarea rows={3} value={editing.form.cause} onChange={(event) => setField('cause', event.target.value)} /></label>
    </div>
    <label><span>Steps <small>One per line</small></span><textarea rows={6} value={editing.form.steps} onChange={(event) => setField('steps', event.target.value)} placeholder={'Open Services on the print server.\nRestart the Print Spooler service.'} /></label>
    <div className="kb-editor-pair">
      <label><span>Tags <small>Separate with commas</small></span><input value={editing.form.tags} onChange={(event) => setField('tags', event.target.value)} placeholder="printing, spooler" /></label>
      <label>Status<select value={editing.form.status} onChange={(event) => setField('status', event.target.value)}><option>Draft</option><option>Published</option></select></label>
    </div>
    {editorError && <p className="kb-error" role="alert">{editorError}</p>}
    <div className="kb-editor-actions"><button type="button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="kb-primary">Save article</button></div>
  </form>

  return <main className="kb-page">
    <header className="kb-heading">
      <div><div className="eyebrow">SERVICE DESK · KNOWLEDGE</div><h1>Knowledge base</h1><p>Fixes your team has already worked out, written up so the next person doesn’t start from scratch.</p></div>
      <div className="kb-heading-actions">
        <button type="button" onClick={() => { setShowDraft((value) => !value); setDraftError('') }} aria-expanded={showDraft}><Sparkles size={15} /> Draft from ticket</button>
        <button type="button" className="kb-primary" onClick={startNew}><Plus size={15} /> New article</button>
      </div>
    </header>

    {showDraft && <section className="kb-draft-panel" aria-label="Draft from a resolved ticket">
      <h2><Sparkles size={16} aria-hidden="true" /> Draft an article from a resolved ticket</h2>
      <p>AI turns the ticket’s description and work notes into a draft: symptoms, cause and steps. It stays a draft until someone checks it and publishes it.</p>
      <div className="kb-draft-row">
        <label>Resolved ticket<select value={draftTicketId} onChange={(event) => setDraftTicketId(event.target.value)}><option value="">{resolvedTickets.length ? 'Choose a ticket…' : 'No resolved tickets yet'}</option>{resolvedTickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.id} · {ticket.title}</option>)}</select></label>
        <button type="button" className="kb-primary" onClick={runDraft} disabled={drafting || !draftTicketId}>{drafting ? <><Loader2 size={15} className="kb-spin" /> Drafting…</> : 'Draft article'}</button>
      </div>
      <p className="kb-muted">Sends the ticket’s text and work notes to {providerName ?? 'the AI provider set up on your server'}. The draft leaves out names and contact details, but check before publishing.</p>
      {draftError && <p className="kb-error" role="alert">{draftError}</p>}
    </section>}

    <section className="kb-ask" aria-label="Ask the knowledge base">
      <form onSubmit={runAsk} className="kb-ask-form">
        <label className="kb-ask-input"><span className="sr-only">Question</span><Search size={17} aria-hidden="true" /><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask the knowledge base, e.g. printer jobs are stuck in the queue" maxLength={500} /></label>
        <button type="submit" className="kb-primary" disabled={!question.trim() || ask.status === 'loading'}>{ask.status === 'loading' ? <><Loader2 size={15} className="kb-spin" /> Asking…</> : 'Ask'}</button>
      </form>
      <p className="kb-muted">Answers use only published articles{providerName ? `, via ${providerName}` : ''}. Matching articles show even without AI.</p>
      {ask.status !== 'idle' && <div className="kb-answer" aria-live="polite">
        {!ask.matches.length
          ? <p className="kb-answer-empty">No published article matches “{ask.question}”. Try other words, or draft one from a resolved ticket.</p>
          : <>
            {ask.status === 'loading' && <p className="kb-muted">Reading {ask.matches.length} matching article{ask.matches.length === 1 ? '' : 's'}…</p>}
            {ask.status === 'error' && <p className="kb-error" role="alert">{ask.error}</p>}
            {ask.answer && (ask.answer.covered
              ? <AnswerText text={ask.answer.answer} cited={new Set(ask.answer.citations)} open={open} />
              : <p className="kb-answer-empty">{ask.answer.answer || 'The knowledge base doesn’t cover this yet.'}</p>)}
            {ask.answer && <p className="kb-answer-source">Answered by {ask.answer.provider}{ask.answer.model ? ` (${ask.answer.model})` : ''}. Check the cited articles before acting on it.</p>}
            <div className="kb-matches"><span>{ask.answer?.citations.length ? 'Cited' : 'Matching articles'}</span>{(ask.answer?.citations.length ? ask.matches.filter((article) => ask.answer!.citations.includes(article.id)) : ask.matches).map((article) => <button type="button" key={article.id} onClick={() => open(article.id)}><b>{article.id}</b> {article.title}</button>)}</div>
          </>}
      </div>}
    </section>

    <div className={`kb-layout${selected || editing ? ' has-selection' : ''}`}>
      <section className="kb-list" aria-label="Articles">
        <div className="kb-list-tools">
          <label className="kb-filter"><span className="sr-only">Filter articles</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by word or tag" /></label>
          <div className="kb-status-tabs" role="tablist" aria-label="Article status">
            {([['All', counts.all], ['Published', counts.published], ['Draft', counts.drafts]] as const).map(([value, count]) => <button key={value} type="button" role="tab" aria-selected={statusFilter === value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{value === 'Draft' ? 'Drafts' : value} <span>{count}</span></button>)}
          </div>
        </div>
        {visible.length
          ? <ul className="kb-items">{visible.map((article) => <li key={article.id}><button type="button" className={article.id === selectedId ? 'selected' : ''} onClick={() => open(article.id)} aria-current={article.id === selectedId ? 'true' : undefined}>
            <span className="kb-item-top"><span className="kb-id">{article.id}</span>{article.status === 'Draft' && <span className="kb-status is-draft">{article.aiDraft ? 'AI draft' : 'Draft'}</span>}</span>
            <b>{article.title}</b>
            <span className="kb-item-summary">{article.summary}</span>
            {!!article.tags.length && <span className="kb-item-tags">{article.tags.slice(0, 3).join(' · ')}</span>}
          </button></li>)}</ul>
          : <div className="kb-empty"><BookOpen size={22} aria-hidden="true" /><p>{articles.length ? 'No articles match this filter.' : 'No articles yet. Write one, or draft one from a resolved ticket.'}</p>{filter && <button type="button" onClick={() => setFilter('')}>Clear filter</button>}</div>}
      </section>
      <section className="kb-detail" aria-label="Article">
        {editor || reader || <div className="kb-empty kb-detail-empty"><BookOpen size={26} aria-hidden="true" /><p>Choose an article to read it, or ask a question above.</p></div>}
      </section>
    </div>
  </main>
}

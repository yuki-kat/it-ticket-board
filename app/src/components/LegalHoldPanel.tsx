import { useState } from 'react'
import { Scale } from 'lucide-react'
import { emptyHoldForm, holdFormError, makeHold, releaseError, type LegalHold, type LegalHoldRelease } from '../lib/legalHold'
import '../styles/legal-hold.css'

const dateTime = (iso: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** The badge shown next to a held device or ticket wherever it appears. */
export function LegalHoldBadge({ hold }: { hold?: LegalHold }) {
  if (!hold) return null
  return <span className="legal-hold-badge" title={`On legal hold: case ${hold.matter}`}><Scale size={12} aria-hidden="true" /> Legal hold</span>
}

/**
 * Places or releases a hold. While held, a banner states the case, who placed it and when, and what the hold blocks.
 * Placing needs a case reference, a reason and a name; releasing needs a note and a name. Both end up in the history.
 */
export default function LegalHoldPanel({ hold, kind, blocks, onPlace, onRelease }: { hold?: LegalHold; kind: 'device' | 'ticket'; blocks: string; onPlace: (hold: LegalHold) => void; onRelease: (release: LegalHoldRelease) => void }) {
  const [mode, setMode] = useState<'idle' | 'place' | 'release'>('idle')
  const [form, setForm] = useState(emptyHoldForm)
  const [release, setRelease] = useState<LegalHoldRelease>({ note: '', releasedBy: '' })
  const [error, setError] = useState('')
  const close = () => { setMode('idle'); setError(''); setForm(emptyHoldForm()); setRelease({ note: '', releasedBy: '' }) }

  const place = () => {
    const problem = holdFormError(form)
    if (problem) { setError(problem); return }
    onPlace(makeHold(form, new Date().toISOString()))
    close()
  }
  const releaseHold = () => {
    const problem = releaseError(release)
    if (problem) { setError(problem); return }
    onRelease(release)
    close()
  }

  if (hold) return <section className="legal-hold-banner" aria-label="Legal hold">
    <div className="legal-hold-banner-head">
      <Scale size={20} aria-hidden="true" />
      <div>
        <strong>On legal hold</strong>
        <span>Case {hold.matter} · placed by {hold.placedBy} on {dateTime(hold.placedAt)}</span>
      </div>
    </div>
    <p className="legal-hold-reason">{hold.reason}</p>
    <p className="legal-hold-blocks">{blocks}</p>
    {mode === 'release'
      ? <div className="legal-hold-form">
        <label>Release note<textarea rows={2} value={release.note} onChange={(event) => setRelease((current) => ({ ...current, note: event.target.value }))} placeholder="Who authorised the release, or why the hold has ended" /></label>
        <label>Released by<input value={release.releasedBy} onChange={(event) => setRelease((current) => ({ ...current, releasedBy: event.target.value }))} placeholder="Your name" /></label>
        {error && <p className="legal-hold-error" role="alert">{error}</p>}
        <div className="legal-hold-actions"><button type="button" className="legal-hold-secondary" onClick={close}>Cancel</button><button type="button" className="legal-hold-release" onClick={releaseHold}>Release hold</button></div>
      </div>
      : <div className="legal-hold-actions"><button type="button" className="legal-hold-secondary on-dark" onClick={() => setMode('release')}>Release hold…</button></div>}
  </section>

  return <section className="legal-hold-panel" aria-label="Legal hold">
    {mode === 'place'
      ? <div className="legal-hold-form">
        <h4><Scale size={15} aria-hidden="true" /> Place legal hold</h4>
        <label>Case or matter reference<input value={form.matter} onChange={(event) => setForm((current) => ({ ...current, matter: event.target.value }))} placeholder="e.g. LIT-2026-014" /></label>
        <label>Reason<textarea rows={2} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder={kind === 'device' ? 'e.g. Preserve for HR investigation; do not wipe' : 'e.g. Relevant to the vendor dispute'} /></label>
        <label>Placed by<input value={form.placedBy} onChange={(event) => setForm((current) => ({ ...current, placedBy: event.target.value }))} placeholder="Your name" /></label>
        <p className="legal-hold-note">{blocks}</p>
        {error && <p className="legal-hold-error" role="alert">{error}</p>}
        <div className="legal-hold-actions"><button type="button" className="legal-hold-secondary" onClick={close}>Cancel</button><button type="button" className="legal-hold-place" onClick={place}>Place hold</button></div>
      </div>
      : <button type="button" className="legal-hold-open" onClick={() => setMode('place')}><Scale size={14} aria-hidden="true" /> Place legal hold…</button>}
  </section>
}

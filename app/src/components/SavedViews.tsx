import { useEffect, useState } from 'react'
import { BookmarkPlus, Trash2, X } from 'lucide-react'

export type SavedView<T> = { id: string; name: string; settings: T; builtIn?: boolean }
const settingsKey = (value: object) => JSON.stringify(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))

export function loadSavedViews<T>(key: string): SavedView<T>[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && item.settings && typeof item.settings === 'object') : []
  } catch {
    return []
  }
}

/**
 * Saved views management component for saving and restoring filter/view combinations.
 *
 * Allows users to save the current view settings (filters, sort, layout) with a custom name
 * for quick recall. Includes validation, deletion of saved views, and detection of active views.
 *
 * @param label - Section label (e.g., "Tickets", "Inventory") for dialogs and accessibility
 * @param views - Array of saved views with their settings
 * @param current - Current view settings to compare against and save
 * @param onApply - Callback to apply a loaded view's settings
 * @param onReset - Callback to reset to default settings
 * @param onSave - Callback when a new view is saved
 * @param onDelete - Callback when a view is deleted
 * @param saveButtonLabel - Custom label for the save button
 * @param saveDescription - Custom description text in the save dialog
 */
export default function SavedViews<T extends object>({ label, views, current, onApply, onReset, onSave, onDelete, saveButtonLabel = 'Save view', saveDescription = 'Save the current view, search, and filters for quick access later.' }: {
  label: string
  views: SavedView<T>[]
  current: T
  onApply: (settings: T) => void
  onReset: () => void
  onSave: (view: SavedView<T>) => void
  onDelete: (id: string) => void
  saveButtonLabel?: string
  saveDescription?: string
}) {
  const [showSave, setShowSave] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const currentKey = settingsKey(current)
  const active = views.find((view) => view.id === selectedId) || views.find((view) => view.builtIn && settingsKey(view.settings) === currentKey)
  const activeKey = active ? settingsKey(active.settings) : ''
  useEffect(() => { if (active && activeKey !== currentKey) setSelectedId('') }, [active, activeKey, currentKey])
  const save = () => {
    const cleanName = name.trim()
    if (!cleanName) { setError('Enter a name for this view.'); return }
    if (views.some((view) => view.name.toLowerCase() === cleanName.toLowerCase())) { setError('A saved view already has that name.'); return }
    const view = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: cleanName, settings: current }
    onSave(view)
    setSelectedId(view.id)
    setShowSave(false)
    setName('')
    setError('')
  }

  return <>
    <div className="saved-view-controls">
      <label className="saved-view-select"><span>Saved views</span><select value={active?.id || ''} onChange={(event) => { const selected = views.find((view) => view.id === event.target.value); if (selected) { setSelectedId(selected.id); onApply(selected.settings) } else { setSelectedId(''); onReset() } }} aria-label={`${label} saved views`}><option value="">{active ? 'Reset to default' : 'Current setup'}</option>{views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
      <button className="saved-view-save" onClick={() => { setName(''); setError(''); setShowSave(true) }} title={saveButtonLabel}><BookmarkPlus size={14} /><span>{saveButtonLabel}</span></button>
      {active && !active.builtIn && <button className="saved-view-delete" onClick={() => { onDelete(active.id); setSelectedId('') }} aria-label={`Delete saved view ${active.name}`} title={`Delete saved view ${active.name}`}><Trash2 size={14} /></button>}
    </div>
    {showSave && <div className="overlay saved-view-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSave(false) }}><section className="saved-view-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-view-title"><header><div><span className="eyebrow">{label.toUpperCase()}</span><h2 id="saved-view-title">Save this view</h2></div><button className="close-button" onClick={() => setShowSave(false)} aria-label="Close saved view dialog"><X size={18} /></button></header><p>{saveDescription}</p><label>View name<input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') save() }} placeholder="For example, Starred tickets" maxLength={60} /></label>{error && <div className="form-error" role="alert">{error}</div>}<footer><button className="text-button" onClick={() => setShowSave(false)}>Cancel</button><button className="primary-button" onClick={save}>Save view</button></footer></section></div>}
  </>
}

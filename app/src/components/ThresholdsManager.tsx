import { useCallback, useEffect, useState } from 'react'
import { apiFetch, responseError } from '../api/base'

const TICKET_TYPES = [
  { id: 'incident', label: 'Incident' },
  { id: 'service_request', label: 'Service request' },
  { id: 'change', label: 'Change' },
  { id: 'problem', label: 'Problem' },
] as const
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
type Priority = typeof PRIORITIES[number]
type Unit = 'min' | 'h' | 'd'
const UNIT_MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 1440 }

// From the Tier 2 / Tier 3 columns of the priority table on Home (a day counts as 24 h, as in the SLA timer).
const RECOMMENDED: Record<Priority, [number, number]> = {
  critical: [30, 60],
  high: [240, 1440],
  medium: [1440, 4320],
  low: [4320, 7200],
}

interface Cell { amount: string; unit: Unit }
type Draft = Record<Priority, [Cell, Cell]>
interface Threshold { ticket_type: string; priority: Priority; tier_1_minutes: number | null; tier_2_minutes: number | null }

const toCell = (minutes: number | null): Cell => {
  if (minutes === null) return { amount: '', unit: 'h' }
  const unit: Unit = minutes > 0 && minutes % 1440 === 0 ? 'd' : minutes > 0 && minutes % 60 === 0 ? 'h' : 'min'
  return { amount: String(minutes / UNIT_MINUTES[unit]), unit }
}
const toMinutes = (cell: Cell): number | null => (cell.amount.trim() === '' ? null : Math.round(Number(cell.amount) * UNIT_MINUTES[cell.unit]))
const describe = (minutes: number | null) => {
  if (minutes === null) return 'Not set'
  const cell = toCell(minutes)
  return `${cell.amount} ${cell.unit === 'min' ? 'min' : cell.unit === 'h' ? (cell.amount === '1' ? 'hour' : 'hours') : (cell.amount === '1' ? 'day' : 'days')}`
}
const draftFrom = (rows: Threshold[], type: string): Draft =>
  Object.fromEntries(PRIORITIES.map((priority) => {
    const row = rows.find((item) => item.ticket_type === type && item.priority === priority)
    return [priority, [toCell(row?.tier_1_minutes ?? null), toCell(row?.tier_2_minutes ?? null)]]
  })) as Draft

export default function ThresholdsManager({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<Threshold[]>([])
  const [type, setType] = useState<string>('incident')
  const [draft, setDraft] = useState<Draft>(() => draftFrom([], 'incident'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`/teams/${teamId}/escalation-thresholds`)
      if (!response.ok) throw new Error(await responseError(response))
      const list = await response.json() as Threshold[]
      setRows(list)
      setDraft(draftFrom(list, 'incident'))
      setType('incident')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load time thresholds')
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => { void load() }, [load])

  const update = (priority: Priority, tier: 0 | 1, change: Partial<Cell>) => {
    setSaved(false)
    setDraft((current) => {
      const cells = [...current[priority]] as [Cell, Cell]
      cells[tier] = { ...cells[tier], ...change }
      return { ...current, [priority]: cells }
    })
  }

  const useRecommended = () => {
    setSaved(false)
    setDraft(Object.fromEntries(PRIORITIES.map((priority) => [priority, [toCell(RECOMMENDED[priority][0]), toCell(RECOMMENDED[priority][1])]])) as Draft)
  }

  const save = async () => {
    setError('')
    const thresholds = PRIORITIES.map((priority) => ({ ticket_type: type, priority, tier_1_minutes: toMinutes(draft[priority][0]), tier_2_minutes: toMinutes(draft[priority][1]) }))
    for (const row of thresholds) {
      for (const value of [row.tier_1_minutes, row.tier_2_minutes]) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) { setError(`${row.priority}: enter a time of 0 or more`); return }
      }
      if (row.tier_1_minutes !== null && row.tier_2_minutes !== null && row.tier_2_minutes <= row.tier_1_minutes) {
        setError(`${row.priority}: tier 2 → 3 must be later than tier 1 → 2, since both count from when the ticket opened`)
        return
      }
    }
    setSaving(true)
    try {
      const response = await apiFetch(`/teams/${teamId}/escalation-thresholds`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thresholds }) })
      if (!response.ok) throw new Error(await responseError(response))
      const list = await response.json() as Threshold[]
      setRows(list)
      setDraft(draftFrom(list, type))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save time thresholds')
    } finally {
      setSaving(false)
    }
  }

  const typeLabel = TICKET_TYPES.find((item) => item.id === type)?.label ?? type

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Time thresholds</h2>
        <p className="text-sm text-gray-600">
          How long a ticket can wait before it escalates automatically. Times count from when the ticket was opened, not counting time its SLA was paused (for example, waiting on the user).
          A ticket only escalates when the Escalation Rules tab has a rule for the next tier. Leave a time empty to turn off auto-escalation for that step.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Ticket type">
        {TICKET_TYPES.map((item) => (
          <button key={item.id} type="button" aria-pressed={type === item.id} onClick={() => { setType(item.id); setDraft(draftFrom(rows, item.id)); setSaved(false) }}
            className={`px-3 py-1.5 rounded border text-sm ${type === item.id ? 'bg-orange-600 border-orange-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {loading ? <p className="text-sm text-gray-600">Loading time thresholds…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" aria-label={`${typeLabel} time thresholds`}>
            <thead>
              <tr className="text-left text-gray-600 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Priority</th>
                <th className="py-2 pr-4 font-medium">Tier 1 → 2</th>
                <th className="py-2 pr-4 font-medium">Tier 2 → 3</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITIES.map((priority) => (
                <tr key={priority} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium text-gray-900 capitalize" style={{ whiteSpace: 'nowrap' }}>
                    {priority}
                    {canEdit && <div className="text-xs font-normal text-gray-500 normal-case">Recommended {describe(RECOMMENDED[priority][0])} / {describe(RECOMMENDED[priority][1])}</div>}
                  </td>
                  {([0, 1] as const).map((tier) => (
                    <td key={tier} className="py-3 pr-4">
                      {canEdit ? (
                        <div className="flex gap-1" style={{ minWidth: 150 }}>
                          <input type="number" min={0} step="any" inputMode="decimal" value={draft[priority][tier].amount}
                            aria-label={`${priority} tier ${tier + 1} to ${tier + 2}`}
                            onChange={(e) => update(priority, tier, { amount: e.target.value })}
                            placeholder="Off" className="px-2 py-1.5 border border-gray-300 rounded" style={{ width: 80 }} />
                          <select value={draft[priority][tier].unit} aria-label={`${priority} tier ${tier + 1} to ${tier + 2} unit`}
                            onChange={(e) => update(priority, tier, { unit: e.target.value as Unit })}
                            className="px-2 py-1.5 border border-gray-300 rounded">
                            <option value="min">min</option>
                            <option value="h">hours</option>
                            <option value="d">days</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-gray-800">{describe(toMinutes(draft[priority][tier]))}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={saving || loading} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
            {saving ? 'Saving…' : `Save ${typeLabel.toLowerCase()} thresholds`}
          </button>
          <button type="button" onClick={useRecommended} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">Use recommended values</button>
          {saved && <span role="status" className="text-sm text-green-700">Saved</span>}
        </div>
      ) : (
        <p className="text-sm text-gray-600">Only team admins can change time thresholds.</p>
      )}
    </div>
  )
}

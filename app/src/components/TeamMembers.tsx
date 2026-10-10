import { useCallback, useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { apiFetch, responseError } from '../api/base'

type Role = 'member' | 'admin'
interface Member { id: string; name: string; email: string; role: Role }

export default function TeamMembers({ teamId, isAdmin, currentUserEmail, onChanged }: { teamId: string; isAdmin: boolean; currentUserEmail?: string; onChanged?: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`/teams/${teamId}/members`)
      if (!response.ok) throw new Error(await responseError(response))
      setMembers(await response.json())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load team members')
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<Response>) => {
    setError('')
    try {
      const response = await action()
      if (!response.ok) throw new Error(await responseError(response))
      await load()
      onChanged?.()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    }
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setAdding(true)
    const ok = await run(() => apiFetch(`/teams/${teamId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role }),
    }))
    if (ok) { setEmail(''); setRole('member') }
    setAdding(false)
  }

  const changeRole = (member: Member, next: Role) => run(() => apiFetch(`/teams/${teamId}/members/${member.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: next }),
  }))

  const remove = async (member: Member) => {
    setConfirmRemove('')
    await run(() => apiFetch(`/teams/${teamId}/members/${member.id}`, { method: 'DELETE' }))
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Members</h2>
        <p className="text-sm text-gray-600">
          {isAdmin ? 'Add people who already have an account on this site. Admins can change team settings and members.' : 'Only team admins can add or remove members.'}
        </p>
      </div>

      {isAdmin && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-sm text-gray-700" style={{ flex: '1 1 220px' }}>
            Email address
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" className="mt-1 px-3 py-2 border border-gray-300 rounded" />
          </label>
          <label className="flex flex-col text-sm text-gray-700">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 px-3 py-2 border border-gray-300 rounded">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit" disabled={adding} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
            <UserPlus size={16} />{adding ? 'Adding…' : 'Add member'}
          </button>
        </form>
      )}

      {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {loading ? <p className="text-sm text-gray-600">Loading members…</p> : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded" aria-label="Team members">
          {members.map((member) => {
            const isYou = !!currentUserEmail && member.email.toLowerCase() === currentUserEmail.toLowerCase()
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <p className="font-medium text-gray-900 truncate">{member.name}{isYou && <span className="text-gray-500 font-normal"> (you)</span>}</p>
                  <p className="text-sm text-gray-600 truncate">{member.email}</p>
                </div>
                {isAdmin ? (
                  <>
                    <select aria-label={`Role for ${member.name}`} value={member.role} onChange={(e) => void changeRole(member, e.target.value as Role)} className="px-2 py-1 border border-gray-300 rounded text-sm">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    {confirmRemove === member.id
                      ? <span className="flex gap-2 text-sm">
                          <button type="button" onClick={() => void remove(member)} className="px-2 py-1 bg-red-600 text-white rounded">Remove {member.name.split(' ')[0]}</button>
                          <button type="button" onClick={() => setConfirmRemove('')} className="px-2 py-1 border border-gray-300 rounded">Cancel</button>
                        </span>
                      : <button type="button" onClick={() => setConfirmRemove(member.id)} className="px-2 py-1 text-sm text-red-700 border border-red-200 rounded hover:bg-red-50">Remove</button>}
                  </>
                ) : (
                  <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-700">{member.role === 'admin' ? 'Admin' : 'Member'}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

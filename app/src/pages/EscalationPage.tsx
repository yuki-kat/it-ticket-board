import { useCallback, useEffect, useState } from 'react'
import { LogIn, Plus, Settings2, X } from 'lucide-react'
import { useEscalation } from '../hooks/useEscalation'
import { apiFetch, authHeader, responseError } from '../api/base'
import { useAuth } from '../contexts/AuthContext'
import AssignmentGroupManager from '../components/AssignmentGroupManager'
import EscalationMatrixBuilder from '../components/EscalationMatrixBuilder'
import MatrixUploadManager from '../components/MatrixUploadManager'
import TeamMembers from '../components/TeamMembers'
import ThresholdsManager from '../components/ThresholdsManager'

type Tab = 'groups' | 'rules' | 'thresholds' | 'documents' | 'members'
interface Team { id: string; name: string; slug: string; role: 'member' | 'admin' }

const TEAM_KEY = 'it-ticket-team-id'
const readTeamId = () => { try { return localStorage.getItem(TEAM_KEY) || '' } catch { return '' } }
const saveTeamId = (id: string) => { try { localStorage.setItem(TEAM_KEY, id) } catch { /* storage blocked */ } }

interface EscalationPageProps {
  onClose: () => void
  onSignIn: () => void
}

export default function EscalationPage({ onClose, onSignIn }: EscalationPageProps) {
  const { user } = useAuth()
  const signedIn = Boolean(authHeader().Authorization)
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [teamId, setTeamId] = useState(readTeamId)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)

  const loadTeams = useCallback(async () => {
    try {
      const response = await apiFetch('/teams')
      if (response.status === 401) throw new Error('Your sign-in has expired. Sign in again to manage team settings.')
      if (!response.ok) throw new Error(await responseError(response))
      const list = await response.json() as Team[]
      setTeams(list)
      setLoadError('')
      setTeamId((current) => list.some((team) => team.id === current) ? current : list[0]?.id || '')
    } catch (err) {
      setLoadError(err instanceof TypeError
        ? 'Could not reach the server. Team settings only work on the hosted site, not in a downloaded copy or the test link.'
        : err instanceof Error ? err.message : 'Could not load your teams')
    }
  }, [])

  useEffect(() => { if (signedIn && location.protocol !== 'file:') void loadTeams() }, [signedIn, loadTeams])
  useEffect(() => { if (teamId) saveTeamId(teamId) }, [teamId])

  const team = teams?.find((item) => item.id === teamId)
  const header = (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <Settings2 size={24} className="text-orange-600" />
        <h1 className="text-2xl font-bold text-gray-900">Escalation Configuration</h1>
      </div>
      <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-200 rounded-lg transition-colors"><X size={20} /></button>
    </div>
  )

  let body: React.ReactNode
  if (location.protocol === 'file:') {
    body = <Notice title="Team settings need the hosted site">This copy has no server behind it. Open the hosted site and sign in to set up your team.</Notice>
  } else if (!signedIn) {
    body = <Notice title="Sign in to manage team settings" action={<button onClick={onSignIn} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"><LogIn size={16} />Sign in</button>}>
      Assignment groups, escalation rules and reference documents belong to a team, so they need an account on this site.
    </Notice>
  } else if (loadError) {
    body = <Notice title="Team settings are unavailable" action={<button onClick={() => void loadTeams()} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">Try again</button>}>{loadError}</Notice>
  } else if (!teams) {
    body = <p className="text-sm text-gray-600">Loading your teams…</p>
  } else if (!teams.length || creating) {
    body = <CreateTeam defaultName={user?.name ? `${user.name.split(' ')[0]}'s team` : 'My team'} onCancel={teams.length ? () => setCreating(false) : undefined}
      onCreated={async (created) => { setCreating(false); setTeamId(created.id); await loadTeams() }} />
  } else if (team) {
    body = <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {teams.length > 1
          ? <label className="flex items-center gap-2 text-sm text-gray-700">Team
              <select value={team.id} onChange={(e) => setTeamId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded">
                {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          : <p className="text-sm text-gray-700">Team <b className="text-gray-900">{team.name}</b></p>}
        <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-700">{team.role === 'admin' ? 'Admin' : 'Member'}</span>
        <button onClick={() => setCreating(true)} className="ml-auto flex items-center gap-1 text-sm text-orange-700 hover:underline"><Plus size={14} />New team</button>
      </div>
      <TeamWorkspace key={team.id} team={team} currentUserEmail={user?.email} onTeamsChanged={() => void loadTeams()} />
    </>
  }

  return (
    <div className="w-full max-w-4xl mx-auto" style={{ paddingInline: 16 }}>
      {header}
      {body}
    </div>
  )
}

function Notice({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600">{children}</p>
      {action}
    </div>
  )
}

function CreateTeam({ defaultName, onCreated, onCancel }: { defaultName: string; onCreated: (team: Team) => void | Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await apiFetch('/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) })
      if (!response.ok) throw new Error(await responseError(response))
      await onCreated(await response.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the team')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="p-6 bg-white border border-gray-200 rounded-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{onCancel ? 'Create another team' : 'Create your team'}</h2>
        <p className="text-sm text-gray-600">Escalation settings belong to a team. You'll be its admin and can add colleagues by email.</p>
      </div>
      <label className="flex flex-col text-sm text-gray-700">
        Team name
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 px-3 py-2 border border-gray-300 rounded" />
      </label>
      {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">{saving ? 'Creating…' : 'Create team'}</button>
        {onCancel && <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>}
      </div>
    </form>
  )
}

function TeamWorkspace({ team, currentUserEmail, onTeamsChanged }: { team: Team; currentUserEmail?: string; onTeamsChanged: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('groups')
  const escalation = useEscalation(team.id)
  const { loadGroups, loadRules } = escalation
  const isAdmin = team.role === 'admin'

  useEffect(() => {
    void loadGroups()
    void loadRules()
  }, [loadGroups, loadRules])

  return (
    <>
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
        <Settings2 size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-blue-900">Escalation Matrix</p>
          <p className="text-blue-800">
            Configure how tickets escalate through your support tiers. Assignment groups route tickets to teams, not individuals.
            {!isAdmin && ' You are a member of this team, so only team admins can change these settings.'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200" style={{ overflowX: 'auto' }}>
        {[
          { id: 'groups', label: 'Assignment Groups' },
          { id: 'rules', label: 'Escalation Rules' },
          { id: 'thresholds', label: 'Time Thresholds' },
          { id: 'documents', label: 'Reference Documents' },
          { id: 'members', label: 'Members' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {escalation.error && activeTab !== 'members' && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {escalation.error}
        </div>
      )}

      <div className="bg-white rounded-lg">
        {activeTab === 'groups' && (
          <AssignmentGroupManager
            teamId={team.id}
            groups={escalation.groups}
            loading={escalation.loading}
            error={escalation.error}
            onGroupCreate={escalation.createGroup}
            onGroupUpdate={escalation.updateGroup}
            onGroupDelete={escalation.deleteGroup}
            onGroupsRefresh={escalation.loadGroups}
            canEdit={isAdmin}
          />
        )}

        {activeTab === 'rules' && (
          <EscalationMatrixBuilder
            teamId={team.id}
            rules={escalation.rules}
            groups={escalation.groups}
            loading={escalation.loading}
            error={escalation.error}
            onRuleCreate={escalation.createRule}
            onRuleUpdate={escalation.updateRule}
            onRuleDelete={escalation.deleteRule}
            onRulesRefresh={escalation.loadRules}
            canEdit={isAdmin}
          />
        )}

        {activeTab === 'thresholds' && <ThresholdsManager teamId={team.id} canEdit={isAdmin} />}

        {activeTab === 'documents' && (
          <div className="p-6 space-y-6">
            <MatrixUploadManager
              teamId={team.id}
              type="escalation"
              canEdit={isAdmin}
              title="Escalation Matrix"
              description="Upload your escalation matrix as a reference document (PDF, image, or document). This serves as a visual guide for your team."
            />
            <MatrixUploadManager
              teamId={team.id}
              type="sla"
              canEdit={isAdmin}
              title="SLA Matrix"
              description="Upload your SLA matrix as a reference document (PDF, image, or document). This serves as a visual guide for response and resolution times."
            />
          </div>
        )}

        {activeTab === 'members' && (
          <TeamMembers teamId={team.id} isAdmin={isAdmin} currentUserEmail={currentUserEmail} onChanged={onTeamsChanged} />
        )}
      </div>
    </>
  )
}

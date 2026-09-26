import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  cancelInvite, canSignInHere, cloud, currentSession, currentWorkspace, inviteMember, listMembers, removeMember,
  sendSignInLink, setMemberRole, signOut, uploadBackup, type Invite, type Member, type Role, type Workspace,
} from './cloud'
import { createBackup } from './backup'
import './backup.css'

/** Settings section: sign in with an emailed link, see your workspace (company) and, as an admin, manage its team. */
export default function AccountSection() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [upload, setUpload] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('agent')
  const [teamMessage, setTeamMessage] = useState('')
  const available = canSignInHere()

  useEffect(() => {
    if (!available) return
    // Only touch the network if there is something stored, or the address holds a sign-in link.
    const wantsSession = window.location.hash.includes('access_token') || Object.keys(localStorage).some((key) => key.startsWith('sb-'))
    if (!wantsSession) return
    void currentSession().then(setSession)
    const { data } = cloud().auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [available])

  const loadTeam = useCallback(async (workspaceId: string) => {
    const result = await listMembers(workspaceId)
    if ('error' in result) { setTeamMessage(`Could not load the team: ${result.error}`); return }
    setMembers(result.members)
    setInvites(result.invites)
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void currentWorkspace().then((result) => {
      if (cancelled) return
      if ('error' in result) { setWorkspaceError(result.error); return }
      setWorkspaceError('')
      setWorkspace(result)
      void loadTeam(result.id)
    })
    return () => { cancelled = true }
  }, [userId, loadTeam])

  const send = async () => {
    setBusy(true)
    const error = await sendSignInLink(email)
    setBusy(false)
    setMessage(error ? `Could not send the link: ${error}` : `Link sent to ${email.trim()}. Open it on this device to finish signing in.`)
  }

  const copyToAccount = async () => {
    if (!workspace) return
    setBusy(true)
    setUpload('')
    const result = await uploadBackup(createBackup(), workspace.id)
    setBusy(false)
    setUpload(result.ok
      ? `Copied to ${workspace.name}: ${result.counts.tickets} tickets, ${result.counts.deleted_tickets} deleted, ${result.counts.assets} assets, ${result.counts.stock_items} stock items, and your ${result.counts.settings} settings. Nothing was changed in this browser.`
      : `Could not copy: ${result.error}`)
  }

  /** Runs a team change, then shows its error or reloads the team. */
  const teamChange = async (change: () => Promise<string | null>, done: string) => {
    if (!workspace) return
    setBusy(true)
    const error = await change()
    setBusy(false)
    setTeamMessage(error ? `Could not change the team: ${error}` : done)
    await loadTeam(workspace.id)
  }

  const isAdmin = workspace?.role === 'admin'
  const validInvite = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())

  return <section className="settings-section account-settings">
    <h3>Account</h3>
    {!available && <p data-account-unavailable>Sign-in works when the board is opened from a web address, not from a file on your computer.</p>}
    {available && session && <>
      <p>Signed in as <b data-account-email>{session.user.email}</b>. Your tickets are still saved in this browser; moving them to your workspace comes next.</p>
      {workspaceError && <div className="import-note" role="status" data-account-workspace-error>Could not open your workspace: {workspaceError}</div>}
      {workspace && <>
        <p>Workspace: <b data-account-workspace>{workspace.name}</b> <span data-account-role>(you are {workspace.role === 'admin' ? 'an admin' : 'an agent'})</span></p>
        <div className="backup-actions"><button type="button" className="primary-button" data-account-upload disabled={busy} onClick={() => void copyToAccount()}>Copy this browser’s data to {workspace.name}</button></div>
        {upload && <div className="import-note" role="status" data-account-upload-message>{upload}</div>}

        <h4>Team</h4>
        <ul className="account-team" data-account-members>
          {members.map((member) => <li key={member.user_id} data-account-member={member.email ?? member.user_id}>
            <span>{member.email ?? 'Unknown email'}{member.user_id === session.user.id ? ' (you)' : ''}</span>
            {isAdmin
              ? <select aria-label={`Role for ${member.email ?? 'member'}`} data-account-member-role value={member.role} disabled={busy}
                  onChange={(event) => void teamChange(() => setMemberRole(workspace.id, member.user_id, event.target.value as Role), `${member.email ?? 'Member'} is now ${event.target.value === 'admin' ? 'an admin' : 'an agent'}.`)}>
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                </select>
              : <span>{member.role === 'admin' ? 'Admin' : 'Agent'}</span>}
            {isAdmin && member.user_id !== session.user.id && <button type="button" className="text-button" data-account-member-remove disabled={busy}
              onClick={() => void teamChange(() => removeMember(workspace.id, member.user_id), `${member.email ?? 'Member'} was removed.`)}>Remove</button>}
          </li>)}
          {invites.map((invite) => <li key={invite.email} data-account-invite={invite.email}>
            <span>{invite.email} <i>(invited, joins when they first sign in)</i></span>
            <span>{invite.role === 'admin' ? 'Admin' : 'Agent'}</span>
            <button type="button" className="text-button" data-account-invite-cancel disabled={busy}
              onClick={() => void teamChange(() => cancelInvite(workspace.id, invite.email), `Invite for ${invite.email} cancelled.`)}>Cancel</button>
          </li>)}
        </ul>
        {isAdmin && <div className="backup-actions" data-account-invite-form>
          <input type="email" aria-label="Colleague's email address" data-account-invite-email value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="colleague@example.com" />
          <select aria-label="Role for the new member" data-account-invite-role value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <button type="button" className="primary-button" data-account-invite-send disabled={busy || !validInvite}
            onClick={() => void teamChange(async () => { const error = await inviteMember(workspace.id, inviteEmail, inviteRole); if (!error) setInviteEmail(''); return error },
              `Invited ${inviteEmail.trim().toLowerCase()}. They join ${workspace.name} when they first sign in with that email.`)}>Invite</button>
        </div>}
        {teamMessage && <div className="import-note" role="status" data-account-team-message>{teamMessage}</div>}
      </>}
      <div className="backup-actions"><button type="button" className="text-button" data-account-signout onClick={() => void signOut().then(() => { setSession(null); setWorkspace(null); setMembers([]); setInvites([]); setTeamMessage('') })}>Sign out</button></div>
    </>}
    {available && !session && <>
      <p>Sign in with your email. You will get a link, with no password to remember.</p>
      <div className="backup-actions">
        <input type="email" aria-label="Email address" data-account-email-input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        <button type="button" className="primary-button" data-account-send disabled={busy || !email.includes('@')} onClick={() => void send()}>Email me a sign-in link</button>
      </div>
      {message && <div className="import-note" role="status" data-account-message>{message}</div>}
    </>}
  </section>
}

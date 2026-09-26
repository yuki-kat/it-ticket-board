import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { canSignInHere, cloud, currentSession, sendSignInLink, signOut, uploadBackup } from './cloud'
import { createBackup } from './backup'
import './backup.css'

/** Settings section: sign in with an emailed link. Data still lives in this browser until it is moved to the database. */
export default function AccountSection() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [upload, setUpload] = useState('')
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

  const send = async () => {
    setBusy(true)
    const error = await sendSignInLink(email)
    setBusy(false)
    setMessage(error ? `Could not send the link: ${error}` : `Link sent to ${email.trim()}. Open it on this device to finish signing in.`)
  }

  const copyToAccount = async () => {
    setBusy(true)
    setUpload('')
    const result = await uploadBackup(createBackup())
    setBusy(false)
    setUpload(result.ok
      ? `Copied to your account: ${result.counts.tickets} tickets, ${result.counts.deleted_tickets} deleted, ${result.counts.assets} assets, ${result.counts.stock_items} stock items, ${result.counts.settings} settings. Nothing was changed in this browser.`
      : `Could not copy: ${result.error}`)
  }

  return <section className="settings-section account-settings">
    <h3>Account</h3>
    {!available && <p data-account-unavailable>Sign-in works when the board is opened from a web address, not from a file on your computer.</p>}
    {available && session && <>
      <p>Signed in as <b data-account-email>{session.user.email}</b>. Your tickets are still saved in this browser; moving them to your account comes next.</p>
      <div className="backup-actions"><button type="button" className="primary-button" data-account-upload disabled={busy} onClick={() => void copyToAccount()}>Copy this browser’s data to my account</button></div>
      {upload && <div className="import-note" role="status" data-account-upload-message>{upload}</div>}
      <div className="backup-actions"><button type="button" className="text-button" data-account-signout onClick={() => void signOut().then(() => setSession(null))}>Sign out</button></div>
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

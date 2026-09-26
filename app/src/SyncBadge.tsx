import { useSyncStatus } from './cloudSync'
import './sync.css'

/** Top bar: where the board is saved. While syncing, it shows the sync state and opens Settings when clicked. */
export default function SyncBadge({ onOpen }: { onOpen: () => void }) {
  const sync = useSyncStatus()
  if (sync.phase === 'off') return <span className="saved"><i />Local mock data</span>
  const label = { saving: 'Saving…', saved: `Saved to ${sync.workspaceName}`, offline: 'Offline, changes kept here', error: 'Sync problem' }[sync.phase]
  const title = sync.message || (sync.lastSyncedAt ? `Last synced with ${sync.workspaceName} at ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : label)
  return <button type="button" className={`sync-badge sync-${sync.phase}`} onClick={onOpen} title={title} data-sync-badge={sync.phase} aria-live="polite"><i />{label}</button>
}

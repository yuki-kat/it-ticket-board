import { useRef, useState } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'
import Overlay from './Overlay'
import { applyBackup, countRecords, createBackup, downloadBackup, lastBackupTime, previousData, putBackPrevious, readBackupFile, type BackupCounts, type BackupFile } from '../lib/backup'
import { isSyncing, stopSync } from '../lib/cloudSync'
import '../styles/backup.css'

const summary = (counts: BackupCounts) => `${counts.tickets} tickets · ${counts.deletedTickets} deleted · ${counts.assets} assets · ${counts.stock} stock items`
const when = (iso: string) => (iso ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : 'Never')

/** Settings section: download everything in this browser as a file, or replace it from such a file. */
export default function BackupSection() {
  const [last, setLast] = useState(lastBackupTime)
  const [pending, setPending] = useState<{ name: string; backup: BackupFile } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const current = countRecords(createBackup().records)
  const [previous] = useState(previousData)
  const syncing = isSyncing()

  const choose = async (file: File | undefined) => {
    if (!file) return
    const result = await readBackupFile(file)
    if (result.ok) { setProblems([]); setPending({ name: file.name, backup: result.backup }) } else { setPending(null); setProblems(result.problems) }
    if (input.current) input.current.value = ''
  }
  // Both replace what is in this browser, so syncing stops first: nothing still on its way to the workspace
  // can then switch it back on, and the workspace keeps what it has.
  const restore = () => {
    if (!pending) return
    stopSync()
    applyBackup(pending.backup)
    window.location.reload()
  }
  const putBack = () => {
    if (!previousData()) return
    stopSync()
    putBackPrevious()
    window.location.reload()
  }

  return <section className="settings-section backup-settings">
    <h3>Backup and restore</h3>
    <p>{syncing ? 'This browser syncs with your workspace (see Account). A backup file is still a good extra copy.' : 'Everything is saved only in this browser. Download a backup file to keep a copy, or to move to another browser or computer.'}</p>
    <div className="backup-counts" data-backup-counts>{summary(current)}</div>
    <div className="backup-last" data-backup-last>Last backup: {when(last)}</div>
    <div className="backup-actions">
      <button type="button" className="primary-button" data-backup-download onClick={() => { downloadBackup(); setLast(lastBackupTime()) }}><Download size={15} /> Download backup</button>
      <button type="button" className="text-button" data-backup-restore onClick={() => input.current?.click()}><Upload size={15} /> Restore from backup…</button>
      <input ref={input} type="file" accept=".json,application/json" hidden data-backup-file onChange={(event) => void choose(event.target.files?.[0])} />
    </div>
    {previous && <div className="backup-previous" data-backup-previous>
      <span>Kept from before the last restore or sync start ({when(previous.createdAt)}): {summary(previous.counts)}.{syncing ? ' Putting it back stops syncing in this browser.' : ''}</span>
      <button type="button" className="text-button" data-backup-put-back onClick={putBack}><RotateCcw size={14} /> Put it back</button>
    </div>}
    {problems.length > 0 && <div className="form-error backup-problems" role="alert" data-backup-problems><b>This file can’t be restored. Nothing was changed.</b><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
    {pending && <Overlay className="form-overlay backup-overlay" onClose={() => setPending(null)}>
      <section className="form-panel backup-confirm" role="dialog" aria-modal="true" aria-labelledby="backup-confirm-title">
        <div className="panel-header"><div><div className="eyebrow">RESTORE</div><h2 id="backup-confirm-title">Replace everything with this backup?</h2></div></div>
        <p className="panel-intro"><b>{pending.name}</b>, made {when(pending.backup.createdAt)}</p>
        <div className="backup-compare"><div><b>In the file</b><span>{summary(pending.backup.counts)}</span></div><div><b>Here now</b><span>{summary(current)}</span></div></div>
        <div className="import-note">Restoring replaces the tickets, assets, stock and settings in this browser. Download a backup of the current data first if you might want it.{syncing ? ' This browser also stops syncing with the workspace, so the workspace is not changed.' : ''}</div>
        <div className="form-footer">
          <button type="button" className="text-button" data-backup-cancel onClick={() => setPending(null)}>Cancel</button>
          <button type="button" className="text-button" data-backup-download-current onClick={() => { downloadBackup(); setLast(lastBackupTime()) }}><Download size={14} /> Download current data first</button>
          <button type="button" className="primary-button" data-backup-confirm onClick={restore}>Restore and replace</button>
        </div>
      </section>
    </Overlay>}
  </section>
}

/**
 * Legal hold (litigation hold) for devices and tickets.
 *
 * A hold is a flag, not a status: an Assigned laptop can also be on hold. While a device is held, anything that
 * could destroy or reissue it is blocked (assign, repair, retire, and returning it into repair). Collecting it
 * (return to storage), moving it (for example to a locked cabinet) and recording it as lost stay allowed, and every
 * step is logged. A held ticket cannot be deleted.
 *
 * The board keeps its data in the browser, so this is a workflow guard and audit trail, not tamper-proof
 * preservation; records that must be legally preserved also need server-side retention.
 */
export type LegalHold = { matter: string; reason: string; placedBy: string; placedAt: string }
export type LegalHoldForm = { matter: string; reason: string; placedBy: string }
export type LegalHoldRelease = { note: string; releasedBy: string }

export const emptyHoldForm = (): LegalHoldForm => ({ matter: '', reason: '', placedBy: '' })

export function holdFormError(form: LegalHoldForm): string {
  if (!form.matter.trim()) return 'Enter the case or matter reference.'
  if (!form.reason.trim()) return 'Enter why the hold is needed.'
  if (!form.placedBy.trim()) return 'Enter who is placing the hold.'
  return ''
}

export function releaseError(release: LegalHoldRelease): string {
  if (!release.note.trim()) return 'Add a note: who authorised the release, or why the hold has ended.'
  if (!release.releasedBy.trim()) return 'Enter who is releasing the hold.'
  return ''
}

export const makeHold = (form: LegalHoldForm, at: string): LegalHold => ({ matter: form.matter.trim(), reason: form.reason.trim(), placedBy: form.placedBy.trim(), placedAt: at })

export const holdPlacedDetail = (hold: LegalHold) => `Case ${hold.matter}: ${hold.reason} (placed by ${hold.placedBy})`
export const holdReleasedDetail = (hold: LegalHold, release: LegalHoldRelease) => `Case ${hold.matter} released by ${release.releasedBy.trim()}: ${release.note.trim()}`

/** Device actions a hold blocks, with the reason shown on the disabled button. */
export const HOLD_BLOCKED_ACTIONS: Record<string, string> = {
  assign: 'On legal hold: it cannot be issued or reassigned until the hold is released.',
  repair: 'On legal hold: repairs can wipe or replace the disk.',
  retire: 'On legal hold: it cannot be retired or disposed of.',
}

export const holdBlocks = (held: { legalHold?: LegalHold }, action: string) => !!held.legalHold && action in HOLD_BLOCKED_ACTIONS

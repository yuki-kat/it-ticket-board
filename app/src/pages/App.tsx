import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BrainCircuit, Building2, Check, ChevronDown, Clock3, Download, Layers, ListChecks, LogOut, Mail, Menu, MessageSquare, Moon, Phone, Plus, RotateCcw, Search, Settings2, ShieldAlert, Sparkles, Star, Sun, Ticket, Trash2, Workflow, X } from 'lucide-react'
import Overlay from '../components/Overlay'
import BackupSection from '../components/BackupSection'
import AccountSection from '../components/AccountSection'
import SyncBadge from '../components/SyncBadge'
import { useCloudSync, startSync, stopSync } from '../lib/cloudSync'
import { useAuth } from '../contexts/AuthContext'
import type { ListName, SyncLists, SyncRecord } from '../lib/syncLogic'
import DebugPanel from '../components/DebugPanel'
import { debugLog } from '../lib/debug'
import QuickPageNav from '../components/QuickPageNav'
import { applyScreenPattern, loadScreenPattern, SCREEN_PATTERNS, type ScreenPattern } from '../lib/screenPattern'
import ViewPicker from '../components/ViewPicker'
import '../styles/quick-settings.css'
import '../styles/screen-pattern.css'
import { PopoutActions, TicketPopout } from '../components/HomePopouts'
import ExplorePage, { type ExploreQueue } from './ExplorePage'
import { parseRoute, routeHash, type ExploreKey, type PageId } from '../lib/route'
import { ArrangeInsight, InsightCard, InsightDetail, loadInsightOrder, moveInsight, saveInsightOrder, type DetailKey, type InsightContext, type InsightKey } from '../components/HomeInsights'
import InventoryPage from './InventoryPage'
import { exportAllInventory, loadAssets, loadStock, saveAssets, saveStock, type AssetItem, type InventoryCommand, type StockItem } from '../lib/inventory'
import SavedViews, { loadSavedViews, type SavedView } from '../components/SavedViews'
import { exportCsv } from '../lib/exportCsv'
import { exportXlsx } from '../lib/exportXlsx'
import SearchPage from './SearchPage'
import '../styles/search.css'
import { useDescriptionAssist, useQueueAssist, usePriorityAssist } from '../hooks/useGemini'
import GeminiSettings from '../components/GeminiSettings'
import ThemeSettings from '../components/ThemeSettings'
import { generateTicketSuggestions } from '../api/gemini'
import EscalationPage from './EscalationPage'
import CompactSLATimer from '../components/CompactSLATimer'

type Status = 'New' | 'In Progress' | 'Waiting on User' | 'Escalated' | 'Resolved'
type Severity = 'P1 – Critical' | 'P2 – High' | 'P3 – Medium' | 'P4 – Low'
type RecordType = 'Incident' | 'Problem' | 'Change Request' | 'Work Order'
type BoardBy = 'State' | 'Task type' | 'Assignment group'
type CardSize = 'small' | 'regular' | 'list' | 'split' | 'my-work'
type SplitPaneMode = 'list' | 'small' | 'regular' | 'my-work' | 'details'
type MetricFilter = 'all' | 'active' | 'resolved' | 'high-priority' | 'overdue' | 'at-risk' | 'escalated' | 'escalation-due' | 'unassigned' | 'waiting' | 'due-today'
type HomeWidgets = { status: boolean; priority: boolean; intake: boolean; recent: boolean; sla: boolean; escalation: boolean; assignment: boolean; resolution: boolean }
type TicketPaneSettings = { cardSize: CardSize; boardBy: BoardBy; query: string; typeFilter: RecordType | 'All task types'; groupFilter: string; assigneeFilter: string; metricFilter: MetricFilter; tagFilter: string; starredOnly: boolean; splitLeft: SplitPaneMode; splitRight: SplitPaneMode }
type TicketWorkspaceTab = { id: string; settings: TicketPaneSettings }
type TicketViewSettings = TicketPaneSettings & { workspaceTabs?: TicketWorkspaceTab[]; activeWorkspaceId?: string }
type TicketWorkspace = { tabs: TicketWorkspaceTab[]; activeId: string }
type UniversalTask = { id: string; title: string; assignee: string; done: boolean }
type Assessment = 'High' | 'Medium' | 'Low'
type TicketActivity = { at: string; label: string; detail?: string }
type TicketItem = {
  id: string
  recordType: RecordType
  title: string
  description: string
  requester: string
  createdBy: string
  affectedUser: string
  affectedUserEmail: string
  department: string
  assignmentGroup: string
  assignee: string
  severity: Severity
  status: Status
  dueAt: string
  notes: string
  tags: string[]
  starred: boolean
  assetId?: string
  createdAt: string
  universalTasks: UniversalTask[]
  loggedSeconds: number
  timerStartedAt: string | null
  currentTier: 1 | 2 | 3
  impact?: Assessment
  urgency?: Assessment
  resolvedAt?: string
  activity?: TicketActivity[]
}
type DeletedTicket = TicketItem & { deletedAt: string }

const statuses: Status[] = ['New', 'In Progress', 'Waiting on User', 'Escalated', 'Resolved']
const recordTypes: RecordType[] = ['Incident', 'Problem', 'Change Request', 'Work Order']
const tableNames: Record<RecordType, string> = { Incident: 'incident', Problem: 'problem', 'Change Request': 'change_request', 'Work Order': 'wm_order_task' }
const departments = ['Field Services', 'Finance', 'People & HR', 'Facilities', 'Platform Engineering', 'Commerce', 'Customer Care', 'Data & Analytics', 'Security']
const assignmentGroups = ['Service Desk', 'End User Computing', 'Infrastructure', 'Database Operations', 'Security Operations', 'Problem Management', 'Change Advisory Board', 'Field Services', 'IT Operations']
const severityRows: { level: Severity; definition: string; examples: string; response: string; resolution: string; tier2: string; tier3: string }[] = [
  { level: 'P1 – Critical', definition: 'Complete outage or major business impact; no workaround available', examples: 'Production system down, security breach, data loss', response: '15 minutes', resolution: '4 hours', tier2: '30 minutes', tier3: '1 hour' },
  { level: 'P2 – High', definition: 'Significant impact to business operations; workaround may exist', examples: 'Key feature unavailable, degraded performance for many users', response: '1 hour', resolution: '1 business day', tier2: '4 hours', tier3: '1 business day' },
  { level: 'P3 – Medium', definition: 'Limited impact; single user or non-critical function affected', examples: 'Minor bug, single user access issue', response: '4 hours', resolution: '3 business days', tier2: '1 business day', tier3: '3 business days' },
  { level: 'P4 – Low', definition: 'Minimal impact; cosmetic issue or general question', examples: 'How-to question, cosmetic UI issue', response: '1 business day', resolution: '5 business days', tier2: '3 business days', tier3: '5 business days' },
]
const tierRows = [
  { tier: 'Tier 1', role: 'Helpdesk / Frontline Support', when: 'Initial contact', name: 'Tier 1 contact (placeholder)', email: 'tier1@example.com', phone: 'Not provided' },
  { tier: 'Tier 2', role: 'IT Team Lead / Manager', when: '30 minutes past SLA', name: 'Tier 2 contact (placeholder)', email: 'tier2@example.com', phone: 'Not provided' },
  { tier: 'Tier 3', role: 'IT Director / Head of IT', when: '2 hours past SLA', name: 'Tier 3 contact (placeholder)', email: 'tier3@example.com', phone: 'Not provided' },
]
const STORAGE_KEY = 'it-ticket-kanban-v1'
const DELETED_STORAGE_KEY = 'it-ticket-kanban-deleted-v1'
const VIEW_STORAGE_KEY = 'it-ticket-kanban-view-v1'
const HOME_WIDGETS_STORAGE_KEY = 'it-ticket-kanban-home-widgets-v1'
const SAVED_TICKET_VIEWS_KEY = 'it-ticket-kanban-saved-views-v1'
const TICKET_WORKSPACE_KEY = 'it-ticket-kanban-ticket-workspace-v1'
const defaultHomeWidgets: HomeWidgets = { status: true, priority: true, intake: true, recent: true, sla: true, escalation: true, assignment: true, resolution: true }
// The compiled page kept the switches for its four extra cards under this key; use them until they are saved under the key above.
const LEGACY_EXTRA_INSIGHTS_KEY = 'ops-kanban-extra-home-insights-v1'
function loadHomeWidgets(): HomeWidgets {
  const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
  return { ...defaultHomeWidgets, ...read(LEGACY_EXTRA_INSIGHTS_KEY), ...read(HOME_WIDGETS_STORAGE_KEY) }
}
const viewModes: CardSize[] = ['small', 'regular', 'list', 'split', 'my-work']
const splitPaneModes: SplitPaneMode[] = ['list', 'details', 'small', 'regular', 'my-work']
const newTicketWorkspaceId = () => `ticket-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const defaultTicketPane = (): TicketPaneSettings => ({ cardSize: 'list', boardBy: 'State', query: '', typeFilter: 'All task types', groupFilter: 'All groups', assigneeFilter: 'All assignees', metricFilter: 'all', tagFilter: 'All tags', starredOnly: false, splitLeft: 'list', splitRight: 'details' })
function loadTicketWorkspace(): TicketWorkspace {
  try {
    const saved = JSON.parse(localStorage.getItem(TICKET_WORKSPACE_KEY) || 'null')
    const tabs: TicketWorkspaceTab[] = Array.isArray(saved?.tabs) ? saved.tabs.filter((item: unknown): item is TicketWorkspaceTab => !!item && typeof item === 'object' && typeof (item as TicketWorkspaceTab).id === 'string' && !!(item as TicketWorkspaceTab).settings && typeof (item as TicketWorkspaceTab).settings === 'object').map((item: TicketWorkspaceTab) => ({ id: item.id, settings: { ...defaultTicketPane(), ...item.settings, cardSize: viewModes.includes(item.settings.cardSize) ? item.settings.cardSize : 'list', splitLeft: splitPaneModes.includes(item.settings.splitLeft) ? item.settings.splitLeft : 'list', splitRight: splitPaneModes.includes(item.settings.splitRight) ? item.settings.splitRight : 'details' } })) : []
    if (tabs.length) return { tabs, activeId: tabs.some((item) => item.id === saved.activeId) ? saved.activeId : tabs[0].id }
  } catch { /* Fall back to one ticket tab. */ }
  const id = newTicketWorkspaceId()
  const settings = defaultTicketPane()
  const oldView = localStorage.getItem(VIEW_STORAGE_KEY) as CardSize
  const oldLeft = localStorage.getItem('it-ticket-split-left-v1') as SplitPaneMode
  const oldRight = localStorage.getItem('it-ticket-split-right-v1') as SplitPaneMode
  if (viewModes.includes(oldView)) settings.cardSize = oldView
  if (splitPaneModes.includes(oldLeft)) settings.splitLeft = oldLeft
  if (splitPaneModes.includes(oldRight)) settings.splitRight = oldRight
  return { tabs: [{ id, settings }], activeId: id }
}
function normalizeSavedTicketView(view: SavedView<TicketViewSettings>): SavedView<TicketViewSettings> {
  const pane: TicketPaneSettings = { ...defaultTicketPane(), ...view.settings }
  const tabs = Array.isArray(view.settings.workspaceTabs) && view.settings.workspaceTabs.length ? view.settings.workspaceTabs.map((item) => ({ ...item, settings: { ...defaultTicketPane(), ...item.settings } })) : [{ id: `saved-${view.id}`, settings: pane }]
  const activeId = tabs.some((item) => item.id === view.settings.activeWorkspaceId) ? view.settings.activeWorkspaceId : tabs[0].id
  return { ...view, settings: { ...pane, workspaceTabs: tabs, activeWorkspaceId: activeId } }
}
const assessmentLevels: Assessment[] = ['High', 'Medium', 'Low']
const parseTicketTags = (value: string) => [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)

function recordActivity(previous: TicketItem | undefined, ticket: TicketItem): TicketItem {
  const at = new Date().toISOString()
  if (!previous) return { ...ticket, activity: ticket.activity || [] }
  const activity: TicketActivity[] = []
  const fields: [keyof TicketItem, string][] = [
    ['status', 'State'], ['recordType', 'Task type'], ['assignmentGroup', 'Assignment group'],
    ['assignee', 'Assigned to'], ['currentTier', 'Escalation tier'], ['severity', 'Priority'],
    ['impact', 'Impact'], ['urgency', 'Urgency'], ['title', 'Short description'], ['description', 'Description'],
    ['department', 'Department'], ['requester', 'Requested by'], ['affectedUser', 'Affected user'],
    ['dueAt', 'Task due date'], ['notes', 'Work notes'], ['assetId', 'Linked asset'],
  ]
  for (const [field, label] of fields) {
    if (previous[field] !== ticket[field]) activity.push({ at, label: `${label} updated`, detail: `${previous[field] || 'Not set'} → ${ticket[field] || 'Not set'}` })
  }
  if (JSON.stringify(previous.universalTasks) !== JSON.stringify(ticket.universalTasks)) activity.push({ at, label: 'Follow-up tasks updated', detail: `${ticket.universalTasks.filter((task) => task.done).length} of ${ticket.universalTasks.length} complete` })
  if (JSON.stringify(previous.tags || []) !== JSON.stringify(ticket.tags || [])) activity.push({ at, label: 'Tags updated', detail: ticket.tags.length ? ticket.tags.join(', ') : 'Tags cleared' })
  if (previous.timerStartedAt !== ticket.timerStartedAt) activity.push({ at, label: ticket.timerStartedAt ? 'Work timer started' : 'Work timer stopped' })
  if (!activity.length) return ticket
  return { ...ticket, resolvedAt: previous.status !== ticket.status ? ticket.status === 'Resolved' ? at : undefined : ticket.resolvedAt, activity: [...(ticket.activity || []), ...activity] }
}
const sevClass = (s: Severity) => s.startsWith('P1') ? 'p1' : s.startsWith('P2') ? 'p2' : s.startsWith('P3') ? 'p3' : 'p4'
const resolutionSearchUrl = (title: string) => `https://www.google.com/search?${new URLSearchParams({ q: `"${title}" resolution fix troubleshooting` }).toString()}`
const emptyForm = { id: '', recordType: 'Incident' as RecordType, title: '', description: '', requester: '', createdBy: '', affectedUser: '', affectedUserEmail: '', department: 'Field Services', assignmentGroup: '', assignee: '', severity: 'P3 – Medium' as Severity, dueAt: '', notes: '', assetId: '', tagsText: '' }

function suggestGroup(recordType: RecordType, severity: Severity, text: string) {
  const value = text.toLowerCase()
  if (recordType === 'Change Request') return 'Change Advisory Board'
  if (recordType === 'Problem') return 'Problem Management'
  if (recordType === 'Work Order') return 'Field Services'
  if (/security|phish|malware|breach/.test(value)) return 'Security Operations'
  if (/database|replication|server|network|production/.test(value)) return severity.startsWith('P1') ? 'Database Operations' : 'Infrastructure'
  if (/laptop|access|account|password|device/.test(value)) return 'End User Computing'
  if (severity.startsWith('P1')) return 'IT Operations'
  return 'Service Desk'
}

function departmentFor(requester: string, title: string) {
  const text = `${requester} ${title}`.toLowerCase()
  if (/finance|month-end|payroll/.test(text)) return 'Finance'
  if (/people systems|hr services|new starter/.test(text)) return 'People & HR'
  if (/facilities|access point|cooling alert/.test(text)) return 'Facilities'
  if (/platform engineering|api credentials|monitoring agent|infrastructure/.test(text)) return 'Platform Engineering'
  if (/commerce|order sync/.test(text)) return 'Commerce'
  if (/customer care|account lockout/.test(text)) return 'Customer Care'
  if (/data platform|database|replication/.test(text)) return 'Data & Analytics'
  if (/security|suspicious attachment/.test(text)) return 'Security'
  if (/vpn|laptop|shared drive|calendar sharing|printer|email/.test(text)) return 'Field Services'
  return 'Field Services'
}

function resolutionTargetMs(severity: Severity) {
  if (severity.startsWith('P1')) return 4 * 60 * 60_000
  if (severity.startsWith('P2')) return 24 * 60 * 60_000
  if (severity.startsWith('P3')) return 72 * 60 * 60_000
  return 120 * 60 * 60_000
}

function slaTime(ticket: TicketItem, now: number) {
  const deadline = new Date(ticket.createdAt).getTime() + resolutionTargetMs(ticket.severity)
  const delta = deadline - now
  const minutes = Math.floor(Math.abs(delta) / 60_000)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  const remainingMinutes = minutes % 60
  const duration = days ? `${days}d ${hours}h` : `${hours}h ${remainingMinutes}m`
  return { deadline, label: delta < 0 ? `${duration} over` : `${duration} left`, breached: delta < 0 }
}

function slaAtRisk(ticket: TicketItem, now: number) {
  const { deadline, breached } = slaTime(ticket, now)
  return ticket.status !== 'Resolved' && !breached && deadline - now <= resolutionTargetMs(ticket.severity) * 0.25
}

function escalationDue(ticket: TicketItem, now: number) {
  if (ticket.status === 'Resolved' || ticket.currentTier >= 3) return false
  const nextTier = (ticket.currentTier + 1) as 2 | 3
  return now - new Date(ticket.createdAt).getTime() >= escalationTargetMs(ticket.severity, nextTier)
}

function dueTodayOrLate(ticket: TicketItem, now: number) {
  if (!ticket.dueAt || ticket.status === 'Resolved') return false
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  return new Date(ticket.dueAt).getTime() <= endOfToday.getTime()
}

function nextAction(ticket: TicketItem, now: number) {
  if (ticket.status === 'Resolved') return 'Confirm the fix with the affected user.'
  if (ticket.status === 'Waiting on User') return 'Follow up with the requester and record the next check-in.'
  if (ticket.status === 'Escalated') return `Coordinate with Tier ${ticket.currentTier} and keep the requester updated.`
  if (slaTime(ticket, now).breached) return 'Resolution SLA breached. Escalate using the matrix and update the requester.'
  if (ticket.severity.startsWith('P1')) return 'Assign an incident lead, confirm impact, and set the next update time.'
  if (ticket.status === 'New') return 'Confirm impact and assign an owner.'
  return 'Continue investigation; escalate when the matrix threshold is reached.'
}

function escalationTargetMs(severity: Severity, nextTier: 2 | 3) {
  const value = severity.slice(0, 2)
  const minutes: Record<string, [number, number]> = { P1: [30, 60], P2: [240, 1440], P3: [1440, 4320], P4: [4320, 7200] }
  return minutes[value][nextTier - 2] * 60_000
}

function elapsedLabel(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${rest}m` : `${rest}m`
}

function loggedSecondsNow(ticket: TicketItem, now: number) {
  return ticket.loggedSeconds + (ticket.timerStartedAt ? Math.max(0, Math.floor((now - new Date(ticket.timerStartedAt).getTime()) / 1000)) : 0)
}

function loggedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

function triageSuggestion(title: string, description: string, currentSeverity: Severity) {
  const text = `${title} ${description}`.toLowerCase()
  let recordType: RecordType = 'Incident'
  let severity = currentSeverity
  let reason = 'No strong keywords found; keep the selected type and priority.'
  if (/change request|planned change|deploy|deployment|release|migration/.test(text)) {
    recordType = 'Change Request'
    reason = 'Change or deployment wording suggests a planned change record.'
  } else if (/repeat|recurring|systemic|root cause|keeps happening/.test(text)) {
    recordType = 'Problem'
    reason = 'Recurring or root-cause wording suggests a problem record.'
  } else if (/repair|facilities|building|equipment/.test(text)) {
    recordType = 'Work Order'
    reason = 'Repair or facilities wording suggests a work order.'
  } else if (/security breach|ransomware|malware|production down|complete outage|data loss/.test(text)) {
    severity = 'P1 – Critical'
    reason = 'Critical-impact wording suggests an incident that needs urgent review.'
  }
  if (/security breach|ransomware|malware|production down|complete outage|data loss/.test(text)) severity = 'P1 – Critical'
  const group = suggestGroup(recordType, severity, text)
  return { recordType, severity, group, reason }
}

function parseEmailField(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, 'im'))?.[1]?.trim() || ''
}

function parseIncomingEmail(text: string) {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  const subject = parseEmailField(normalized, 'Subject')
  const id = parseEmailField(normalized, 'Task number') || parseEmailField(normalized, 'Ticket number')
  const sender = parseEmailField(normalized, 'From')
  const issue = parseEmailField(normalized, 'Issue') || parseEmailField(normalized, 'Short description') || parseEmailField(normalized, 'Title')
  const requester = parseEmailField(normalized, 'Requester')
  const assignee = parseEmailField(normalized, 'Assigned to') || parseEmailField(normalized, 'Assignee')
  const affectedUser = parseEmailField(normalized, 'Affected user')
  const affectedUserEmail = parseEmailField(normalized, 'Affected user email') || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(affectedUser) ? affectedUser : '')
  const department = parseEmailField(normalized, 'Department') || 'Field Services'
  const priorityText = parseEmailField(normalized, 'Priority') || parseEmailField(normalized, 'Severity')
  const priorityCode = priorityText.match(/\bP([1-4])\b/i)?.[1]
  const priorityNames: Record<string, Severity> = { '1': 'P1 – Critical', '2': 'P2 – High', '3': 'P3 – Medium', '4': 'P4 – Low' }
  const severity = priorityNames[priorityCode || ''] || emptyForm.severity
  const typeText = parseEmailField(normalized, 'Record type') || parseEmailField(normalized, 'Task type')
  const recordType = recordTypes.find((type) => type.toLowerCase() === typeText.toLowerCase()) || 'Incident'
  const senderMatch = sender.match(/^(.*?)\s*<([^>]+)>$/)
  const senderName = (senderMatch?.[1] || '').replace(/^['"]|['"]$/g, '').trim()
  const senderEmail = senderMatch?.[2] || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) ? sender : '')
  const createdBy = parseEmailField(normalized, 'Created by') || senderName || senderEmail
  const title = issue || subject.replace(/^\s*(re|fwd?)\s*:\s*/i, '').replace(/^\s*\[[^\]]*\]\s*/, '').trim()
  const description = normalized
  const details = `${title} ${description} ${parseEmailField(normalized, 'Impact')}`
  const groupText = parseEmailField(normalized, 'Assignment group') || parseEmailField(normalized, 'Assignment group suggestion')
  const explicitGroup = assignmentGroups.find((group) => group.toLowerCase() === groupText.toLowerCase())
  const assignmentGroup = explicitGroup || suggestGroup(recordType, severity, details)
  const dueText = parseEmailField(normalized, 'Next due') || parseEmailField(normalized, 'Due date')
  const dueDate = dueText && !/^\d{4}-\d{2}-\d{2}$/.test(dueText) ? new Date(dueText) : null
  const dueAt = dueDate && !Number.isNaN(dueDate.getTime()) ? `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}T${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}` : ''
  return {
    id,
    title,
    description,
    assignee,
    requester: requester || senderName || senderEmail,
    createdBy,
    affectedUser,
    affectedUserEmail,
    department,
    severity,
    recordType,
    assignmentGroup,
    dueAt,
    notes: parseEmailField(normalized, 'Work notes') || parseEmailField(normalized, 'Notes'),
  }
}

function makeSampleTickets(): TicketItem[] {
  const now = Date.now()
  const due = (minutes: number) => new Date(now + minutes * 60_000).toISOString()
  const create = (id: string, recordType: RecordType, title: string, requester: string, assignmentGroup: string, assignee: string, severity: Severity, status: Status, dueMinutes: number, description: string, notes = '', universalTasks: UniversalTask[] = [], loggedSeconds = 0, currentTier: 1 | 2 | 3 = status === 'Escalated' ? 2 : 1, affectedUser = ''): TicketItem => ({ id, recordType, title, requester, createdBy: '', affectedUser, affectedUserEmail: '', department: departmentFor(requester, title), assignmentGroup, assignee, severity, status, dueAt: due(dueMinutes), description, notes, tags: [], starred: false, createdAt: new Date(now - Math.abs(dueMinutes + 45) * 60_000).toISOString(), universalTasks, loggedSeconds, timerStartedAt: null, currentTier })
  return [
    create('OPS-101', 'Incident', 'Production database replication lag', 'Data Platform', 'Database Operations', 'Jordan Lee', 'P1 – Critical', 'Escalated', -14, 'Replication lag on the primary read replica is affecting reporting.', 'Mock: monitoring alert fired; root cause under investigation.', [{ id: 'UT-101', title: 'Share the latest replication metrics', assignee: 'Data Platform', done: false }], 840, 2),
    create('OPS-102', 'Incident', 'VPN sign-in failing for remote staff', 'Mina Sato', 'End User Computing', 'Avery Chen', 'P2 – High', 'In Progress', 38, 'Several remote users cannot complete VPN sign-in.', 'Identity team is checking the conditional access policy.'),
    create('OPS-103', 'Incident', 'Suspicious attachment reported', 'Finance team', 'Security Operations', 'Sam Rivera', 'P1 – Critical', 'New', 21, 'A user reported a suspicious attachment in a supplier email.', 'Mock ticket: security review requested.'),
    create('OPS-104', 'Problem', 'Recurring time-out in month-end reports', 'Finance Ops', 'Problem Management', 'Noah Williams', 'P2 – High', 'In Progress', 156, 'Month-end reports time out intermittently under peak load.', 'Investigating the common cause across three incidents.'),
    create('OPS-105', 'Incident', 'Shared drive access denied', 'Keiko Mori', 'End User Computing', 'Mina Patel', 'P3 – Medium', 'New', 480, 'One employee lost access to the shared planning folder.', 'Requester needs access before tomorrow’s review.'),
    create('OPS-106', 'Change Request', 'Deploy payroll connector update', 'People Systems', 'Change Advisory Board', 'Eli Turner', 'P2 – High', 'Waiting on User', 635, 'Planned update to the payroll connector with a rollback plan.', 'Waiting for the business owner to confirm the window.'),
    create('OPS-107', 'Incident', 'Laptop camera not detected', 'Daniel Kim', 'End User Computing', 'Priya Nair', 'P4 – Low', 'New', 1120, 'Camera is missing from meeting applications after restart.'),
    create('OPS-108', 'Work Order', 'Replace access point in west wing', 'Facilities', 'Field Services', 'Riley Brooks', 'P3 – Medium', 'In Progress', 355, 'Replace the unstable wireless access point near meeting rooms.', 'Parts request submitted.'),
    create('OPS-109', 'Problem', 'Intermittent order sync delays', 'Commerce Ops', 'Problem Management', 'Jordan Lee', 'P2 – High', 'Escalated', 96, 'Order updates arrive late during peak periods.', 'Comparing queue and database traces.'),
    create('OPS-110', 'Incident', 'New starter cannot access email', 'HR Services', 'End User Computing', 'Avery Chen', 'P3 – Medium', 'Waiting on User', 220, 'New employee cannot sign in to email on their first day.', 'Waiting for manager to confirm the correct account name.'),
    create('OPS-111', 'Change Request', 'Rotate API credentials', 'Platform Engineering', 'Change Advisory Board', 'Morgan Diaz', 'P1 – Critical', 'In Progress', 182, 'Planned credential rotation for a production integration.', 'Change window approved; final checklist in progress.'),
    create('OPS-112', 'Incident', 'Printer queue stuck on level 4', 'Kenji Watanabe', 'Service Desk', 'Taylor Quinn', 'P4 – Low', 'Resolved', -380, 'Print jobs remain queued at the level 4 shared printer.', 'Queue cleared and a test page printed.'),
    create('OPS-113', 'Problem', 'Repeated account lockouts', 'Customer Care', 'Problem Management', 'Sam Rivera', 'P2 – High', 'New', 275, 'Multiple agents are being locked out several times a day.', 'Need sign-in event samples to isolate the source.', [{ id: 'UT-113', title: 'Send a screenshot of the lockout prompt', assignee: 'Customer Care', done: false }]),
    create('OPS-114', 'Work Order', 'Inspect cooling alert in server room', 'IT Operations', 'Field Services', 'Riley Brooks', 'P1 – Critical', 'In Progress', 64, 'Temperature alert reported in the secondary server room.', 'On-site inspection is in progress.'),
    create('OPS-115', 'Incident', 'Calendar sharing permission missing', 'Aiko Tanaka', 'End User Computing', 'Mina Patel', 'P3 – Medium', 'Resolved', -95, 'Team calendar is no longer visible to one member.', 'Permission restored and requester confirmed.'),
    create('OPS-116', 'Change Request', 'Upgrade monitoring agent fleet', 'Infrastructure', 'Change Advisory Board', 'Noah Williams', 'P2 – High', 'Waiting on User', 900, 'Schedule the monitoring agent upgrade across production hosts.', 'Waiting for service owners to confirm maintenance windows.'),
    create('OPS-117', 'Incident', 'Backup job failed on vault-02', 'IT Operations', 'Database Operations', 'Jordan Lee', 'P1 – Critical', 'In Progress', 45, 'Nightly backup job failed due to disk space on vault-02.', 'Expanded disk and re-running backup.'),
    create('OPS-118', 'Incident', 'Slack notification delays', 'Platform Engineering', 'Infrastructure', 'Avery Chen', 'P3 – Medium', 'New', 180, 'Webhook notifications from internal tools are arriving 30+ minutes late.', 'Checking queue depth and retry policy.'),
    create('OPS-119', 'Work Order', 'Install additional network cables', 'Facilities', 'Field Services', 'Riley Brooks', 'P3 – Medium', 'In Progress', 240, 'Run Cat6 cables to the new department area on floor 3.', 'Cable run completed; awaiting final testing.'),
    create('OPS-120', 'Incident', 'Excel pivot table timeout', 'Finance', 'Database Operations', 'Morgan Diaz', 'P2 – High', 'New', 120, 'Users report Excel pivot tables timing out on the data warehouse.', 'Query optimization in progress.'),
    create('OPS-121', 'Problem', 'Chrome updates breaking extensions', 'End User Computing', 'End User Computing', 'Priya Nair', 'P3 – Medium', 'New', 480, 'Several business-critical extensions stopped working after latest Chrome.', 'Checking extension compatibility and developer releases.'),
    create('OPS-122', 'Change Request', 'Deploy new SSO provider config', 'People Systems', 'Change Advisory Board', 'Eli Turner', 'P2 – High', 'In Progress', 340, 'Deploy updated Okta configuration with MFA enforcement.', 'Testing in staging; rollout scheduled for next week.'),
    create('OPS-123', 'Incident', 'Intermittent DNS failures', 'Infrastructure', 'Infrastructure', 'Noah Williams', 'P1 – Critical', 'Escalated', 60, 'DNS query timeouts affecting multiple offices across the globe.', 'Investigating cache coherency between DNS servers.', [], 1200, 2),
    create('OPS-124', 'Incident', 'Mobile app crashing on login', 'Commerce Ops', 'Problem Management', 'Sam Rivera', 'P1 – Critical', 'New', 15, 'iOS and Android app crashing immediately after entering credentials.', 'Hotfix in review; potential rollback of v3.2.1 pending.'),
    create('OPS-125', 'Work Order', 'Audit network access logs', 'Security', 'Field Services', 'Taylor Quinn', 'P2 – High', 'In Progress', 1800, 'Security audit requires network access logs for the past 90 days.', 'Logs extracted and forwarded to auditors.'),
    create('OPS-126', 'Incident', 'Inventory sync missing items', 'Commerce Ops', 'Problem Management', 'Jordan Lee', 'P2 – High', 'Waiting on User', 90, 'Overnight sync missing 200+ items from the warehouse system.', 'Waiting for warehouse team to confirm item count.'),
    create('OPS-127', 'Change Request', 'Patch Windows Server 2019 fleet', 'Infrastructure', 'Change Advisory Board', 'Morgan Diaz', 'P3 – Medium', 'Waiting on User', 1200, 'Monthly security patches for 45 Windows Server instances.', 'Waiting for maintenance window approval from service owners.'),
    create('OPS-128', 'Incident', 'Payroll batch processing slow', 'People Systems', 'Database Operations', 'Avery Chen', 'P1 – Critical', 'In Progress', 75, 'Payroll batch processing taking 3x longer than normal.', 'Identified slow-running queries; optimization in progress.'),
    create('OPS-129', 'Problem', 'Document upload failures intermittent', 'Platform Engineering', 'Infrastructure', 'Priya Nair', 'P2 – High', 'New', 210, 'File uploads fail intermittently; no error in UI.', 'Checking S3 connection limits and CDN.'),
    create('OPS-130', 'Incident', 'Email forwarding rule not working', 'Customer Care', 'Service Desk', 'Riley Brooks', 'P3 – Medium', 'New', 360, 'Emails to support address not being forwarded to team inbox.', 'Checking mail routing rules.'),
    create('OPS-131', 'Work Order', 'Replace faulty UPS unit', 'IT Operations', 'Field Services', 'Taylor Quinn', 'P1 – Critical', 'In Progress', 120, 'UPS in server room showing battery warnings; replacement unit ordered.', 'Replacement unit arrived; installation in progress.'),
    create('OPS-132', 'Incident', 'Conference room booking conflict', 'Facilities', 'Service Desk', 'Mina Patel', 'P4 – Low', 'New', 600, 'Meeting room double-booked for tomorrows presentation.', 'Checking room availability and calendar system.'),
    create('OPS-133', 'Change Request', 'Enable encrypted storage buckets', 'Security', 'Change Advisory Board', 'Sam Rivera', 'P2 – High', 'In Progress', 480, 'Enforce encryption on all S3 buckets.', 'Encryption enabled on test buckets; production roll-out in progress.'),
    create('OPS-134', 'Problem', 'API rate limiting too strict', 'Commerce Ops', 'Infrastructure', 'Noah Williams', 'P2 – High', 'Escalated', 145, 'External partners hitting rate limits during normal traffic.', 'Reviewing limits; possibly increasing for partner tier.'),
    create('OPS-135', 'Incident', 'Expired SSL certificate on subdomain', 'Infrastructure', 'Infrastructure', 'Morgan Diaz', 'P1 – Critical', 'New', 5, 'api.example.com certificate expired; blocking API calls.', 'Emergency certificate renewal in progress.'),
    create('OPS-136', 'Work Order', 'Install software license keys', 'End User Computing', 'Field Services', 'Riley Brooks', 'P3 – Medium', 'In Progress', 420, 'Deploy new CAD software licenses to engineering department.', '15 of 20 installations completed.'),
    create('OPS-137', 'Incident', 'Database replication broken', 'Data & Analytics', 'Database Operations', 'Jordan Lee', 'P1 – Critical', 'Escalated', 30, 'Replica is hours behind; reporting queries failing.', 'Investigating network connectivity and binlog position.', [], 2100, 2),
    create('OPS-138', 'Incident', 'VPN latency increased 10x', 'Infrastructure', 'Infrastructure', 'Avery Chen', 'P2 – High', 'In Progress', 75, 'Remote users experiencing extreme VPN slowness.', 'Load balancing misconfigured; being reset.'),
    create('OPS-139', 'Change Request', 'Implement log aggregation tool', 'Platform Engineering', 'Change Advisory Board', 'Eli Turner', 'P3 – Medium', 'Waiting on User', 2880, 'Deploy ELK stack for centralized log management.', 'Waiting for platform team to schedule infrastructure work.'),
    create('OPS-140', 'Incident', 'User cannot access shared OneDrive', 'Keiko Mori', 'End User Computing', 'Priya Nair', 'P3 – Medium', 'New', 240, 'Access denied error when opening team OneDrive folder.', 'Checking OneDrive permissions and O365 sync.'),
    create('OPS-141', 'Problem', 'Memory leak in background service', 'Platform Engineering', 'Problem Management', 'Sam Rivera', 'P2 – High', 'In Progress', 300, 'Background worker process consuming 100% memory after 72 hours.', 'Debugged and identified leak; fix in testing.'),
    create('OPS-142', 'Incident', 'Git push rejections', 'Platform Engineering', 'Infrastructure', 'Noah Williams', 'P1 – Critical', 'New', 20, 'Developers unable to push code; all pushes rejected by hooks.', 'Git server pre-receive hook misconfigured; restoring config.'),
    create('OPS-143', 'Work Order', 'Reconfigure HVAC schedule', 'Facilities', 'Field Services', 'Riley Brooks', 'P3 – Medium', 'New', 1440, 'Adjust HVAC for new operating hours starting next week.', 'Waiting for facilities team to perform reconfiguration.'),
    create('OPS-144', 'Incident', 'Kanban board data loss', 'Platform Engineering', 'Problem Management', 'Morgan Diaz', 'P1 – Critical', 'Escalated', 10, 'Database corruption; losing ticket assignments and status changes.', 'Restoring from latest backup; data loss from past 6 hours.', [], 1800, 2),
    create('OPS-145', 'Change Request', 'Deprecate legacy REST API', 'Platform Engineering', 'Change Advisory Board', 'Eli Turner', 'P2 – High', 'Waiting on User', 7200, 'Sunset old REST endpoints and migrate clients to GraphQL.', 'Waiting for client teams to confirm migration timeline.'),
    create('OPS-146', 'Incident', 'Export feature broken in reports', 'Commerce Ops', 'Service Desk', 'Avery Chen', 'P2 – High', 'New', 120, 'PDF export button not working in reporting dashboard.', 'Checking permissions on export service.'),
    create('OPS-147', 'Problem', 'Kubernetes pod evictions', 'Infrastructure', 'Infrastructure', 'Priya Nair', 'P2 – High', 'In Progress', 180, 'Production pods being evicted due to insufficient memory.', 'Analyzing memory requests; scaling cluster.'),
    create('OPS-148', 'Incident', 'Two-factor authentication down', 'Security', 'Security Operations', 'Sam Rivera', 'P1 – Critical', 'In Progress', 45, '2FA service unavailable; users locked out of systems.', 'Failover active; investigating primary service.'),
    create('OPS-149', 'Work Order', 'Upgrade RAID battery backup', 'IT Operations', 'Field Services', 'Taylor Quinn', 'P2 – High', 'Waiting on User', 840, 'RAID backup battery near end-of-life; replacement scheduled.', 'Waiting for maintenance window approval.'),
    create('OPS-150', 'Incident', 'Slow dashboard queries', 'Data & Analytics', 'Database Operations', 'Jordan Lee', 'P2 – High', 'In Progress', 240, 'Executive dashboard queries taking 45+ seconds.', 'Adding indexes; query optimization in progress.'),
    create('OPS-151', 'Change Request', 'Enable CORS headers', 'Platform Engineering', 'Change Advisory Board', 'Morgan Diaz', 'P3 – Medium', 'In Progress', 120, 'Configure CORS headers to allow cross-origin requests.', 'Testing in staging; deployment scheduled tomorrow.'),
    create('OPS-152', 'Problem', 'Recurring session timeouts', 'Customer Care', 'Problem Management', 'Noah Williams', 'P3 – Medium', 'New', 360, 'Sessions timing out after 15 minutes of inactivity.', 'Investigating session timeout configuration.'),
    create('OPS-153', 'Incident', 'File upload size limit exceeded', 'Finance', 'Service Desk', 'Mina Patel', 'P3 – Medium', 'Waiting on User', 180, 'User unable to upload monthly tax documents; file too large.', 'Waiting for user to compress or split the file.'),
    create('OPS-154', 'Work Order', 'Clean up old application logs', 'Data & Analytics', 'Field Services', 'Riley Brooks', 'P4 – Low', 'New', 2880, 'Archive and delete logs older than 1 year.', 'Waiting for approval and maintenance window.'),
    create('OPS-155', 'Incident', 'Chat notification spam', 'Platform Engineering', 'Infrastructure', 'Avery Chen', 'P2 – High', 'New', 90, 'Chat system sending duplicate notifications to all users.', 'Investigating message queue and notification service.'),
    create('OPS-156', 'Change Request', 'Implement request signing', 'Security', 'Change Advisory Board', 'Sam Rivera', 'P1 – Critical', 'Waiting on User', 480, 'Add HMAC signing to external API requests.', 'Waiting for architecture review approval.'),
    create('OPS-157', 'Problem', 'Frequent token refresh failures', 'Platform Engineering', 'Problem Management', 'Morgan Diaz', 'P2 – High', 'In Progress', 210, 'Authentication token refresh failing intermittently.', 'Debugging token service and cache layer.'),
    create('OPS-158', 'Incident', 'Report generation OOM', 'Data & Analytics', 'Database Operations', 'Priya Nair', 'P1 – Critical', 'New', 30, 'Large report generation causing out-of-memory errors.', 'Implement streaming response; testing fix.'),
    create('OPS-159', 'Work Order', 'Migrate database to new server', 'IT Operations', 'Field Services', 'Taylor Quinn', 'P1 – Critical', 'In Progress', 960, 'Move production database to new hardware.', 'Data migration 80% complete; validation in progress.'),
    create('OPS-160', 'Incident', 'Inconsistent test results', 'Platform Engineering', 'Infrastructure', 'Noah Williams', 'P2 – High', 'New', 300, 'CI/CD tests passing/failing intermittently for same code.', 'Investigating test flakiness and race conditions.'),
    create('OPS-161', 'Change Request', 'Update privacy policy', 'People Systems', 'Change Advisory Board', 'Eli Turner', 'P3 – Medium', 'Waiting on User', 5040, 'Update privacy policy for GDPR compliance.', 'Waiting for legal review approval.'),
    create('OPS-162', 'Problem', 'Batch job running overtime', 'Data & Analytics', 'Problem Management', 'Jordan Lee', 'P2 – High', 'In Progress', 480, 'Nightly batch job now taking 8+ hours instead of 4.', 'Optimizing slow-running queries.'),
    create('OPS-163', 'Incident', 'Search results inconsistent', 'Commerce Ops', 'Database Operations', 'Sam Rivera', 'P2 – High', 'New', 150, 'Search index out of sync with database.', 'Rebuilding search index.'),
    create('OPS-164', 'Incident', 'Third-party service down', 'Platform Engineering', 'Infrastructure', 'Avery Chen', 'P1 – Critical', 'Escalated', 50, 'Payment gateway API returning 503 errors.', 'Monitoring third-party status page; retrying failed transactions.', [], 900, 2),
    create('OPS-165', 'Work Order', 'Install antivirus updates', 'Security', 'Field Services', 'Riley Brooks', 'P3 – Medium', 'In Progress', 180, 'Deploy latest antivirus definitions to all workstations.', 'Rolled out to 80 of 120 machines.'),
    create('OPS-166', 'Incident', 'Configuration drift detected', 'Infrastructure', 'Infrastructure', 'Morgan Diaz', 'P2 – High', 'New', 420, 'Production servers have drifted from standard configuration.', 'Documenting changes and planning remediation.'),
  ]
}

function loadTickets(): TicketItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return makeSampleTickets()
    const parsed = JSON.parse(saved) as Partial<TicketItem>[]
    if (!Array.isArray(parsed)) return makeSampleTickets()
    return parsed.map((ticket) => ({ ...ticket, recordType: recordTypes.includes(ticket.recordType as RecordType) ? ticket.recordType as RecordType : 'Incident', description: ticket.description || ticket.notes || '', createdBy: ticket.createdBy || '', affectedUser: ticket.affectedUser || '', affectedUserEmail: ticket.affectedUserEmail || '', department: ticket.department || departmentFor(ticket.requester || '', ticket.title || ''), assignmentGroup: ticket.assignmentGroup || 'Service Desk', createdAt: ticket.createdAt || new Date().toISOString(), tags: Array.isArray(ticket.tags) ? ticket.tags : [], starred: Boolean(ticket.starred), universalTasks: Array.isArray(ticket.universalTasks) ? ticket.universalTasks : [], loggedSeconds: Number(ticket.loggedSeconds) || 0, timerStartedAt: ticket.timerStartedAt || null, currentTier: (ticket.currentTier || (ticket.status === 'Escalated' ? 2 : 1)) as 1 | 2 | 3 } as TicketItem))
  } catch {
    return makeSampleTickets()
  }
}

/**
 * Main application component for IT Ticket Board.
 *
 * Manages the entire application state including tickets, assets, inventory, and user interactions.
 * Provides a multi-page interface with Kanban boards, search, inventory tracking, and detailed ticket views.
 *
 * Pages:
 * - Home: Dashboard with KPI cards, ticket insights, and operations overview
 * - Tickets (board): Kanban, list, split-pane, and specialty views (SLA, escalation, calendar, etc.)
 * - Search: Full-text search and filtering across all tickets
 * - Inventory: Asset and stock tracking with health monitoring
 * - Explore: Detailed ticket view with full ITSM fields and activity tracking
 * - New: Ticket creation with auto-triage and email import
 * - Sign In: Supabase authentication for cloud sync
 *
 * State Management:
 * - Local persistence: All data stored in localStorage with recovery from backups
 * - Cloud sync: Optional Supabase integration for collaborative updates
 * - Real-time clock: Updates every 1000ms for SLA, escalation, and activity calculations
 *
 * Features:
 * - Ticket filtering by status, severity, assignee, type, and tags
 * - Multiple view modes: Kanban, list, split-pane, calendar, graphs, and priority matrices
 * - Workspace tabs with independent filter and view settings
 * - SLA tracking with escalation matrix and tier routing
 * - Asset linkage and inventory management
 * - CSV and Excel export for both tickets and inventory
 * - Undo/restore for deleted tickets and records
 * - Accessibility: Full keyboard navigation and screen reader support
 */
function App() {
  const { logout } = useAuth()
  const [tickets, setTicketState] = useState<TicketItem[]>(loadTickets)
  const [assets, setAssetState] = useState<AssetItem[]>(loadAssets)
  const [stock, setStockState] = useState<StockItem[]>(loadStock)
  const updateAssets = (update: (items: AssetItem[]) => AssetItem[]) => setAssetState(update)
  const updateStock = (update: (items: StockItem[]) => StockItem[]) => setStockState(update)
  const setTickets = (update: (current: TicketItem[]) => TicketItem[]) => setTicketState((current) => {
    const previous = new Map(current.map((ticket) => [ticket.id, ticket]))
    return update(current).map((ticket) => recordActivity(previous.get(ticket.id), ticket))
  })
  const assessTicket = (id: string, field: 'impact' | 'urgency', value: string) => setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, [field]: assessmentLevels.includes(value as Assessment) ? value as Assessment : undefined } : ticket))
  const [deletedTickets, setDeletedTickets] = useState<DeletedTicket[]>(() => {
    try { return (JSON.parse(localStorage.getItem(DELETED_STORAGE_KEY) || '[]') as DeletedTicket[]).map((ticket) => ({ ...ticket, tags: Array.isArray(ticket.tags) ? ticket.tags : [], starred: Boolean(ticket.starred) })) } catch { return [] }
  })
  // Sync with the workspace's database (Settings → Account). Changes that arrive from the database are set
  // directly, without activity entries: they were recorded where they were made.
  const syncLists = useMemo(() => ({ tickets, deletedTickets, assets, stock }) as unknown as SyncLists, [tickets, deletedTickets, assets, stock])
  const replaceSynced = useCallback((list: ListName, update: (current: SyncRecord[]) => SyncRecord[]) => {
    const apply = <T,>(current: T[]) => update(current as unknown as SyncRecord[]) as unknown as T[]
    if (list === 'tickets') setTicketState(apply)
    else if (list === 'deletedTickets') setDeletedTickets(apply)
    else if (list === 'assets') setAssetState(apply)
    else setStockState(apply)
  }, [])
  useCloudSync(syncLists, replaceSynced)

  // Auto-start cloud sync when user is authenticated to Supabase
  const { isCloudUser, workspace, user } = useAuth()
  useEffect(() => {
    if (isCloudUser && workspace && user) {
      void startSync(workspace, user.id, 'upload')
      return () => stopSync('user logged out')
    }
  }, [isCloudUser, workspace, user])

  const [query, setQuery] = useState('')
  const [ticketWorkspace, setTicketWorkspace] = useState<TicketWorkspace>(loadTicketWorkspace)
  const [ticketWorkspaceReady, setTicketWorkspaceReady] = useState(false)
  const [tagFilter, setTagFilter] = useState('All tags')
  const [starredOnly, setStarredOnly] = useState(false)
  const [savedTicketViews, setSavedTicketViews] = useState<SavedView<TicketViewSettings>[]>(() => loadSavedViews<TicketViewSettings>(SAVED_TICKET_VIEWS_KEY).map(normalizeSavedTicketView))
  const [typeFilter, setTypeFilter] = useState<RecordType | 'All task types'>('All task types')
  const [groupFilter, setGroupFilter] = useState('All groups')
  const [assigneeFilter, setAssigneeFilter] = useState('All assignees')
  const [metricFilter, setMetricFilter] = useState<MetricFilter>('all')
  // The page, and the Explore page's chosen queue and ticket, start from the address (see route.ts).
  const [page, setPage] = useState<PageId>(() => parseRoute(window.location.hash).page)
  const [exploreQueue, setExploreQueue] = useState<ExploreKey | undefined>(() => parseRoute(window.location.hash).queue)
  const [exploreTicketId, setExploreTicketId] = useState<string | undefined>(() => parseRoute(window.location.hash).ticket)
  const [screenPattern, setScreenPattern] = useState<ScreenPattern>(loadScreenPattern)
  useEffect(() => { applyScreenPattern(screenPattern) }, [screenPattern])
  const [showViewPicker, setShowViewPicker] = useState(false)
  const [showBoardFiltersDropdown, setShowBoardFiltersDropdown] = useState(false)
  const boardFiltersDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (boardFiltersDropdownRef.current && !boardFiltersDropdownRef.current.contains(event.target as Node)) {
        setShowBoardFiltersDropdown(false)
      }
    }
    if (showBoardFiltersDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBoardFiltersDropdown])
  const previousPage = useRef(page)
  useEffect(() => {
    if (previousPage.current !== page) debugLog('page', `${previousPage.current} → ${page}`)
    previousPage.current = page
  }, [page])
  const [boardBy, setBoardBy] = useState<BoardBy>('State')
  const [cardSize, setCardSize] = useState<CardSize>(() => {
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY)
    return viewModes.includes(savedView as CardSize) ? savedView as CardSize : 'list'
  })
  const [splitLeft, setSplitLeft] = useState<SplitPaneMode>('list')
  const [splitRight, setSplitRight] = useState<SplitPaneMode>('details')
  const [showMatrix, setShowMatrix] = useState(false)
  const [matrixFocusId, setMatrixFocusId] = useState('')
  const [showModel, setShowModel] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importedFromEmail, setImportedFromEmail] = useState(false)
  const [emailText, setEmailText] = useState('')
  const [importError, setImportError] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showGeminiSettings, setShowGeminiSettings] = useState(false)
  const [showThemeSettings, setShowThemeSettings] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('it-ticket-kanban-theme')
      return saved === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('it-ticket-kanban-theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const [exportFormatPopup, setExportFormatPopup] = useState<'filtered' | 'all' | null>(null)
  const [homeWidgets, setHomeWidgets] = useState<HomeWidgets>(loadHomeWidgets)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [showFormOptional, setShowFormOptional] = useState(false)
  const [showPolishModal, setShowPolishModal] = useState(false)
  const [polishedDescription, setPolishedDescription] = useState('')
  const { loading: polishLoading, error: polishError, result: polishResult, polish } = useDescriptionAssist()
  const [showMoreMetrics, setShowMoreMetrics] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [dragOverLane, setDragOverLane] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState('')
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([])
  const [descriptionPopupTicketId, setDescriptionPopupTicketId] = useState('')
  const [inventoryFocusId, setInventoryFocusId] = useState('')
  const [inventoryFocusRevision, setInventoryFocusRevision] = useState(0)
  const [inventoryCommand, setInventoryCommand] = useState<InventoryCommand | null>(null)
  const inventoryCommandRevision = useRef(0)
  const standaloneTicketId = useMemo(() => {
    const match = window.location.hash.match(/^#ticket=(.+)$/)
    return match ? decodeURIComponent(match[1]) : ''
  }, [])
  // Each page change becomes a history entry, so Back and Forward move between pages and a refresh stays put.
  // (Not on the full-page ticket record opened in a new tab, whose address is #ticket=….)
  useEffect(() => {
    if (standaloneTicketId) return
    const target = routeHash({ page, queue: exploreQueue, ticket: exploreTicketId })
    const current = window.location.hash
    if (current === target || (!current && target === '#/home')) return
    window.location.hash = target
  }, [page, exploreQueue, exploreTicketId, standaloneTicketId])
  useEffect(() => {
    if (standaloneTicketId) return
    const follow = () => {
      const route = parseRoute(window.location.hash)
      setPage(route.page); setExploreQueue(route.queue); setExploreTicketId(route.ticket)
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [standaloneTicketId])
  const viewBeforeMatrix = useRef<CardSize>('small')
  const boardByBeforeMatrix = useRef<BoardBy>('State')

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets)) }, [tickets])
  useEffect(() => { saveAssets(assets) }, [assets])
  useEffect(() => { saveStock(stock) }, [stock])
  useEffect(() => { localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(deletedTickets)) }, [deletedTickets])
  useEffect(() => { localStorage.setItem(VIEW_STORAGE_KEY, cardSize) }, [cardSize])
  useEffect(() => { localStorage.setItem(HOME_WIDGETS_STORAGE_KEY, JSON.stringify(homeWidgets)) }, [homeWidgets])
  useEffect(() => { localStorage.setItem(SAVED_TICKET_VIEWS_KEY, JSON.stringify(savedTicketViews)) }, [savedTicketViews])
  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 30_000); return () => window.clearInterval(interval) }, [])
  useEffect(() => { if (page !== 'new') setShowFormOptional(false) }, [page])
  useEffect(() => {
    if (page !== 'new') return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPage('board') }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [page])
  useEffect(() => {
    if (!showToolsMenu) return
    const handlePointerDown = (event: PointerEvent) => { if (!toolsMenuRef.current?.contains(event.target as Node)) setShowToolsMenu(false) }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowToolsMenu(false) }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown) }
  }, [showToolsMenu])

  const visible = useMemo(() => tickets.filter((ticket) => {
    const matchesQuery = `${ticket.id} ${ticket.title} ${ticket.requester} ${ticket.createdBy} ${ticket.affectedUser} ${ticket.assignee} ${ticket.department} ${ticket.assignmentGroup} ${ticket.recordType} ${(ticket.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const isOpen = ticket.status !== 'Resolved'
    const matchesMetric = metricFilter === 'all'
      || (metricFilter === 'active' && isOpen)
      || (metricFilter === 'resolved' && !isOpen)
      || (metricFilter === 'high-priority' && isOpen && (ticket.severity.startsWith('P1') || ticket.severity.startsWith('P2')))
      || (metricFilter === 'escalated' && isOpen && ticket.status === 'Escalated')
      || (metricFilter === 'overdue' && isOpen && slaTime(ticket, clock).breached)
      || (metricFilter === 'at-risk' && isOpen && slaAtRisk(ticket, clock))
      || (metricFilter === 'escalation-due' && isOpen && escalationDue(ticket, clock))
      || (metricFilter === 'unassigned' && isOpen && !ticket.assignee.trim())
      || (metricFilter === 'waiting' && ticket.status === 'Waiting on User')
      || (metricFilter === 'due-today' && dueTodayOrLate(ticket, clock))
    const matchesAssignee = assigneeFilter === 'All assignees' || (assigneeFilter === 'Unassigned' ? !ticket.assignee.trim() : ticket.assignee === assigneeFilter)
    return matchesQuery && matchesMetric && matchesAssignee && (typeFilter === 'All task types' || ticket.recordType === typeFilter) && (groupFilter === 'All groups' || (ticket.assignmentGroup || 'No group') === groupFilter) && (tagFilter === 'All tags' || (ticket.tags || []).includes(tagFilter)) && (!starredOnly || ticket.starred)
  }), [tickets, query, typeFilter, groupFilter, assigneeFilter, metricFilter, tagFilter, starredOnly, clock])
  const exportCurrentTickets = (format: 'csv' | 'xlsx') => {
    const headers = ['Number', 'Short description', 'Task type', 'Priority', 'State', 'Department', 'Assignment group', 'Assigned to', 'Requested by', 'Created by', 'Affected user', 'Affected user email', 'Created', 'Due', 'Resolved', 'Resolution SLA', 'Resolution deadline', 'Escalation tier', 'Linked asset', 'Tags', 'Time logged', 'Description', 'Work notes']
    const exportTickets = selectedTicketIds.length ? visible.filter((ticket) => selectedTicketIds.includes(ticket.id)) : visible
    const rows = exportTickets.map((ticket) => {
      const sla = slaTime(ticket, clock)
      return [ticket.id, ticket.title, ticket.recordType, ticket.severity, ticket.status, ticket.department, ticket.assignmentGroup, ticket.assignee, ticket.requester, ticket.createdBy, ticket.affectedUser, ticket.affectedUserEmail, ticket.createdAt, ticket.dueAt, ticket.resolvedAt, ticket.status === 'Resolved' ? 'Resolved' : sla.label, new Date(sla.deadline).toISOString(), `Tier ${ticket.currentTier}`, ticket.assetId, (ticket.tags || []).join('; '), loggedLabel(loggedSecondsNow(ticket, clock)), ticket.description, ticket.notes]
    })
    const filename = `tickets-${new Date().toISOString().slice(0, 10)}`
    if (format === 'xlsx') exportXlsx(`${filename}.xlsx`, 'Tickets', headers, rows)
    else exportCsv(`${filename}.csv`, headers, rows)
  }
  const filtersActive = Boolean(query.trim()) || typeFilter !== 'All task types' || groupFilter !== 'All groups' || assigneeFilter !== 'All assignees' || metricFilter !== 'all' || tagFilter !== 'All tags' || starredOnly
  const clearFilters = () => {
    setQuery('')
    setTypeFilter('All task types')
    setGroupFilter('All groups')
    setAssigneeFilter('All assignees')
    setMetricFilter('all')
    setTagFilter('All tags')
    setStarredOnly(false)
  }
  const currentTicketPane: TicketPaneSettings = { cardSize, boardBy, query, typeFilter, groupFilter, assigneeFilter, metricFilter, tagFilter, starredOnly, splitLeft, splitRight }
  const currentTicketView: TicketViewSettings = { ...currentTicketPane, workspaceTabs: ticketWorkspace.tabs.map((item) => item.id === ticketWorkspace.activeId ? { ...item, settings: currentTicketPane } : item), activeWorkspaceId: ticketWorkspace.activeId }
  const applyTicketPane = (settings: TicketPaneSettings) => {
    setCardSize(viewModes.includes(settings.cardSize) ? settings.cardSize : 'list')
    setBoardBy((['State', 'Task type', 'Assignment group'] as BoardBy[]).includes(settings.boardBy) ? settings.boardBy : 'State')
    setQuery(settings.query || '')
    setTypeFilter(recordTypes.includes(settings.typeFilter as RecordType) ? settings.typeFilter : 'All task types')
    setGroupFilter(settings.groupFilter || 'All groups')
    setAssigneeFilter(settings.assigneeFilter || 'All assignees')
    setMetricFilter(settings.metricFilter || 'all')
    setTagFilter(settings.tagFilter || 'All tags')
    setStarredOnly(Boolean(settings.starredOnly))
    setSplitLeft(splitPaneModes.includes(settings.splitLeft) ? settings.splitLeft : 'list')
    setSplitRight(splitPaneModes.includes(settings.splitRight) ? settings.splitRight : 'details')
  }
  useEffect(() => {
    const active = ticketWorkspace.tabs.find((item) => item.id === ticketWorkspace.activeId)
    if (active) applyTicketPane(active.settings)
    setTicketWorkspaceReady(true)
  }, [])
  useEffect(() => {
    if (!ticketWorkspaceReady) return
    localStorage.setItem(TICKET_WORKSPACE_KEY, JSON.stringify({ tabs: ticketWorkspace.tabs.map((item) => item.id === ticketWorkspace.activeId ? { ...item, settings: currentTicketPane } : item), activeId: ticketWorkspace.activeId }))
  }, [ticketWorkspace, ticketWorkspaceReady, cardSize, boardBy, query, typeFilter, groupFilter, assigneeFilter, metricFilter, tagFilter, starredOnly, splitLeft, splitRight])
  const switchTicketTab = (id: string) => {
    if (id === ticketWorkspace.activeId) return
    const next = ticketWorkspace.tabs.find((item) => item.id === id)
    if (!next) return
    setTicketWorkspace({ tabs: ticketWorkspace.tabs.map((item) => item.id === ticketWorkspace.activeId ? { ...item, settings: currentTicketPane } : item), activeId: id })
    applyTicketPane(next.settings)
  }
  const addTicketTab = () => {
    const id = newTicketWorkspaceId()
    const settings = defaultTicketPane()
    setTicketWorkspace({ tabs: [...ticketWorkspace.tabs.map((item) => item.id === ticketWorkspace.activeId ? { ...item, settings: currentTicketPane } : item), { id, settings }], activeId: id })
    applyTicketPane(settings)
  }
  const closeTicketTab = (id: string) => {
    if (ticketWorkspace.tabs.length === 1) return
    const index = ticketWorkspace.tabs.findIndex((item) => item.id === id)
    if (index < 0) return
    const tabs = ticketWorkspace.tabs.filter((item) => item.id !== id).map((item) => item.id === ticketWorkspace.activeId ? { ...item, settings: currentTicketPane } : item)
    const activeId = id === ticketWorkspace.activeId ? tabs[Math.min(index, tabs.length - 1)].id : ticketWorkspace.activeId
    setTicketWorkspace({ tabs, activeId })
    if (id === ticketWorkspace.activeId) applyTicketPane(tabs.find((item) => item.id === activeId)!.settings)
  }
  const applyTicketView = (settings: TicketViewSettings) => {
    const tabs = Array.isArray(settings.workspaceTabs) ? settings.workspaceTabs.filter((item): item is TicketWorkspaceTab => !!item && typeof item.id === 'string' && !!item.settings) : []
    if (tabs.length) {
      const activeId = tabs.some((item) => item.id === settings.activeWorkspaceId) ? settings.activeWorkspaceId! : tabs[0].id
      setTicketWorkspace({ tabs, activeId })
      applyTicketPane(tabs.find((item) => item.id === activeId)!.settings)
    } else {
      const id = newTicketWorkspaceId()
      setTicketWorkspace({ tabs: [{ id, settings }], activeId: id })
      applyTicketPane(settings)
    }
  }
  const resetTicketView = () => {
    const id = newTicketWorkspaceId()
    const settings = defaultTicketPane()
    setTicketWorkspace({ tabs: [{ id, settings }], activeId: id })
    applyTicketPane(settings)
  }
  const ticketTabLabel = (settings: TicketPaneSettings) => ({ small: 'Kanban Compact', regular: 'Kanban Detailed', list: 'List', split: 'Split', 'my-work': 'My Work' } as Record<CardSize, string>)[settings.cardSize]
  const ticketTags = useMemo(() => [...new Set(tickets.flatMap((ticket) => ticket.tags || []))].sort(), [tickets])
  const groupOptions = useMemo(() => [...new Set(tickets.map((ticket) => ticket.assignmentGroup || 'No group'))].sort(), [tickets])
  const assigneeOptions = useMemo(() => [...new Set(tickets.map((ticket) => ticket.assignee.trim()).filter(Boolean))].sort(), [tickets])
  const laneLabels: string[] = boardBy === 'State' ? statuses : boardBy === 'Task type' ? recordTypes : groupOptions
  const open = tickets.filter((ticket) => ticket.status !== 'Resolved')
  const highPriority = open.filter((ticket) => ticket.severity.startsWith('P1') || ticket.severity.startsWith('P2')).length
  const escalated = open.filter((ticket) => ticket.status === 'Escalated').length
  const overdue = open.filter((ticket) => slaTime(ticket, clock).breached).length
  const atRisk = open.filter((ticket) => slaAtRisk(ticket, clock)).length
  const escalationDueCount = open.filter((ticket) => escalationDue(ticket, clock)).length
  const unassigned = open.filter((ticket) => !ticket.assignee.trim()).length
  const waiting = open.filter((ticket) => ticket.status === 'Waiting on User').length
  const dueToday = open.filter((ticket) => dueTodayOrLate(ticket, clock)).length
  const currentSuggestion = triageSuggestion(form.title, form.description, form.severity)
  const groupText = `${form.title} ${form.description}`
  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId)
  const toggleTicketStar = (id: string) => setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, starred: !ticket.starred } : ticket))
  const saveTicketTags = (id: string, value: string) => setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, tags: parseTicketTags(value) } : ticket))
  const saveTicketNotes = (id: string, value: string) => setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, notes: value } : ticket))
  const selectedAssetId = selectedTicket ? selectedTicket.assetId || assets.find((asset) => asset.linkedTicketIds.includes(selectedTicket.id))?.id || '' : ''
  const standaloneTicket = tickets.find((ticket) => ticket.id === standaloneTicketId)

  const addTicket = () => {
    if (!form.title.trim()) { setFormError('Add a short issue summary to continue.'); return }
    const existingIds = new Set([...tickets, ...deletedTickets].map((ticket) => ticket.id.toLowerCase()))
    const baseId = `IT-${String(Date.now()).slice(-6)}`
    let id = form.id.trim() || baseId
    if (!form.id.trim()) {
      let suffix = 2
      while (existingIds.has(id.toLowerCase())) id = `${baseId}-${suffix++}`
    }
    if (tickets.some((ticket) => ticket.id.toLowerCase() === id.toLowerCase()) || deletedTickets.some((ticket) => ticket.id.toLowerCase() === id.toLowerCase())) { setFormError('That ticket ID is already in use.'); return }
    const { tagsText, ...fields } = form
    setTickets((current) => [{ ...fields, id, title: form.title.trim(), description: form.description.trim(), assignmentGroup: form.assignmentGroup || suggestGroup(form.recordType, form.severity, `${form.title} ${form.description}`), tags: parseTicketTags(tagsText), starred: false, status: 'New', createdAt: new Date().toISOString(), universalTasks: [], loggedSeconds: 0, timerStartedAt: null, currentTier: 1 }, ...current])
    if (form.assetId) updateAssets((items) => items.map((asset) => asset.id === form.assetId ? { ...asset, linkedTicketIds: [...new Set([...(asset.linkedTicketIds || []), id])], history: [...(asset.history || []), { at: new Date().toISOString(), action: 'Ticket linked', detail: id + ' created for this asset.' }] } : asset))
    setForm(emptyForm); setFormError(''); setShowFormOptional(false); setPage('board'); clearFilters(); setSelectedTicketId(id)
  }
  const handlePolishDescription = async () => {
    if (!form.description.trim()) { setFormError('Add a description to polish.'); return }
    try {
      const result = await polish(form.description)
      setPolishedDescription(result)
      setShowPolishModal(true)
    } catch (err) {
      console.error('Polish failed:', err)
    }
  }
  const acceptPolishedDescription = () => {
    updateForm('description', polishedDescription)
    setShowPolishModal(false)
  }
  const importEmail = () => {
    if (!emailText.trim()) { setImportError('Paste the email text to continue.'); return }
    const parsed = parseIncomingEmail(emailText)
    if (!parsed.title) { setImportError('Add a subject line or an Issue / Short description field so the ticket has a title.'); return }
    setForm({ ...emptyForm, ...parsed })
    setFormError('')
    setImportedFromEmail(true)
    setImportError('')
    setShowImport(false)
    setPage('new'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openResolutionDraft = (ticket: TicketItem) => {
    const recipient = ticket.affectedUserEmail || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticket.affectedUser) ? ticket.affectedUser : '')
    const subject = `[TEST DRAFT – do not action] Ticket resolved: ${ticket.id} — ${ticket.title}`
    const body = `*** TEST DRAFT — review before sending. ***\n\nHello${ticket.affectedUser ? ` ${ticket.affectedUser}` : ''},\n\nYour IT ticket has been resolved.\n\nTicket: ${ticket.id} — ${ticket.title}\nResolution status: Resolved\nAffected user: ${ticket.affectedUser || 'Not provided'}\nCreated by: ${ticket.createdBy || 'Not recorded'}\nResolution details: ${ticket.notes || ticket.description || 'No resolution notes provided.'}${recipient ? '' : '\n\nReminder: the affected user email is not recorded on this ticket. Add the user\'s email in Outlook before sending.'}\n\nIf the issue is still occurring, please reply to this email so the support team can follow up.\n\nThis draft was created from the local IT Support Kanban prototype. It has not been sent automatically.`
    const compose = new URLSearchParams({ ...(recipient ? { to: recipient } : {}), subject, body })
    window.open(`https://outlook.office.com/mail/deeplink/compose?${compose.toString()}`, '_blank', 'noopener,noreferrer')
  }
  const move = (ticket: TicketItem, step: number) => {
    if (boardBy === 'State') {
      const nextStatus = statuses[Math.max(0, Math.min(statuses.length - 1, statuses.indexOf(ticket.status) + step))]
      if (nextStatus === 'Resolved' && ticket.status !== 'Resolved') openResolutionDraft(ticket)
    }
    setTickets((current) => current.map((item) => {
    if (item.id !== ticket.id) return item
    if (boardBy === 'Task type') return { ...item, recordType: recordTypes[Math.max(0, Math.min(recordTypes.length - 1, recordTypes.indexOf(item.recordType) + step))] }
    if (boardBy === 'Assignment group') {
      const currentIndex = Math.max(0, groupOptions.indexOf(item.assignmentGroup || 'No group'))
      return { ...item, assignmentGroup: groupOptions[Math.max(0, Math.min(groupOptions.length - 1, currentIndex + step))] === 'No group' ? '' : groupOptions[Math.max(0, Math.min(groupOptions.length - 1, currentIndex + step))] }
    }
    const status = statuses[Math.max(0, Math.min(statuses.length - 1, statuses.indexOf(item.status) + step))]
    if (status === 'Resolved' && item.timerStartedAt) return { ...item, status, loggedSeconds: item.loggedSeconds + Math.max(0, Math.floor((Date.now() - new Date(item.timerStartedAt).getTime()) / 1000)), timerStartedAt: null }
    return { ...item, status }
    }))
  }
  const moveToLane = (ticketId: string, laneLabel: string) => {
    const ticket = tickets.find((item) => item.id === ticketId)
    if (!ticket) return
    if (boardBy === 'State' && ticket.status === laneLabel) return
    if (boardBy === 'Task type' && ticket.recordType === laneLabel) return
    if (boardBy === 'Assignment group' && (ticket.assignmentGroup || 'No group') === laneLabel) return
    if (boardBy === 'State' && laneLabel === 'Resolved' && ticket.status !== 'Resolved') openResolutionDraft(ticket)
    setTickets((current) => current.map((item) => {
      if (item.id !== ticketId) return item
      if (boardBy === 'Task type') return { ...item, recordType: laneLabel as RecordType }
      if (boardBy === 'Assignment group') return { ...item, assignmentGroup: laneLabel === 'No group' ? '' : laneLabel }
      const status = laneLabel as Status
      if (status === 'Resolved' && item.timerStartedAt) return { ...item, status, loggedSeconds: item.loggedSeconds + Math.max(0, Math.floor((Date.now() - new Date(item.timerStartedAt).getTime()) / 1000)), timerStartedAt: null }
      return { ...item, status }
    }))
  }
  const remove = (id: string) => {
    const ticket = tickets.find((item) => item.id === id)
    if (!ticket) return
    const loggedSeconds = ticket.loggedSeconds + (ticket.timerStartedAt ? Math.max(0, Math.floor((Date.now() - new Date(ticket.timerStartedAt).getTime()) / 1000)) : 0)
    setDeletedTickets((deleted) => [{ ...ticket, loggedSeconds, timerStartedAt: null, deletedAt: new Date().toISOString() }, ...deleted.filter((item) => item.id !== id)])
    setTickets((current) => current.filter((item) => item.id !== id))
  }
  const restore = (id: string) => {
    const archived = deletedTickets.find((ticket) => ticket.id === id)
    if (!archived) return
    const { deletedAt: _deletedAt, ...ticket } = archived
    setTickets((current) => current.some((item) => item.id === id) ? current : [ticket, ...current])
    setDeletedTickets((current) => current.filter((item) => item.id !== id))
  }
  const updateForm = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const addUniversalTask = (ticketId: string, title: string) => setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, universalTasks: [...ticket.universalTasks, { id: `UT-${Date.now().toString().slice(-5)}`, title, assignee: ticket.requester || 'Requester', done: false }] } : ticket))
  const toggleUniversalTask = (ticketId: string, taskId: string) => setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, universalTasks: ticket.universalTasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task) } : ticket))
  const toggleTimer = (ticketId: string) => setTickets((current) => current.map((ticket) => {
    if (ticket.id !== ticketId) return ticket
    if (ticket.status === 'Resolved') return ticket
    if (!ticket.timerStartedAt) return { ...ticket, timerStartedAt: new Date().toISOString() }
    const added = Math.max(0, Math.floor((Date.now() - new Date(ticket.timerStartedAt).getTime()) / 1000))
    return { ...ticket, loggedSeconds: ticket.loggedSeconds + added, timerStartedAt: null }
  }))
  const escalate = (ticket: TicketItem) => {
    if (ticket.status === 'Resolved' || ticket.currentTier >= 3) return
    const nextTier = (ticket.currentTier + 1) as 2 | 3
    const contact = tierRows[nextTier - 1]
    const elapsedMs = Date.now() - new Date(ticket.createdAt).getTime()
    const thresholdMs = escalationTargetMs(ticket.severity, nextTier)
    const thresholdText = severityRows.find((row) => row.level === ticket.severity)?.[nextTier === 2 ? 'tier2' : 'tier3'] || 'per matrix'
    const why = elapsedMs >= thresholdMs ? `The ${thresholdText} escalation threshold has been reached.` : `Manual escalation requested before the ${thresholdText} threshold.`
    const sla = slaTime(ticket, Date.now())
    const reason = ticket.notes || ticket.description || 'No additional notes recorded.'
    const subject = `[TEST DRAFT – do not action] Escalation to ${contact.tier} for ${ticket.id} (${ticket.severity.split(' – ')[0]})`
    const body = `*** TEST DRAFT — do not action. Nothing is sent automatically. ***\n\nHello ${contact.role},\n\nI am escalating ${ticket.id} to ${contact.tier}.\n\nWhy it needs escalation: ${why}\n\nTicket: ${ticket.id} — ${ticket.title}\nType: ${ticket.recordType} (${tableNames[ticket.recordType]})\nPriority: ${ticket.severity}\nRequester: ${ticket.requester || 'Not provided'} · Affected user: ${ticket.affectedUser || 'Not provided'}\nStatus: ${ticket.status} · Assignment group: ${ticket.assignmentGroup || 'No group'} · Assigned to: ${ticket.assignee || 'Unassigned'}\nOpen for: ${elapsedLabel(ticket.createdAt, Date.now())}\nResolution SLA: ${sla.label} (calendar time)\nMatrix threshold: ${thresholdText}\n\nNotes: ${reason}\n\nPlease review and advise on the next action.\n\nThis draft was created from the local Ops Kanban prototype.`
    const compose = new URLSearchParams({ to: contact.email, cc: 'yuki.katayama@intersoftkk.com', subject, body })
    window.open(`https://outlook.office.com/mail/deeplink/compose?${compose.toString()}`, '_blank', 'noopener,noreferrer')
    setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, status: 'Escalated', currentTier: nextTier } : item))
  }
  const openMatrixPanel = (focusId = '') => {
    viewBeforeMatrix.current = cardSize
    boardByBeforeMatrix.current = boardBy
    setMatrixFocusId(focusId)
    setShowMatrix(true)
  }
  const closeMatrix = () => {
    setShowMatrix(false)
    setCardSize(viewBeforeMatrix.current)
    setBoardBy(boardByBeforeMatrix.current)
  }
  const openRelatedTicket = (id: string) => {
    closeMatrix(); setPage('board'); setTypeFilter('All task types'); setGroupFilter('All groups'); setMetricFilter('all'); setQuery(id)
    window.setTimeout(() => document.getElementById('board')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
  }
  const openMatrixForTicket = (id: string) => openMatrixPanel(id)

  const openNewForm = (seed: Partial<typeof emptyForm> = {}) => { setForm({ ...emptyForm, ...seed }); setFormError(''); setImportedFromEmail(false); setShowFormOptional(false); setPage('new'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const showTickets = (filter: MetricFilter = 'all', useList = false) => {
    setPage('board')
    setMetricFilter(filter)
    setQuery('')
    setTypeFilter('All task types')
    setGroupFilter('All groups')
    setAssigneeFilter('All assignees')
    if (useList) setCardSize('list')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openExplore = () => { setExploreQueue(undefined); setExploreTicketId(undefined); setPage('explore'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const goToPage = (target: PageId) => {
    if (target === 'board') { showTickets(); return }
    if (target === 'inventory') setInventoryFocusId('')
    setPage(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const linkTicketToAsset = (ticketId: string, assetId: string) => setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, assetId } : ticket))
  const createTicketForAsset = (asset: AssetItem) => openNewForm({ assetId: asset.id, title: asset.name + ' issue', requester: asset.assignedTo, affectedUser: asset.assignedTo, department: asset.department })
  const openAssetFromTicket = (id: string) => { setSelectedTicketId(''); setInventoryFocusId(id); setInventoryFocusRevision((value) => value + 1); setPage('inventory'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const runInventoryCommand = (action: InventoryCommand['action']) => {
    setShowToolsMenu(false)
    setInventoryFocusId('')
    setPage('inventory')
    setInventoryCommand({ action, revision: ++inventoryCommandRevision.current })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const runExport = (format: 'csv' | 'xlsx') => {
    setShowToolsMenu(false)
    if (page === 'inventory') setInventoryCommand({ action: format === 'csv' ? 'export-csv' : 'export-xlsx', revision: ++inventoryCommandRevision.current })
    else exportCurrentTickets(format)
  }

  if (standaloneTicketId) return standaloneTicket ? <TicketRecordPage ticket={standaloneTicket} now={clock} /> : <div className="record-page-shell"><div className="record-not-found"><Ticket size={24} /><h1>Ticket not found</h1><p>The requested ticket is not available in this browser.</p><a href={window.location.href.split('#')[0]}>Return to home</a></div></div>

  // Sign-in disabled for demo - direct access enabled
  // if (page === 'signin') return <SignInPage onSignIn={() => setPage('home')} />

  return <div className={`app-shell view-${cardSize}`}>
    <header className="topbar">
      <div className="brand-area"><button className="brand brand-home-button" onClick={() => { setPage('home'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="Go to home" title="Home"><div className="brand-mark"><Activity size={17} /></div><span>OPS <b>KANBAN</b></span></button><nav className="primary-nav" aria-label="Main navigation"><button className={page === 'home' || page === 'explore' ? 'active' : ''} aria-current={page === 'home' ? 'page' : undefined} onClick={() => goToPage('home')}>Home</button><button className={page === 'board' ? 'active' : ''} aria-current={page === 'board' ? 'page' : undefined} onClick={() => goToPage('board')}>Tickets</button><button className={page === 'search' ? 'active' : ''} aria-current={page === 'search' ? 'page' : undefined} onClick={() => goToPage('search')}>Search</button><button className={page === 'inventory' ? 'active' : ''} aria-current={page === 'inventory' ? 'page' : undefined} onClick={() => goToPage('inventory')}>Inventory</button><button className={page === 'escalation' ? 'active' : ''} aria-current={page === 'escalation' ? 'page' : undefined} onClick={() => goToPage('escalation')}>Escalation</button></nav></div>
      <div className="top-actions">
        <SyncBadge onOpen={() => setShowSettings(true)} />
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
        <div className="header-tools" ref={toolsMenuRef}>
          <button type="button" className="header-tools-trigger" onClick={() => setShowToolsMenu((value) => !value)} aria-expanded={showToolsMenu} aria-controls="header-tools-menu" aria-label="Tools"><Menu size={16} /> <span className="topbar-label">Tools</span> <ChevronDown size={13} /></button>
          {showToolsMenu && <div className="header-tools-menu" id="header-tools-menu" aria-label="Tools">
            {page !== 'inventory' && <>
              <span className="header-tools-heading">QUICK ACTIONS</span>
              <button type="button" onClick={() => { setShowToolsMenu(false); setEmailText(''); setImportError(''); setShowImport(true) }}><Mail size={16} /><span>Import email<small>Draft a ticket from an email</small></span></button>
              <button type="button" onClick={() => { setShowToolsMenu(false); openMatrixPanel() }}><ShieldAlert size={16} /><span>Escalation matrix<small>Priorities, timing, and contacts</small></span></button>
            </>}
            {page === 'inventory' && <>
              <span className="header-tools-heading">FILTERS</span>
              <button type="button" onClick={() => runInventoryCommand('in-stock')}><Check size={16} /><span>In Stock<small>Items with quantity available</small></span></button>
              <button type="button" onClick={() => runInventoryCommand('low-stock')}><AlertTriangle size={16} /><span>Low stock<small>Items at or below minimum</small></span></button>
            </>}
            <span className="header-tools-heading">EXPORT</span>
            {page === 'inventory' && <>
              <button type="button" onClick={() => setExportFormatPopup('filtered')}><Download size={16} /><span>Filtered assets/stock<small>Current view</small></span></button>
              <button type="button" onClick={() => setExportFormatPopup('all')}><Download size={16} /><span>All inventory<small>All assets and stock</small></span></button>
            </>}
            {page !== 'inventory' && <>
              <button type="button" onClick={() => runExport('csv')}><Download size={16} /><span>Tickets · CSV<small>Current filters</small></span></button>
              <button type="button" onClick={() => runExport('xlsx')}><Download size={16} /><span>Tickets · Excel<small>Current filters</small></span></button>
            </>}
            <span className="header-tools-heading">DATA</span>
            <button type="button" onClick={() => { setShowToolsMenu(false); setShowReports(true) }}><BarChart3 size={16} /><span>Reports<small>Trends and workload</small></span></button>
            <button type="button" onClick={() => { setShowToolsMenu(false); setShowDeleted(true) }}><Trash2 size={16} /><span>Deleted<small>{deletedTickets.length} recoverable</small></span></button>
            <span className="header-tools-heading">ACCOUNT</span>
            <button type="button" onClick={() => { setShowToolsMenu(false); setShowThemeSettings(true) }}><Moon size={16} /><span>Appearance<small>Light, dark, or system</small></span></button>
            <button type="button" onClick={() => { setShowToolsMenu(false); setShowGeminiSettings(true) }}><BrainCircuit size={16} /><span>Gemini AI Settings<small>Configure API key</small></span></button>
            <button type="button" onClick={() => { setShowToolsMenu(false); logout() }}><LogOut size={16} /><span>Logout<small>Sign out of this account</small></span></button>
          </div>}
        </div>
        {/* Inventory has its own Add asset / Add stock item button beside its heading. The new-task page is the form itself. */}
        {page !== 'inventory' && page !== 'new' && <button type="button" className="primary-button" onClick={() => openNewForm()} aria-label="New task"><Plus size={16} /> <span className="topbar-label">New task</span></button>}
      </div>
    </header>
    <QuickPageNav page={(page === 'explore' || page === 'new' || page === 'escalation') ? 'home' : page} onChange={goToPage} />
    <DebugPanel />
    {page === 'home' ? <HomeScreen tickets={tickets} now={clock} showTickets={showTickets} openTicket={setSelectedTicketId} searchTicket={openRelatedTicket} openReports={() => setShowReports(true)} openSettings={() => setShowSettings(true)} widgets={homeWidgets} openExplore={openExplore} /> : page === 'explore' ? <ExplorePage queues={exploreQueuesFor(tickets, clock)} tickets={tickets} queue={exploreQueue} ticketId={exploreTicketId}
      onSelectQueue={(queue) => { setExploreQueue(queue); setExploreTicketId(undefined) }} onSelectTicket={setExploreTicketId}
      onOpenQueue={(queue) => showTickets(EXPLORE_FILTERS[queue], true)} onOpenAll={() => showTickets('all', true)} onOpenRecord={setSelectedTicketId} onHome={() => goToPage('home')}
      renderSummary={(ticket) => <ExploreTicketSummary ticket={ticket} now={clock} />} /> : page === 'search' ? <SearchPage tickets={tickets} openTicket={setSelectedTicketId} /> : page === 'inventory' ? <InventoryPage focusId={inventoryFocusId} focusRevision={inventoryFocusRevision} command={inventoryCommand} onCommandHandled={() => setInventoryCommand(null)} assets={assets} stock={stock} updateAssets={updateAssets} updateStock={updateStock} tickets={tickets} openTicket={setSelectedTicketId} linkTicket={linkTicketToAsset} createTicket={createTicketForAsset} /> : page === 'escalation' ? <EscalationPage teamId="default-team" onClose={() => goToPage('home')} /> : <main className="main-content">
      <div className="page-heading"><div><div className="eyebrow">OPERATIONS <span>·</span> LIVE BOARD</div><h1>Ops Kanban</h1><p className="subtitle">A focused view of ownership, escalation, and resolution work across the service desk.</p></div><div className="date-chip"><Clock3 size={15} />{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</div></div>
      <div className="prototype-note"><span className="prototype-dot" /><b>Sync: live</b><span>Email intake: mock · 0 new</span><span>{tickets.length} cards on the board, {open.length} open. SLA clocks count calendar time.</span><button onClick={() => setShowModel(true)}>How this maps <ArrowRight size={13} /></button></div>
      <section className="summary-strip" aria-label="Task summary">
        <Metric icon={<Ticket size={17} />} label="Open" value={open.length} tone="blue" selected={metricFilter === 'active'} onClick={() => setMetricFilter((current) => current === 'active' ? 'all' : 'active')} />
        <Metric icon={<AlertTriangle size={17} />} label="P1 / P2 open" value={highPriority} tone="red" selected={metricFilter === 'high-priority'} onClick={() => setMetricFilter((current) => current === 'high-priority' ? 'all' : 'high-priority')} />
        <Metric icon={<Clock3 size={17} />} label="Past SLA" value={overdue} tone="red" selected={metricFilter === 'overdue'} onClick={() => setMetricFilter((current) => current === 'overdue' ? 'all' : 'overdue')} />
        <Metric icon={<ArrowUp size={17} />} label="Escalated" value={escalated} tone="amber" selected={metricFilter === 'escalated'} onClick={() => setMetricFilter((current) => current === 'escalated' ? 'all' : 'escalated')} />
        {showMoreMetrics && <>
          <Metric icon={<Activity size={17} />} label="SLA at risk" value={atRisk} tone="amber" selected={metricFilter === 'at-risk'} onClick={() => setMetricFilter((current) => current === 'at-risk' ? 'all' : 'at-risk')} />
          <Metric icon={<ShieldAlert size={17} />} label="Escalation due" value={escalationDueCount} tone="amber" selected={metricFilter === 'escalation-due'} onClick={() => setMetricFilter((current) => current === 'escalation-due' ? 'all' : 'escalation-due')} />
          <Metric icon={<Layers size={17} />} label="Unassigned" value={unassigned} tone="slate" selected={metricFilter === 'unassigned'} onClick={() => setMetricFilter((current) => current === 'unassigned' ? 'all' : 'unassigned')} />
          <Metric icon={<Workflow size={17} />} label="Waiting on user" value={waiting} tone="blue" selected={metricFilter === 'waiting'} onClick={() => setMetricFilter((current) => current === 'waiting' ? 'all' : 'waiting')} />
          <Metric icon={<Clock3 size={17} />} label="Due today / late" value={dueToday} tone="slate" selected={metricFilter === 'due-today'} onClick={() => setMetricFilter((current) => current === 'due-today' ? 'all' : 'due-today')} />
        </>}
        <button className="metric-show-more" onClick={() => setShowMoreMetrics((v) => !v)} type="button">{showMoreMetrics ? 'Show less' : 'Show more'}</button>
      </section>
      <div className="board-toolbar"><div className="ticket-browser-tabs">
        <div className="ticket-browser-tab-scroll" role="tablist" aria-label="Open ticket tabs">
          {ticketWorkspace.tabs.map((item) => { const settings = item.id === ticketWorkspace.activeId ? currentTicketPane : item.settings; return <div className={'ticket-browser-tab' + (item.id === ticketWorkspace.activeId ? ' active' : '')} key={item.id}><button role="tab" aria-selected={item.id === ticketWorkspace.activeId} onClick={() => switchTicketTab(item.id)} title={ticketTabLabel(settings)}>{ticketTabLabel(settings)}{(settings.query || settings.typeFilter !== 'All task types' || settings.groupFilter !== 'All groups' || settings.assigneeFilter !== 'All assignees' || settings.metricFilter !== 'all' || settings.tagFilter !== 'All tags' || settings.starredOnly) && <span className="ticket-tab-filter-dot" aria-label="Filtered" />}</button>{ticketWorkspace.tabs.length > 1 && <button className="ticket-browser-tab-close" onClick={() => closeTicketTab(item.id)} aria-label={`Close ${ticketTabLabel(settings)} tab`} title="Close tab"><X size={12} /></button>}</div> })}
          <button className="ticket-browser-add" onClick={addTicketTab} aria-label="New ticket tab" title="New ticket tab"><Plus size={16} /><span>New tab</span></button>
        </div>
        <SavedViews label="Ticket views" views={savedTicketViews} current={currentTicketView} onApply={applyTicketView} onReset={resetTicketView} onSave={(view) => setSavedTicketViews((items) => [...items, view])} onDelete={(id) => setSavedTicketViews((items) => items.filter((view) => view.id !== id))} saveButtonLabel="Save tabs as view" saveDescription="Save all open ticket tabs, including each tab’s layout, search, filters, and split view choices. Reopen the full set from Saved views." />
        <button type="button" className="export-csv-button" onClick={() => exportCurrentTickets('csv')} title={selectedTicketIds.length ? `Export ${selectedTicketIds.length} selected ${selectedTicketIds.length === 1 ? 'ticket' : 'tickets'} as CSV` : `Export ${visible.length} tickets matching the current filters as CSV`}><Download size={14} /> Export CSV</button>
              </div>
      {cardSize === 'split' && <div className="ticket-split-options" aria-label="Split view layout">
        <strong>Split layout</strong>
        <label>Left view<select value={splitLeft} onChange={(event) => setSplitLeft(event.target.value as SplitPaneMode)} aria-label="Choose left split view"><SplitPaneOptions /></select></label>
        <label>Right view<select value={splitRight} onChange={(event) => setSplitRight(event.target.value as SplitPaneMode)} aria-label="Choose right split view"><SplitPaneOptions /></select></label>
        <button type="button" onClick={() => { setSplitLeft(splitRight); setSplitRight(splitLeft) }}><RotateCcw size={13} /> Swap sides</button>
      </div>}
      <div className="board-label"><span className="live-dot" />Task board <span className="ticket-total">{visible.length === tickets.length ? `${tickets.length} records` : `${visible.length} of ${tickets.length} records`}</span></div><div className="board-filters"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets, people, tags" aria-label="Search tickets, people, tags" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label><button type="button" className="all-views-button" aria-label="Open all ticket views" onClick={() => setShowViewPicker(true)}>All Views</button>{(cardSize === 'small' || cardSize === 'regular') && <label className="filter-field"><span>Board by</span><select value={boardBy} onChange={(event) => setBoardBy(event.target.value as BoardBy)} aria-label="Group board by"><option>State</option><option>Task type</option><option>Assignment group</option></select></label>}<div className="board-filters-dropdown" ref={boardFiltersDropdownRef}><button className="board-filters-button" onClick={() => setShowBoardFiltersDropdown(!showBoardFiltersDropdown)} aria-expanded={showBoardFiltersDropdown}><ChevronDown size={14} /> Filters</button>{showBoardFiltersDropdown && <div className="board-filters-menu"><div className="board-filters-menu-section">
      <label><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as RecordType | 'All task types')} aria-label="Filter by task type"><option>All task types</option>{recordTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label><span>Group</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="Filter by assignment group"><option>All groups</option>{groupOptions.map((group) => <option key={group}>{group}</option>)}</select></label>
      <label><span>Assignee</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Filter by assignee"><option>All assignees</option>{assigneeOptions.map((assignee) => <option key={assignee}>{assignee}</option>)}<option>Unassigned</option></select></label>
      <label><span>Tag</span><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filter tickets by tag"><option>All tags</option>{ticketTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label></div></div>}</div><button className={"ticket-star-filter" + (starredOnly ? " active" : "")} aria-pressed={starredOnly} onClick={() => setStarredOnly((value) => !value)}><Star size={14} fill={starredOnly ? "currentColor" : "none"} /> Starred</button>{filtersActive && <button className="clear-filters-button" onClick={clearFilters}><X size={13} />Clear filters</button>}</div></div>
      {cardSize === 'list' ? <ListView tickets={visible} now={clock} openTicket={setSelectedTicketId} openDescriptionPopup={setDescriptionPopupTicketId} toggleStar={toggleTicketStar} selectedIds={selectedTicketIds} onSelectionChange={setSelectedTicketIds} /> : cardSize === 'small' || cardSize === 'regular' ? <section className="kanban" id="board" aria-label="Kanban task lanes">
        {laneLabels.map((laneLabel, index) => {
          const lane = visible.filter((ticket) => boardBy === 'State' ? ticket.status === laneLabel : boardBy === 'Task type' ? ticket.recordType === laneLabel : (ticket.assignmentGroup || 'No group') === laneLabel)
          const addSeed = boardBy === 'Task type' ? { recordType: laneLabel as RecordType } : boardBy === 'Assignment group' ? { assignmentGroup: laneLabel === 'No group' ? '' : laneLabel } : {}
          const canAddHere = boardBy === 'State' ? laneLabel === 'New' : true
          return <div className={`lane lane-${index % 5}${dragOverLane === laneLabel ? ' drag-over' : ''}`} key={laneLabel} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverLane(laneLabel) }} onDragLeave={() => setDragOverLane('')} onDrop={(event) => { event.preventDefault(); moveToLane(event.dataTransfer.getData('text/plain'), laneLabel); setDragOverLane('') }}>
            <div className="lane-heading"><div className="lane-title"><span className="lane-indicator" /><h2>{laneLabel}</h2><span className="lane-count">{lane.length}</span></div>{canAddHere && <button className="lane-add" onClick={() => openNewForm(addSeed)} aria-label={`Add task to ${laneLabel}`}>＋</button>}</div>
            <div className="lane-cards">
              {lane.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} index={index} laneCount={laneLabels.length} boardBy={boardBy} now={clock} move={move} remove={remove} addUniversalTask={addUniversalTask} toggleUniversalTask={toggleUniversalTask} toggleTimer={toggleTimer} escalate={escalate} openMatrix={openMatrixForTicket} toggleStar={toggleTicketStar} openTicket={setSelectedTicketId} />)}
              {lane.length === 0 && <div className="empty-lane"><div className="empty-icon">{boardBy === 'State' && laneLabel === 'Resolved' ? <Check size={17} /> : <Ticket size={17} />}</div><span>{visible.length === 0 && filtersActive ? 'No tasks match these filters' : 'Nothing here yet'}</span>{visible.length === 0 && filtersActive ? index === 0 && <button onClick={clearFilters}>Clear filters <X size={13} /></button> : canAddHere && <button onClick={() => openNewForm(addSeed)}>Add a task <ArrowRight size={13} /></button>}</div>}
            </div>
          </div>
        })}
      </section> : <AdditionalView mode={cardSize} tickets={visible} allTickets={tickets} now={clock} boardBy={boardBy} openTicket={setSelectedTicketId} assessTicket={assessTicket} moveToLane={moveToLane} splitLeft={splitLeft} splitRight={splitRight} onSplitLeftChange={setSplitLeft} onSplitRightChange={setSplitRight} />}
      <footer className="board-footer"><span>Priority and escalation timings follow the attached matrix. Drag cards between lanes, or use the arrow controls on each card.</span><button onClick={() => openMatrixPanel()}>View escalation guidance <ArrowRight size={14} /></button></footer>
    </main>}

    {showViewPicker && <ViewPicker current={cardSize} onChoose={(value) => { setCardSize(value as CardSize); setShowViewPicker(false) }} onClose={() => setShowViewPicker(false)} />}
    {selectedTicket && <Overlay className="record-overlay" onClose={() => setSelectedTicketId('')}><TicketRecordPanel ticket={selectedTicket} now={clock} linkedAssetId={selectedAssetId} onOpenAsset={openAssetFromTicket} onToggleStar={() => toggleTicketStar(selectedTicket.id)} onSaveTags={(value) => saveTicketTags(selectedTicket.id, value)} onSaveNotes={(value) => saveTicketNotes(selectedTicket.id, value)} onClose={() => setSelectedTicketId('')} /></Overlay>}

    {descriptionPopupTicketId && tickets.find(t => t.id === descriptionPopupTicketId) && <Overlay className="description-popup-overlay" onClose={() => setDescriptionPopupTicketId('')}><DescriptionPopup ticket={tickets.find(t => t.id === descriptionPopupTicketId)!} onClose={() => setDescriptionPopupTicketId('')} onOpenTicket={() => { setDescriptionPopupTicketId(''); setSelectedTicketId(descriptionPopupTicketId) }} /></Overlay>}

    {showReports && <Overlay className="report-overlay" onClose={() => setShowReports(false)}><ReportsPanel tickets={tickets} now={clock} onClose={() => setShowReports(false)} /></Overlay>}
    {showSettings && <Overlay className="settings-overlay" onClose={() => setShowSettings(false)}><SettingsPanel screenPattern={screenPattern} onScreenPatternChange={setScreenPattern} view={cardSize} onViewChange={setCardSize} widgets={homeWidgets} onWidgetsChange={setHomeWidgets} onClose={() => setShowSettings(false)} /></Overlay>}
    {showGeminiSettings && <GeminiSettings onClose={() => setShowGeminiSettings(false)} />}
    {showThemeSettings && <ThemeSettings onClose={() => setShowThemeSettings(false)} />}

    {showDeleted && <Overlay onClose={() => setShowDeleted(false)}><section className="matrix-panel deleted-panel" role="dialog" aria-modal="true" aria-labelledby="deleted-title"><div className="panel-header"><div><div className="eyebrow">RECOVERABLE ITEMS</div><h2 id="deleted-title">Deleted tasks</h2></div><button className="close-button" onClick={() => setShowDeleted(false)} aria-label="Close deleted tasks"><X size={19} /></button></div><p className="panel-intro">Removed cards are stored here in this browser. Restore a task to put it back on the board.</p>{deletedTickets.length ? <div className="deleted-list">{deletedTickets.map((ticket) => <article className="deleted-item" key={ticket.id}><div><b>{ticket.id}</b><span className={`severity-badge ${sevClass(ticket.severity)}`}>{ticket.severity.split(' – ')[0]}</span><h3>{ticket.title}</h3><p>{ticket.recordType} · Deleted {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.deletedAt))}</p><small>Created by {ticket.createdBy || 'Not recorded'}</small></div><button className="restore-button" onClick={() => restore(ticket.id)}><RotateCcw size={14} /> Restore</button></article>)}</div> : <div className="deleted-empty"><Trash2 size={22} /><b>Nothing in Deleted</b><span>Removed tasks will appear here and can be restored.</span></div>}</section></Overlay>}

    {showModel && <Overlay onClose={() => setShowModel(false)}><section className="matrix-panel model-panel" role="dialog" aria-modal="true" aria-labelledby="model-title"><div className="panel-header"><div><div className="eyebrow">PROTOTYPE GUIDE</div><h2 id="model-title">ServiceNow task model</h2></div><button className="close-button" onClick={() => setShowModel(false)} aria-label="Close task model"><X size={19} /></button></div><p className="panel-intro">The board uses the Task table pattern as a design reference. Task records here are local mock data and are not connected to an instance.</p>
      <div className="model-callout"><Layers size={17} /><div><b>Shared task fields</b><p>Task number, task type, state, priority, assignment group, assigned to, and description are shown across the mock workflow. Affected user is an optional local intake field. Priority follows the attached P1–P4 escalation matrix; real instances can use different choices.</p></div></div>
      <h3 className="section-label model-label">Child record types</h3><div className="table-type-list">{recordTypes.map((type) => <div className="table-type-row" key={type}><span>{type}</span><code>{tableNames[type]}</code><span className="table-type-tag">Task child</span></div>)}</div>
      <h3 className="section-label model-label">Capabilities represented</h3><div className="capability-list">
        <article><Workflow size={16} /><div><b>Visual Task Board</b><p>Move cards through status lanes; each card represents one child task record. Actual state choices can vary by table.</p></div></article>
        <article><Building2 size={16} /><div><b>Assignment rules · mock</b><p>A transparent demo rule suggests an assignment group from record type, priority, and keywords. You can change it before creating a task.</p></div></article>
        <article><BrainCircuit size={16} /><div><b>Task Intelligence · mock</b><p>Keyword suggestions preview a record type, priority, and group. This is a small rule-based demo, not a machine-learning model.</p></div></article>
        <article><ListChecks size={16} /><div><b>Universal Task · mock</b><p>Add requester follow-up actions to a card and mark each action complete.</p></div></article>
      </div>
      <div className="model-sources"><span>Reference</span><a href="https://www.servicenow.com/docs/r/yokohama/platform-administration/table-administration-and-data-management/c_TaskTable.html" target="_blank" rel="noreferrer">Task table documentation <ArrowRight size={12} /></a><a href="https://www.servicenow.com/docs/r/yokohama/platform-user-interface/visual-task-boards/vtb-types.html" target="_blank" rel="noreferrer">Visual Task Boards <ArrowRight size={12} /></a></div>
    </section></Overlay>}

    {showMatrix && <Overlay className="matrix-overlay" onClose={() => closeMatrix()}><section className="matrix-panel" role="dialog" aria-modal="true" aria-labelledby="matrix-title">
      <div className="panel-header"><div><div className="eyebrow">REFERENCE</div><h2 id="matrix-title">Escalation matrix</h2></div><button className="close-button" onClick={closeMatrix} aria-label="Close matrix"><X size={19} /></button></div>
      <p className="panel-intro">Use severity to guide response, resolution, and escalation. Select a ticket number to filter the board to that record.</p>
      <h3 className="section-label">Priority & service levels</h3><div className="severity-list">{severityRows.map((row) => {
        const related = tickets.filter((ticket) => ticket.severity === row.level)
        return <article className="severity-row" key={row.level}><div className="severity-top"><span className={`severity-badge ${sevClass(row.level)}`}>{row.level.split(' – ')[0]}</span><span className="severity-name">{row.level.split(' – ')[1]}</span></div><p>{row.definition}</p><div className="example"><b>Example</b>{row.examples}</div><div className="sla-grid"><div><span>First response</span><b>{row.response}</b></div><div><span>Resolution target</span><b>{row.resolution}</b></div><div><span>Escalate to Tier 2</span><b>{row.tier2}</b></div><div><span>Escalate to Tier 3</span><b>{row.tier3}</b></div></div><div className="related-tickets"><span>Related tickets</span>{related.length ? related.map((ticket) => <button className={matrixFocusId === ticket.id ? 'selected' : ''} key={ticket.id} onClick={() => openRelatedTicket(ticket.id)} title={`Show ${ticket.title} on the board`}>{ticket.id}</button>) : <em>None on board</em>}</div></article>
      })}</div>
      <h3 className="section-label contacts-label">Escalation contacts · placeholders</h3><div className="contacts-table"><div className="contact-head"><span>Tier</span><span>Role / contact</span><span>Escalate if unresolved</span></div>{tierRows.map((row) => <div className="contact-row" key={row.tier}><b>{row.tier}</b><span>{row.role}<small>{row.name} · <a href={`mailto:${row.email}?subject=IT%20escalation`} title="Placeholder email address; replace with the real contact">{row.email}</a></small></span><span>{row.when}<small>{row.phone}</small></span></div>)}</div>
      <h3 className="section-label contacts-label">Escalation path by priority</h3><div className="contacts-table escalation-path"><div className="contact-head"><span>Priority</span><span>Tier 1 response</span><span>Tier 2 / Tier 3</span></div>{severityRows.map((row) => <div className="contact-row" key={`path-${row.level}`}><b>{row.level.split(' – ')[0]}</b><span>Respond within {row.response}</span><span>Tier 2: {row.tier2}<small>Tier 3: {row.tier3}</small></span></div>)}</div>
      <div className="matrix-note">Source: Escalation Matrix - VW.xlsx <span>The source has no contact names, emails, or phone numbers. Example.com addresses above are placeholders. Email actions open a test draft only; nothing sends automatically.</span></div>
    </section></Overlay>}

    {showImport && <Overlay className="import-overlay" onClose={() => setShowImport(false)}><section className="form-panel import-panel" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="panel-header"><div><div className="eyebrow">EMAIL INTAKE · LOCAL DEMO</div><h2 id="import-title">Create a task from email</h2></div><button className="close-button" onClick={() => setShowImport(false)} aria-label="Close email import"><X size={19} /></button></div><p className="panel-intro">Paste the email text. The board will suggest fields from labels such as Subject, Issue, Requester, Affected user, Priority, and Assignment group. You can review and edit everything before creating the task.</p><label className="field email-paste-field">Email text<textarea autoFocus value={emailText} onChange={(event) => { setEmailText(event.target.value); setImportError('') }} placeholder={'From: Yuki Katayama <yuki@example.com>\nSubject: VPN sign-in issue\n\nIssue: VPN sign-in failing for remote staff\nRequester: Yuki Katayama\nAffected user: Yuki Katayama\nPriority: P2\nImpact: Remote access is unavailable.'} rows={14} /></label><div className="import-note">Email text stays in this browser. Import only extracts ticket details; it does not open links, follow instructions, or send messages.</div>{importError && <div className="form-error" role="alert">{importError}</div>}<div className="form-footer"><button className="text-button" onClick={() => setShowImport(false)}>Cancel</button><button className="primary-button" onClick={importEmail}><Mail size={15} /> Review ticket fields</button></div></section></Overlay>}

    {exportFormatPopup && <Overlay onClose={() => setExportFormatPopup(null)}><section className="matrix-panel" role="dialog" aria-modal="true" aria-labelledby="export-title" style={{ minWidth: '340px' }}><div className="panel-header"><h2 id="export-title">{exportFormatPopup === 'filtered' ? 'Export filtered assets' : 'Export all inventory'}</h2><button className="close-button" onClick={() => setExportFormatPopup(null)} aria-label="Close export"><X size={19} /></button></div><p className="panel-intro">Choose a file format for the export.</p><div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><button className="primary-button" style={{ justifyContent: 'flex-start', width: '100%' }} onClick={() => { setExportFormatPopup(null); setShowToolsMenu(false); if (exportFormatPopup === 'filtered') runExport('csv'); else exportAllInventory('csv', assets, stock, tickets) }}><Download size={16} /> CSV spreadsheet</button><button className="primary-button" style={{ justifyContent: 'flex-start', width: '100%', background: 'white', color: '#264e5f', border: '1px solid #d9e0e2' }} onClick={() => { setExportFormatPopup(null); setShowToolsMenu(false); if (exportFormatPopup === 'filtered') runExport('xlsx'); else exportAllInventory('xlsx', assets, stock, tickets) }}><Download size={16} /> Excel spreadsheet</button></div></section></Overlay>}

    {showPolishModal && <Overlay className="polish-modal-overlay" onClose={() => setShowPolishModal(false)}><section className="polish-modal" role="dialog" aria-modal="true" aria-labelledby="polish-title"><div className="polish-header"><h3 id="polish-title">Polished Description</h3><button className="close-button" onClick={() => setShowPolishModal(false)} aria-label="Close"><X size={18} /></button></div>{polishError && <div className="polish-error">⚠️ {polishError.message}</div>}{polishResult && <div className="polish-content"><p className="polish-label"><strong>Suggested title:</strong></p><p className="polish-text">{polishResult.split('\n')[0]}</p><p className="polish-label"><strong>Structured description:</strong></p><div className="polish-text">{polishResult.split('\n').slice(1, polishResult.length - 2).join('\n')}</div><p className="polish-label"><strong>Suggested priority:</strong></p><p className="polish-text">{polishResult.split('\n')[polishResult.split('\n').length - 1]}</p></div>}<div className="polish-footer"><button className="text-button" onClick={() => setShowPolishModal(false)}>Discard</button><button className="primary-button" onClick={acceptPolishedDescription}>Use suggested description</button></div></section></Overlay>}

    {page === 'new' && <main className="main-content new-task-page"><section className="form-panel" aria-labelledby="form-title"><div className="panel-header"><div><div className="eyebrow">TASK INTAKE · LOCAL DEMO</div><h2 id="form-title">Create a task record</h2></div><button className="close-button" onClick={() => setPage('board')} aria-label="Close form"><X size={19} /></button></div><p className="panel-intro">Choose a child record type. Shared task fields are included automatically in this mock board.</p>{importedFromEmail && <div className="import-review-note"><Mail size={14} /><span><b>Imported from email.</b> Review the suggested fields and update anything missing before creating the ticket.</span></div>}
      <div className="form-grid"><label className="field full">Short description <em>*</em><input autoFocus value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="What needs attention?" /></label><label className="field">Record type<select value={form.recordType} onChange={(event) => updateForm('recordType', event.target.value)}>{recordTypes.map((type) => <option key={type} value={type}>{type} · {tableNames[type]}</option>)}</select></label><label className="field">Priority / severity<select value={form.severity} onChange={(event) => updateForm('severity', event.target.value)}>{severityRows.map((row) => <option key={row.level}>{row.level}</option>)}</select></label><label className="field">Task number <span>Optional</span><input value={form.id} onChange={(event) => updateForm('id', event.target.value)} placeholder="Auto-assigned if blank" /></label><label className="field">Created by<input value={form.createdBy} onChange={(event) => updateForm('createdBy', event.target.value)} placeholder="Person entering this ticket" /></label><label className="field">Department<select value={form.department} onChange={(event) => updateForm('department', event.target.value)}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label><label className="field">Requester<input value={form.requester} onChange={(event) => updateForm('requester', event.target.value)} placeholder="Person who reported it" /></label><label className="field">Affected user<input value={form.affectedUser} onChange={(event) => updateForm('affectedUser', event.target.value)} placeholder="Person impacted by the issue" /></label><label className="field">Affected user email <span>Optional</span><input type="email" value={form.affectedUserEmail} onChange={(event) => updateForm('affectedUserEmail', event.target.value)} placeholder="Used for resolution email drafts" /></label><label className="field">Assigned to<input value={form.assignee} onChange={(event) => updateForm('assignee', event.target.value)} placeholder="Task owner" /></label><label className="field full">Description<div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}><textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Impact, symptoms, and what has been tried" rows={3} style={{ flex: 1 }} /><button type="button" className="primary-button" onClick={handlePolishDescription} disabled={polishLoading} style={{ marginTop: '4px', whiteSpace: 'nowrap' }}><Sparkles size={14} /> Polish</button></div></label><label className="field">Assignment group<select value={form.assignmentGroup || suggestGroup(form.recordType, form.severity, groupText)} onChange={(event) => updateForm('assignmentGroup', event.target.value)}>{assignmentGroups.map((group) => <option key={group}>{group}</option>)}</select><small className="field-hint">Suggested by a demo assignment rule · you can change it</small></label>{showFormOptional && <><label className="field">Linked asset <span>Optional</span><select value={form.assetId} onChange={(event) => updateForm('assetId', event.target.value)}><option value="">No linked asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.id} · {asset.name}{asset.assignedTo ? ' · ' + asset.assignedTo : ''}</option>)}</select></label><label className="field full">Next due <span>Optional</span><input type="datetime-local" value={form.dueAt} onChange={(event) => updateForm('dueAt', event.target.value)} /></label><label className="field full">Tags <span>Optional · separate with commas</span><input value={form.tagsText} onChange={(event) => updateForm('tagsText', event.target.value)} placeholder="VPN, payroll, follow-up…" /></label><label className="field full">Work notes <span>Optional</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Internal notes or next action" rows={2} /></label></>}</div>
      {!showFormOptional && <button className="form-show-more-btn" onClick={() => setShowFormOptional(true)} type="button">Show more options</button>}
      <div className="triage-panel"><div className="triage-head"><div className="triage-icon"><Sparkles size={15} /></div><div><b>Triage suggestion</b><span>MOCK · KEYWORD RULES</span></div></div>{form.title.trim() || form.description.trim() ? <><p>{currentSuggestion.reason}</p><div className="triage-tags"><span>{currentSuggestion.recordType}</span><span>{currentSuggestion.severity.split(' – ')[0]}</span><span>{currentSuggestion.group}</span></div><button onClick={() => setForm((current) => ({ ...current, recordType: currentSuggestion.recordType, severity: currentSuggestion.severity, assignmentGroup: currentSuggestion.group }))}>Apply suggestion <ArrowRight size={13} /></button></> : <p>Add a short description to see a sample classification suggestion.</p>}</div>
      {formError && <div className="form-error" role="alert">{formError}</div>}<div className="form-footer"><button className="text-button" onClick={() => setPage('board')}>Cancel</button><button className="primary-button" onClick={addTicket}><Check size={16} /> Create task</button></div></section></main>}
  </div>
}

function HomeScreen({ tickets, now, showTickets, openTicket, searchTicket, openReports, openSettings, widgets, openExplore }: { tickets: TicketItem[]; now: number; showTickets: (filter?: MetricFilter, useList?: boolean) => void; openTicket: (id: string) => void; searchTicket: (id: string) => void; openReports: () => void; openSettings: () => void; widgets: HomeWidgets; openExplore: () => void }) {
  type HomePopup = { type: 'kpi' | 'attention'; filter: MetricFilter } | { type: 'insight'; kind: DetailKey } | { type: 'arrange'; kind: InsightKey; columns: number } | null
  const [popup, setPopup] = useState<HomePopup>(null)
  const [insightOrder, setInsightOrder] = useState<InsightKey[]>(loadInsightOrder)
  useEffect(() => { saveInsightOrder(insightOrder) }, [insightOrder])
  const chartGrid = useRef<HTMLElement>(null)
  // How many cards sit side by side right now (two on a wide screen, one on a phone); Up and Down move by this many.
  const measureColumns = () => {
    const cards = Array.from(chartGrid.current?.children ?? []).filter((element) => element.classList.contains('home-chart-card'))
    if (cards.length < 2) return 1
    const top = cards[0].getBoundingClientRect().top
    return Math.max(1, cards.filter((element) => Math.abs(element.getBoundingClientRect().top - top) < 8).length)
  }
  const closePopup = () => setPopup(null)
  const open = tickets.filter((ticket) => ticket.status !== 'Resolved')
  const closed = tickets.filter((ticket) => ticket.status === 'Resolved')
  const highPriority = open.filter((ticket) => ticket.severity.startsWith('P1') || ticket.severity.startsWith('P2'))
  const overdue = open.filter((ticket) => slaTime(ticket, now).breached)
  const escalated = open.filter((ticket) => ticket.status === 'Escalated')
  const escalationDueTickets = open.filter((ticket) => escalationDue(ticket, now))
  const waiting = open.filter((ticket) => ticket.status === 'Waiting on User')
  const unassigned = open.filter((ticket) => !ticket.assignee.trim())
  const dateLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(now))

  const kpiCards = [
    { filter: 'active' as MetricFilter, label: 'Open tickets', count: open.length, tone: 'blue', icon: <Ticket size={19} />, action: 'View open' },
    { filter: 'resolved' as MetricFilter, label: 'Closed tickets', count: closed.length, tone: 'green', icon: <Check size={19} />, action: 'View closed' },
    { filter: 'high-priority' as MetricFilter, label: 'P1 / P2 open', count: highPriority.length, tone: 'coral', icon: <AlertTriangle size={19} />, action: 'View priority' },
    { filter: 'overdue' as MetricFilter, label: 'Past resolution SLA', count: overdue.length, tone: 'amber', icon: <Clock3 size={19} />, action: 'View overdue' },
  ]
  const attentionQueues = [
    { filter: 'escalated' as MetricFilter, label: 'Escalated', count: escalated.length, icon: <ArrowUp size={14} /> },
    { filter: 'escalation-due' as MetricFilter, label: 'Escalation due', count: escalationDueTickets.length, icon: <ShieldAlert size={14} /> },
    { filter: 'waiting' as MetricFilter, label: 'Waiting on user', count: waiting.length, icon: <Clock3 size={14} /> },
    { filter: 'unassigned' as MetricFilter, label: 'Unassigned', count: unassigned.length, icon: <Layers size={14} /> },
  ]
  const kpiContent = (item: typeof kpiCards[number]) => <><span className={`home-kpi-icon ${item.tone}`}>{item.icon}</span><span className="home-kpi-label">{item.label}</span><strong>{item.count}</strong><span className="home-kpi-action">{item.action} <ArrowRight size={14} /></span></>
  const openQueue = (filter: MetricFilter) => { closePopup(); showTickets(filter, true) }
  const openKpi = popup?.type === 'kpi' ? kpiCards.find((item) => item.filter === popup.filter) : undefined
  const openAttention = popup?.type === 'attention' ? attentionQueues.find((item) => item.filter === popup.filter) : undefined

  const ctx: InsightContext = {
    tickets, now, statuses,
    counts: { open: open.length, closed: closed.length, overdue: overdue.length, escalated: escalated.length, escalationDue: escalationDueTickets.length, unassigned: unassigned.length },
    breachedIds: new Set(overdue.map((ticket) => ticket.id)),
    showTickets: (filter) => showTickets(filter, true),
    openTicket,
  }
  const visibleInsights = insightOrder.filter((key) => widgets[key])
  return <main className="main-content home-content">
    <section className="home-hero" aria-labelledby="home-title"><div><div className="home-hero-kicker"><span className="home-hero-dot" /> SERVICE DESK OVERVIEW <span className="home-hero-date">{dateLabel}</span></div><h1 id="home-title">Good to see you.</h1><p>See what needs attention across your tickets, then open the view that helps you act.</p><button onClick={openExplore}>Explore tickets <ArrowRight size={16} /></button></div><div className="home-hero-visual" aria-hidden="true"><span className="home-hero-ring ring-one" /><span className="home-hero-ring ring-two" /><div className="home-hero-number">{open.length}<small>open tickets</small></div></div></section>
    <div className="home-section-heading"><div><span className="eyebrow">AT A GLANCE</span><h2>Ticket overview</h2></div><p>Based on the tickets saved in this browser</p></div>
    <section className="home-kpi-grid" aria-label="Ticket totals">
      {kpiCards.map((item) => <button className="home-kpi" key={item.filter} onClick={() => setPopup({ type: 'kpi', filter: item.filter })}>{kpiContent(item)}</button>)}
    </section>
    <section className="home-action-strip" aria-label="Other ticket queues"><span>NEEDS ATTENTION</span>{attentionQueues.map((item) => <button key={item.filter} onClick={() => setPopup({ type: 'attention', filter: item.filter })}>{item.icon} {item.label} <b>{item.count}</b></button>)}</section>
    <div className="home-section-heading home-insights-heading"><div><span className="eyebrow">CURRENT PICTURE</span><h2>Operations insights</h2></div><div className="home-insights-actions"><button className="home-reports-link" onClick={openSettings}><Settings2 size={15} /> Customize home</button><button className="home-reports-link" onClick={openReports}><BarChart3 size={15} /> Open reports <ArrowRight size={14} /></button></div></div>
    <section className="home-chart-grid" aria-label="Ticket charts" ref={chartGrid}>
      {visibleInsights.map((key) => <InsightCard key={key} kind={key} ctx={ctx} onOpen={key === 'recent' ? undefined : () => setPopup({ type: 'insight', kind: key })} />)}
      {!Object.values(widgets).some(Boolean) && <div className="home-charts-empty"><BarChart3 size={22} /><b>No charts selected</b><p>Choose the charts you want on Home.</p><button onClick={openSettings}>Open settings</button></div>}
    </section>
    {openKpi && <TicketPopout eyebrow="TICKET OVERVIEW" title={openKpi.label} titleId="ticket-card-popout-title" description="Current total based on the tickets stored in this workspace." onClose={closePopup}
      actions={<PopoutActions onClose={closePopup} onOpen={() => openQueue(openKpi.filter)} />}>
      <div className="ticket-card-popout-preview"><div className="home-kpi" aria-hidden="true">{kpiContent(openKpi)}</div></div>
    </TicketPopout>}
    {openAttention && <TicketPopout eyebrow="NEEDS ATTENTION" title={openAttention.label} titleId="attention-popout-title" description="Current total based on the active ticket queues in this workspace." onClose={closePopup}
      actions={<PopoutActions onClose={closePopup} onOpen={() => openQueue(openAttention.filter)} />}>
      <div className="ticket-card-popout-preview"><div className="attention-popout-card" aria-hidden="true">{openAttention.icon} {openAttention.label} <b>{openAttention.count}</b></div></div>
    </TicketPopout>}
    {popup?.type === 'insight' && <InsightDetail kind={popup.kind} ctx={ctx} onClose={closePopup} onOpenQueue={openQueue} onOpenTicket={(id) => { closePopup(); searchTicket(id) }} onArrange={() => setPopup({ type: 'arrange', kind: popup.kind, columns: measureColumns() })} />}
    {popup?.type === 'arrange' && <ArrangeInsight kind={popup.kind} ctx={ctx} visible={visibleInsights} columns={popup.columns} onClose={closePopup}
      onMove={(direction) => { const next = moveInsight(insightOrder, visibleInsights, popup.kind, direction, popup.columns); if (next) setInsightOrder(next); closePopup() }} />}
  </main>
}

function Metric({ icon, label, value, tone, selected, onClick }: { icon: React.ReactNode; label: string; value: number; tone: string; selected: boolean; onClick: () => void }) { return <button type="button" className={`metric${selected ? ' selected' : ''}`} aria-label={`Filter tickets: ${label} (${value})`} aria-pressed={selected} title={`Show ${label.toLowerCase()} tickets`} onClick={onClick}><div className={`metric-icon ${tone}`}>{icon}</div><div><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div></button> }

function SettingsPanel({ screenPattern, onScreenPatternChange, view, onViewChange, widgets, onWidgetsChange, onClose }: { screenPattern: ScreenPattern; onScreenPatternChange: (value: ScreenPattern) => void; view: CardSize; onViewChange: (value: CardSize) => void; widgets: HomeWidgets; onWidgetsChange: (value: HomeWidgets) => void; onClose: () => void }) {
  const choices: { key: keyof HomeWidgets; label: string; detail: string; extra?: boolean }[] = [
    { key: 'status', label: 'Tickets by state', detail: 'Show the current workflow distribution.' },
    { key: 'priority', label: 'Open tickets by priority', detail: 'Show the P1–P4 mix for open work.' },
    { key: 'intake', label: 'Ticket intake', detail: 'Show hourly ticket creation over 24 hours.' },
    { key: 'recent', label: 'Recently created', detail: 'Show the newest tickets with quick access.' },
    { key: 'sla', label: 'SLA health', detail: 'Show tickets within and beyond their SLA target.', extra: true },
    { key: 'escalation', label: 'Escalation workload', detail: 'Show escalated tickets and upcoming escalation demand.', extra: true },
    { key: 'assignment', label: 'Assignment coverage', detail: 'Show assigned and unassigned ticket coverage.', extra: true },
    { key: 'resolution', label: 'Resolution rate', detail: 'Show resolved tickets as a share of all tickets.', extra: true },
  ]
  return <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header className="settings-header"><div><div className="eyebrow">LOCAL PREFERENCES</div><h2 id="settings-title">Settings</h2></div><button className="close-button" onClick={onClose} aria-label="Close settings"><X size={19} /></button></header>
    <p className="settings-intro">These display choices are saved in this browser. Home remains the landing page.</p>
    <section className="settings-section"><h3>Home charts</h3><p>Choose which charts and lists appear on your Home screen.</p><div className="settings-widget-list">{choices.map((choice) => <label key={choice.key} {...(choice.extra ? { 'data-extra-insight-toggle': choice.key } : {})}><input type="checkbox" checked={widgets[choice.key]} onChange={(event) => onWidgetsChange({ ...widgets, [choice.key]: event.target.checked })} /><span><b>{choice.label}</b><small>{choice.detail}</small></span></label>)}</div><button className="settings-reset" onClick={() => onWidgetsChange({ ...defaultHomeWidgets })}>Show all Home charts</button></section>
    <section className="settings-section"><h3>Ticket view</h3><p>The selected view is remembered when you open Tickets. Home still opens first.</p><label className="settings-view-label">Current ticket view<select value={view} onChange={(event) => onViewChange(event.target.value as CardSize)}><optgroup label="Records"><option value="list">List View</option><option value="split">Split View</option></optgroup><optgroup label="Kanban"><option value="small">Kanban Compact</option><option value="regular">Kanban Detailed</option></optgroup><optgroup label="Operations"><option value="my-work">My Work</option><option value="sla">SLA View</option><option value="workload">Workload View</option><option value="escalation">Escalation View</option><option value="department">Department View</option></optgroup><optgroup label="Planning and insights"><option value="calendar">Calendar View</option><option value="priority-matrix">Priority Matrix</option><option value="analytics">Analytics View</option><option value="graph">Graph View</option><option value="timeline">Timeline View</option></optgroup></select></label></section>
    <section className="settings-section settings-readonly"><h3>Workflow defaults</h3><div><Clock3 size={17} /><span><b>Resolution SLA</b><small>24-hour calendar time, including weekends and holidays.</small></span></div><div><Mail size={17} /><span><b>Email drafts</b><small>Escalation and resolution actions open test drafts. Nothing sends automatically.</small></span></div><div><Layers size={17} /><span><b>Ticket data</b><small>This prototype stores tickets and preferences in this browser.</small></span></div></section>
    <AccountSection />
    <BackupSection />
    <section className="settings-section screen-pattern-settings"><h3>Screen pattern</h3><p>Choose the background texture used across the workspace.</p><div className="screen-pattern-grid">{SCREEN_PATTERNS.map((pattern) => <button key={pattern.id} type="button" className={'screen-pattern-option' + (pattern.id === screenPattern ? ' active' : '')} data-pattern={pattern.id} aria-pressed={pattern.id === screenPattern} onClick={() => onScreenPatternChange(pattern.id)}><b>{pattern.label}</b><small>{pattern.detail}</small></button>)}</div></section>
    <div className="settings-footer"><button className="primary-button" onClick={onClose}>Done</button></div>
  </section>
}

function DescriptionPopup({ ticket, onClose, onOpenTicket }: { ticket: TicketItem; onClose: () => void; onOpenTicket: () => void }) {
  const [showCallMenu, setShowCallMenu] = useState(false)
  const [showMessageMenu, setShowMessageMenu] = useState(false)

  const initiateCall = (service: 'Teams' | 'ZOOM' | 'Webex') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const userInfo = ticket.affectedUser || ticket.requester || 'User'
    const callEntry = `[${timestamp}] - [${service}] Call initiated with ${userInfo}`
    const currentNotes = ticket.notes || ''
    const updatedNotes = currentNotes ? `${currentNotes}\n${callEntry}` : callEntry
    ticket.notes = updatedNotes

    const serviceUrls: { [key: string]: string } = {
      'Teams': 'https://teams.microsoft.com/',
      'ZOOM': 'https://zoom.us/',
      'Webex': 'https://webex.com/'
    }
    const url = serviceUrls[service]
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowCallMenu(false)
  }

  const sendMessage = (service: 'Teams' | 'ZOOM' | 'Webex') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const userInfo = ticket.affectedUser || ticket.requester || 'User'
    const messageEntry = `[${timestamp}] - [${service}] Message sent to ${userInfo}`
    const currentNotes = ticket.notes || ''
    const updatedNotes = currentNotes ? `${currentNotes}\n${messageEntry}` : messageEntry
    ticket.notes = updatedNotes

    const serviceUrls: { [key: string]: string } = {
      'Teams': 'https://teams.microsoft.com/',
      'ZOOM': 'https://zoom.us/',
      'Webex': 'https://webex.com/'
    }
    const url = serviceUrls[service]
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowMessageMenu(false)
  }

  return <div className="description-popup">
    <div className="description-popup-header">
      <h3>{ticket.title}</h3>
      <button onClick={onClose} aria-label="Close"><X size={18} /></button>
    </div>
    <div className="description-popup-content">
      <div className="description-popup-actions" style={{ position: 'relative', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowCallMenu(!showCallMenu)} style={{ border: 'none', background: 'transparent', color: '#0066cc', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: '500' }}><Phone size={14} /> Call</button>
          {showCallMenu && <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #d9e0e2', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '160px', marginTop: '4px' }}>
            <button onClick={() => initiateCall('Teams')} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#333', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>Teams</button>
            <button onClick={() => initiateCall('ZOOM')} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#333', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>ZOOM</button>
            <button onClick={() => initiateCall('Webex')} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#333', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>Webex</button>
          </div>}
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowMessageMenu(!showMessageMenu)} style={{ border: 'none', background: 'transparent', color: '#0066cc', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: '500' }}><MessageSquare size={14} /> Message</button>
          {showMessageMenu && <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #d9e0e2', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '160px', marginTop: '4px' }}>
            <button onClick={() => sendMessage('Teams')} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#333', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>Teams</button>
            <button onClick={() => sendMessage('ZOOM')} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#333', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>ZOOM</button>
            <button onClick={() => sendMessage('Webex')} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#333', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>Webex</button>
          </div>}
        </div>
        <button onClick={() => { const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); const userInfo = ticket.affectedUser || ticket.requester || 'User'; const emailEntry = `[${timestamp}] - Email sent to ${userInfo}`; ticket.notes = ticket.notes ? `${ticket.notes}\n${emailEntry}` : emailEntry; const email = ticket.affectedUserEmail || ''; if (email) { const link = document.createElement('a'); link.href = `mailto:${email}`; document.body.appendChild(link); link.click(); document.body.removeChild(link); } }} style={{ border: 'none', background: 'transparent', color: '#0066cc', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: '500' }}><Mail size={14} /> Email</button>
        <div style={{ flex: 1 }} />
        <CompactSLATimer ticketId={ticket.id} createdAt={ticket.createdAt} status={ticket.status} compact={true} />
      </div>
      <div className="description-section">
        <h5>Short description</h5>
        <p>{ticket.title}</p>
      </div>
      <div className="description-section">
        <h5>Full description</h5>
        <p>{ticket.description || 'No description recorded.'}</p>
      </div>
      <div className="description-section">
        <h5>Record type</h5>
        <p>{ticket.recordType}</p>
      </div>
      <div className="description-actions">
        <button onClick={onOpenTicket} className="description-open-btn">Open full ticket <ArrowRight size={14} /></button>
      </div>
    </div>
  </div>
}

function ReportsPanel({ tickets, now, onClose }: { tickets: TicketItem[]; now: number; onClose: () => void }) {
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'all'>('30')
  const start = period === 'all' ? -Infinity : now - Number(period) * 24 * 60 * 60_000
  const created = tickets.filter((ticket) => new Date(ticket.createdAt).getTime() >= start)
  const resolved = tickets.filter((ticket) => ticket.status === 'Resolved' && ticket.resolvedAt && new Date(ticket.resolvedAt).getTime() >= start && new Date(ticket.resolvedAt).getTime() >= new Date(ticket.createdAt).getTime())
  const open = tickets.filter((ticket) => ticket.status !== 'Resolved')
  const closed = tickets.filter((ticket) => ticket.status === 'Resolved')
  const within = resolved.filter((ticket) => new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime() <= resolutionTargetMs(ticket.severity))
  const durations = resolved.map((ticket) => new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime()).sort((a, b) => a - b)
  const median = durations.length ? durations.length % 2 ? durations[Math.floor(durations.length / 2)] : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2 : null
  const durationLabel = (ms: number | null) => ms === null ? '—' : Math.floor(ms / 3_600_000) + 'h ' + String(Math.floor(ms % 3_600_000 / 60_000)).padStart(2, '0') + 'm'
  const byPriority = severityRows.map((item) => {
    const key = item.level.split(' – ')[0]
    const done = resolved.filter((ticket) => ticket.severity.startsWith(key))
    const times = done.map((ticket) => new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime()).sort((a, b) => a - b)
    const middle = times.length ? times.length % 2 ? times[Math.floor(times.length / 2)] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2 : null
    const success = done.filter((ticket) => new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime() <= resolutionTargetMs(ticket.severity)).length
    return { key, label: item.level, target: item.resolution, count: done.length, success, middle, open: open.filter((ticket) => ticket.severity.startsWith(key)).length }
  })
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7 * 7)
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const begin = new Date(monday)
    begin.setDate(begin.getDate() + index * 7)
    const end = new Date(begin)
    end.setDate(end.getDate() + 7)
    return { label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(begin), created: tickets.filter((ticket) => { const time = new Date(ticket.createdAt).getTime(); return time >= begin.getTime() && time < end.getTime() }).length, resolved: tickets.filter((ticket) => { const time = ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : NaN; return time >= begin.getTime() && time < end.getTime() }).length }
  })
  const maxWeek = Math.max(1, ...weeks.map((week) => Math.max(week.created, week.resolved)))
  const groups = [...new Set(tickets.map((ticket) => ticket.assignmentGroup || 'No group'))].map((name) => ({ name, open: open.filter((ticket) => (ticket.assignmentGroup || 'No group') === name).length, overdue: open.filter((ticket) => (ticket.assignmentGroup || 'No group') === name && slaTime(ticket, now).breached).length, created: created.filter((ticket) => (ticket.assignmentGroup || 'No group') === name).length, resolved: resolved.filter((ticket) => (ticket.assignmentGroup || 'No group') === name).length })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
  const assignees = [...new Set(tickets.map((ticket) => ticket.assignee.trim() || 'Unassigned'))].map((name) => ({ name, open: open.filter((ticket) => (ticket.assignee.trim() || 'Unassigned') === name).length, overdue: open.filter((ticket) => (ticket.assignee.trim() || 'Unassigned') === name && slaTime(ticket, now).breached).length, created: created.filter((ticket) => (ticket.assignee.trim() || 'Unassigned') === name).length, resolved: resolved.filter((ticket) => (ticket.assignee.trim() || 'Unassigned') === name).length })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
  const periodLabel = period === 'all' ? 'all time' : 'the last ' + period + ' days'

  return <section className="report-panel" role="dialog" aria-modal="true" aria-labelledby="reports-title">
    <header className="report-header"><div><div className="eyebrow">SERVICE DESK ANALYTICS</div><h2 id="reports-title">Reports</h2></div><div className="report-header-actions"><label>Period <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></label><button className="close-button" onClick={onClose} aria-label="Close reports"><X size={19} /></button></div></header>
    <p className="report-intro">Created and resolved figures cover {periodLabel}. Closed tickets without a completion timestamp are counted as closed, but omitted from resolution-time and SLA measures. Times use the selected 24-hour calendar schedule.</p>
    <div className="report-kpis"><div><strong>{closed.length}</strong><span>Closed now</span><small>{tickets.length} total tickets</small></div><div><strong>{resolved.length ? Math.round(within.length / resolved.length * 100) + '%' : '—'}</strong><span>Resolved within SLA</span><small>{within.length} of {resolved.length} measured</small></div><div><strong>{durationLabel(median)}</strong><span>Median time to resolve</span><small>{resolved.length} timed resolutions</small></div><div><strong>{created.length}</strong><span>Created</span><small>In {periodLabel}</small></div></div>
    <section className="report-section"><div className="report-section-heading"><h3>SLA by priority</h3><p>Only tickets with a recorded resolution time contribute to the SLA rate.</p></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Priority</th><th>Resolved</th><th>Within SLA</th><th>Median to resolve</th><th>Target</th><th>Open now</th></tr></thead><tbody>{byPriority.map((item) => <tr key={item.key}><th><span className={'report-priority ' + item.key.toLowerCase()}>{item.label}</span></th><td>{item.count}</td><td>{item.count ? Math.round(item.success / item.count * 100) + '%' : '—'}</td><td>{durationLabel(item.middle)}</td><td>{item.target}</td><td>{item.open}</td></tr>)}</tbody></table></div></section>
    <section className="report-section"><div className="report-section-heading"><h3>Ticket activity by week</h3><p>Created and resolved tickets over the last eight calendar weeks.</p></div><div className="report-week-chart" role="img" aria-label="Weekly created and resolved ticket counts">{weeks.map((week) => <div className="report-week" key={week.label}><div className="report-week-bars"><i className="created" title={week.created + ' created'} style={{ height: Math.max(2, week.created / maxWeek * 100) + '%' }} /><i className="resolved" title={week.resolved + ' resolved'} style={{ height: Math.max(2, week.resolved / maxWeek * 100) + '%' }} /></div><span>{week.label}</span></div>)}</div><div className="report-legend"><span><i className="created" /> Created</span><span><i className="resolved" /> Resolved</span></div></section>
    <div className="report-breakdown-grid"><section className="report-section"><div className="report-section-heading"><h3>By assignment group</h3><p>Current open load and period activity.</p></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Group</th><th>Open</th><th>Past SLA</th><th>Created</th><th>Resolved</th></tr></thead><tbody>{groups.map((group) => <tr key={group.name}><th>{group.name}</th><td>{group.open}</td><td>{group.overdue}</td><td>{group.created}</td><td>{group.resolved}</td></tr>)}</tbody></table></div></section><section className="report-section"><div className="report-section-heading"><h3>By assignee</h3><p>Current open load and period activity.</p></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Assignee</th><th>Open</th><th>Past SLA</th><th>Created</th><th>Resolved</th></tr></thead><tbody>{assignees.map((person) => <tr key={person.name}><th>{person.name}</th><td>{person.open}</td><td>{person.overdue}</td><td>{person.created}</td><td>{person.resolved}</td></tr>)}</tbody></table></div></section></div>
  </section>
}

function HeaderFilter({ label, value, onChange, options, placeholder = 'Contains…' }: { label: string; value: string; onChange: (value: string) => void; options?: string[]; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 250 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = 250
      const menuHeight = menuRef.current?.getBoundingClientRect().height || 250
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
      const top = rect.bottom + 7 + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 7) : rect.bottom + 7
      setPosition({ top, left, width })
    }
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const menu = open ? createPortal(<div ref={menuRef} className="column-filter-menu column-filter-portal" style={position} role="dialog" aria-label={`Filter ${label}`}>
    <div className="column-filter-title"><span>Filter {label}</span><button type="button" onClick={() => setOpen(false)} aria-label="Close filter"><X size={14} /></button></div>
    {options ? <div className="column-filter-options"><button type="button" className={!value ? 'selected' : ''} onClick={() => { onChange(''); setOpen(false) }}><span>All values</span>{!value && <Check size={13} />}</button>{options.map((option) => <button type="button" className={value === option ? 'selected' : ''} key={option} onClick={() => { onChange(option); setOpen(false) }}><span>{option}</span>{value === option && <Check size={13} />}</button>)}</div> : <input autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setOpen(false) }} placeholder={placeholder} aria-label={`Filter ${label}`} />}
    <div className="column-filter-actions"><button type="button" className="column-filter-clear" disabled={!value} onClick={() => onChange('')}><X size={12} />Clear</button><button type="button" className="column-filter-done" onClick={() => setOpen(false)}>Done</button></div>
  </div>, document.body) : null

  return <div className={`column-filter${value ? ' active' : ''}`}><button ref={triggerRef} type="button" className="column-filter-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)}><span>{label}</span>{value && <span className="filter-active-dot" aria-hidden="true" />}<span className="filter-caret">▾</span></button>{menu}</div>
}

function ViewHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="operation-view-header"><div><b>{title}</b><span>{subtitle}</span></div>{action}</div>
}

function TicketListItem({ ticket, now, onClick, active = false }: { ticket: TicketItem; now: number; onClick: () => void; active?: boolean }) {
  const sla = slaTime(ticket, now)
  return <button type="button" className={`view-ticket-row${active ? ' active' : ''}`} onClick={onClick}><span className={`severity-dot ${sevClass(ticket.severity)}`} /><span className="view-ticket-copy"><b>{ticket.id} · {ticket.title}</b><small>{ticket.assignmentGroup || 'Unassigned group'} · {ticket.assignee || 'Unassigned'}</small></span><span className={`view-ticket-state${sla.breached && ticket.status !== 'Resolved' ? ' breached' : ''}`}>{ticket.status === 'Resolved' ? 'Resolved' : sla.label}</span></button>
}

function AdditionalView({ mode, tickets, allTickets, now, boardBy, openTicket, assessTicket, moveToLane, splitLeft = 'list', splitRight = 'details', onSplitLeftChange, onSplitRightChange }: { mode: CardSize; tickets: TicketItem[]; allTickets: TicketItem[]; now: number; boardBy: BoardBy; openTicket: (id: string) => void; assessTicket: (id: string, field: 'impact' | 'urgency', value: string) => void; moveToLane: (id: string, lane: string) => void; splitLeft?: SplitPaneMode; splitRight?: SplitPaneMode; onSplitLeftChange?: (value: SplitPaneMode) => void; onSplitRightChange?: (value: SplitPaneMode) => void }) {
  if (mode === 'split') return <SplitView tickets={tickets} allTickets={allTickets} now={now} boardBy={boardBy} openTicket={openTicket} assessTicket={assessTicket} moveToLane={moveToLane} leftMode={splitLeft} rightMode={splitRight} setLeftMode={onSplitLeftChange || (() => {})} setRightMode={onSplitRightChange || (() => {})} />
  return <MyWorkView tickets={tickets} allTickets={allTickets} now={now} openTicket={openTicket} />
}

function SplitPaneOptions() {
  return <>
    <optgroup label="Records"><option value="list">List View</option><option value="details">Ticket Details</option></optgroup>
    <optgroup label="Kanban"><option value="small">Kanban Compact</option><option value="regular">Kanban Detailed</option></optgroup>
    <optgroup label="Operations"><option value="my-work">My Work</option><option value="sla">SLA View</option><option value="workload">Workload View</option><option value="escalation">Escalation View</option><option value="department">Department View</option></optgroup>
    <optgroup label="Planning and insights"><option value="calendar">Calendar View</option><option value="priority-matrix">Priority Matrix</option><option value="analytics">Analytics View</option><option value="graph">Graph View</option><option value="timeline">Timeline View</option></optgroup>
  </>
}

function SplitView({ tickets, allTickets, now, boardBy, openTicket, assessTicket, moveToLane, leftMode, rightMode, setLeftMode, setRightMode }: { tickets: TicketItem[]; allTickets: TicketItem[]; now: number; boardBy: BoardBy; openTicket: (id: string) => void; assessTicket: (id: string, field: 'impact' | 'urgency', value: string) => void; moveToLane: (id: string, lane: string) => void; leftMode: SplitPaneMode; rightMode: SplitPaneMode; setLeftMode: (value: SplitPaneMode) => void; setRightMode: (value: SplitPaneMode) => void }) {
  const [activeId, setActiveId] = useState(tickets[0]?.id || '')
  useEffect(() => { if (!tickets.some((ticket) => ticket.id === activeId)) setActiveId(tickets[0]?.id || '') }, [tickets, activeId])
  const active = tickets.find((ticket) => ticket.id === activeId)
  const chooseTicket = (id: string) => {
    setActiveId(id)
    if (leftMode !== 'details' && rightMode !== 'details') openTicket(id)
  }
  const panes: { side: 'left' | 'right'; mode: SplitPaneMode; setMode: (mode: SplitPaneMode) => void }[] = [
    { side: 'left', mode: leftMode, setMode: setLeftMode },
    { side: 'right', mode: rightMode, setMode: setRightMode },
  ]
  return <section className="operation-view split-view" id="board"><ViewHeader title="Split View" subtitle="Choose a view for each side. Selecting a ticket updates the details pane." action={<button className="split-swap-button" onClick={() => { setLeftMode(rightMode); setRightMode(leftMode) }}><RotateCcw size={13} /> Swap sides</button>} />
    <div className="split-layout">{panes.map(({ side, mode, setMode }) => <div className="split-pane" key={side}>
      <div className="split-pane-toolbar"><label htmlFor={`split-${side}-view`}>{side === 'left' ? 'Left view' : 'Right view'}</label><select id={`split-${side}-view`} value={mode} onChange={(event) => setMode(event.target.value as SplitPaneMode)}><SplitPaneOptions /></select></div>
      <div className="split-pane-body"><SplitPaneContent mode={mode} tickets={tickets} allTickets={allTickets} active={active} now={now} boardBy={boardBy} chooseTicket={chooseTicket} openTicket={openTicket} assessTicket={assessTicket} moveToLane={moveToLane} /></div>
    </div>)}</div>
  </section>
}

function SplitPaneContent({ mode, tickets, allTickets, active, now, boardBy, chooseTicket, openTicket, assessTicket, moveToLane }: { mode: SplitPaneMode; tickets: TicketItem[]; allTickets: TicketItem[]; active?: TicketItem; now: number; boardBy: BoardBy; chooseTicket: (id: string) => void; openTicket: (id: string) => void; assessTicket: (id: string, field: 'impact' | 'urgency', value: string) => void; moveToLane: (id: string, lane: string) => void }) {
  if (mode === 'details') return active ? <div className="split-record"><label className="split-record-picker"><span>Ticket</span><select value={active.id} onChange={(event) => chooseTicket(event.target.value)}>{tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.id} · {ticket.title}</option>)}</select></label><div className="split-record-heading"><div><span>{active.recordType} · {tableNames[active.recordType]}</span><h2>{active.id}</h2><p>{active.title}</p></div><button onClick={() => openTicket(active.id)}>Open record</button></div><TicketRecordDetails ticket={active} now={now} /></div> : <div className="view-empty">Select a ticket to see its details.</div>
  if (mode === 'list') return <SplitTicketList tickets={tickets} now={now} activeId={active?.id || ''} chooseTicket={chooseTicket} />
  if (mode === 'small' || mode === 'regular') return <SplitKanbanPane tickets={tickets} now={now} boardBy={boardBy} activeId={active?.id || ''} compact={mode === 'small'} chooseTicket={chooseTicket} moveToLane={moveToLane} />
  return <AdditionalView mode={mode} tickets={tickets} allTickets={allTickets} now={now} boardBy={boardBy} openTicket={chooseTicket} assessTicket={assessTicket} moveToLane={moveToLane} />
}

function SplitTicketList({ tickets, now, activeId, chooseTicket }: { tickets: TicketItem[]; now: number; activeId: string; chooseTicket: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const matching = tickets.filter((ticket) => `${ticket.id} ${ticket.title} ${ticket.assignee} ${ticket.department}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="split-ticket-list"><div className="split-list-header"><span>{matching.length} tickets</span><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a ticket" aria-label="Find a ticket in this pane" /></label></div>{matching.length ? matching.map((ticket) => <TicketListItem key={ticket.id} ticket={ticket} now={now} active={ticket.id === activeId} onClick={() => chooseTicket(ticket.id)} />) : <div className="view-empty">No tickets match this search.</div>}</div>
}

function SplitKanbanPane({ tickets, now, boardBy, activeId, compact, chooseTicket, moveToLane }: { tickets: TicketItem[]; now: number; boardBy: BoardBy; activeId: string; compact: boolean; chooseTicket: (id: string) => void; moveToLane: (id: string, lane: string) => void }) {
  const lanes: string[] = boardBy === 'State' ? statuses : boardBy === 'Task type' ? recordTypes : [...new Set(tickets.map((ticket) => ticket.assignmentGroup || 'Unassigned'))].sort()
  const belongs = (ticket: TicketItem, lane: string) => boardBy === 'State' ? ticket.status === lane : boardBy === 'Task type' ? ticket.recordType === lane : (ticket.assignmentGroup || 'Unassigned') === lane
  return <div className={`split-kanban${compact ? ' compact' : ''}`}><div className="split-kanban-heading">Grouped by {boardBy.toLowerCase()} · {tickets.length} tickets</div><div className="split-kanban-lanes">{lanes.map((lane) => { const items = tickets.filter((ticket) => belongs(ticket, lane)); return <section className="split-kanban-lane" key={lane} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { event.preventDefault(); moveToLane(event.dataTransfer.getData('text/plain'), lane) }}><h3>{lane}<span>{items.length}</span></h3>{items.length ? items.map((ticket) => <button draggable className={`split-kanban-card${ticket.id === activeId ? ' active' : ''}`} key={ticket.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', ticket.id) }} onClick={() => chooseTicket(ticket.id)}><span>{ticket.id} · {ticket.severity.slice(0, 2)}</span><b>{ticket.title}</b>{!compact && <small>{ticket.assignee || 'Unassigned'} · {ticket.status === 'Resolved' ? 'Resolved' : slaTime(ticket, now).label}</small>}</button>) : <p>No tickets</p>}</section> })}</div></div>
}

function MyWorkView({ tickets, allTickets, now, openTicket }: { tickets: TicketItem[]; allTickets: TicketItem[]; now: number; openTicket: (id: string) => void }) {
  const [person, setPerson] = useState(() => localStorage.getItem('it-ticket-technician-v1') || '')
  const people = useMemo(() => [...new Set([...allTickets.map((ticket) => ticket.assignee || 'Unassigned'), ...(person ? [person] : [])])].sort(), [allTickets, person])
  useEffect(() => { localStorage.setItem('it-ticket-technician-v1', person) }, [person])
  const mine = tickets.filter((ticket) => (ticket.assignee || 'Unassigned') === person)
  const openCount = mine.filter((ticket) => ticket.status !== 'Resolved').length
  const urgent = mine.filter((ticket) => ticket.status !== 'Resolved' && (ticket.severity.startsWith('P1') || ticket.severity.startsWith('P2'))).length
  return <section className="operation-view" id="board"><ViewHeader title="My Work" subtitle="Choose a technician to see their assigned queue." action={<label className="view-inline-filter"><span>Technician</span><select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Choose a technician</option>{people.map((name) => <option key={name}>{name}</option>)}</select></label>} /><div className="view-kpis"><div><span>Assigned</span><b>{mine.length}</b></div><div><span>Open</span><b>{openCount}</b></div><div><span>P1 / P2</span><b>{urgent}</b></div></div><div className="stacked-ticket-list">{person ? mine.length ? mine.map((ticket) => <TicketListItem key={ticket.id} ticket={ticket} now={now} onClick={() => openTicket(ticket.id)} />) : <div className="view-empty">No tickets are assigned to this technician.</div> : <div className="view-empty">Select your name above to see your work.</div>}</div></section>
}


/** State, priority and resolution SLA across the top of a ticket record. */
function RecordStatusStrip({ ticket, now }: { ticket: TicketItem; now: number }) {
  const sla = slaTime(ticket, now)
  return <div className="record-status-strip">
    <div><span>State</span><b>{ticket.status}</b></div>
    <div><span>Priority</span><b>{ticket.severity}</b></div>
    <div><span>Resolution SLA</span><b className={sla.breached && ticket.status !== 'Resolved' ? 'record-breached' : ''}>{ticket.status === 'Resolved' ? 'Resolved' : sla.label}</b></div>
  </div>
}

/** The four queues on the Explore page, and the Tickets-page filter each one opens. */
const EXPLORE_FILTERS: Record<ExploreKey, MetricFilter> = { active: 'active', priority: 'high-priority', overdue: 'overdue', escalated: 'escalated' }
function exploreQueuesFor(tickets: TicketItem[], now: number): ExploreQueue<TicketItem>[] {
  const open = tickets.filter((ticket) => ticket.status !== 'Resolved')
  return [
    { key: 'active', label: 'Active tickets', hint: 'All unresolved work', tickets: open },
    { key: 'priority', label: 'Priority tickets', hint: 'Open P1 and P2 work', tickets: open.filter((ticket) => ticket.severity.startsWith('P1') || ticket.severity.startsWith('P2')) },
    { key: 'overdue', label: 'Past SLA', hint: 'Resolution target breached', tickets: open.filter((ticket) => slaTime(ticket, now).breached) },
    { key: 'escalated', label: 'Escalated', hint: 'Tickets raised beyond Tier 1', tickets: open.filter((ticket) => ticket.status === 'Escalated') },
  ]
}

/** The ticket summary in step 3 of the Explore page; "Open full record" shows everything else. */
function ExploreTicketSummary({ ticket, now }: { ticket: TicketItem; now: number }) {
  const created = ticket.createdAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.createdAt)) : 'Not recorded'
  return <div className="explore-ticket-summary">
    <RecordStatusStrip ticket={ticket} now={now} />
    <div style={{ padding: '0 16px' }}>
      <CompactSLATimer ticketId={ticket.id} createdAt={ticket.createdAt} status={ticket.status} compact={false} />
    </div>
    <div className="record-form-grid">
      <div className="record-field"><span>Type</span><b>{ticket.recordType}</b></div>
      <div className="record-field"><span>Assigned to</span><b>{ticket.assignee || 'Unassigned'}</b></div>
      <div className="record-field"><span>Assignment group</span><b>{ticket.assignmentGroup || 'Unassigned'}</b></div>
      <div className="record-field"><span>Requested by</span><b>{ticket.requester || 'Not recorded'}</b></div>
      <div className="record-field"><span>Department</span><b>{ticket.department || 'Field Services'}</b></div>
      <div className="record-field"><span>Created</span><b>{created}</b></div>
    </div>
    <section className="record-section"><h3>Description</h3><p>{ticket.description || 'No description recorded.'}</p></section>
  </div>
}

function TicketRecordDetails({ ticket, now, linkedAssetId, onSaveNotes }: { ticket: TicketItem; now: number; linkedAssetId?: string; onSaveNotes?: (value: string) => void }) {
  const { user } = useAuth()
  const [expandedNotes, setExpandedNotes] = useState(false)
  const [notesText, setNotesText] = useState(ticket.notes || '')
  const [showSavedPopup, setShowSavedPopup] = useState(false)
  const [showQueueSuggestions, setShowQueueSuggestions] = useState(false)
  const [cachedQueueSuggestionsId, setCachedQueueSuggestionsId] = useState<string | null>(null)
  const { loading: queueLoading, error: queueError, result: queueResult, suggest: suggestQueue } = useQueueAssist()
  const [showPrioritySuggestions, setShowPrioritySuggestions] = useState(false)
  const [cachedPrioritySuggestionsId, setCachedPrioritySuggestionsId] = useState<string | null>(null)
  const { loading: priorityLoading, error: priorityError, result: priorityResult, suggest: suggestPriority } = usePriorityAssist()
  const [callService, setCallService] = useState('Teams')
  const [callStatus, setCallStatus] = useState('Successful')
  const [callNotes, setCallNotes] = useState('')
  const [showCallLogger, setShowCallLogger] = useState(false)
  const [showCallMenu, setShowCallMenu] = useState(false)
  const created = ticket.createdAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.createdAt)) : 'Not recorded'
  const due = ticket.dueAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.dueAt)) : 'Not set'
  const logged = loggedLabel(loggedSecondsNow(ticket, now))
  const notesLength = notesText?.length || 0
  const shouldShowToggle = notesLength > 200
  useEffect(() => { setNotesText(ticket.notes || '') }, [ticket.id, ticket.notes])
  useEffect(() => { setCachedQueueSuggestionsId(null); setCachedPrioritySuggestionsId(null) }, [ticket.id])
  useEffect(() => { if (showSavedPopup) { const timer = setTimeout(() => setShowSavedPopup(false), 2000); return () => clearTimeout(timer) } }, [showSavedPopup])
  const handleGetQueueSuggestions = async () => {
    if (cachedQueueSuggestionsId === ticket.id) return
    try {
      await suggestQueue(ticket.title, ticket.description || '')
      setCachedQueueSuggestionsId(ticket.id)
      setShowQueueSuggestions(true)
    } catch (err) {
      console.error('Queue suggestions failed:', err)
    }
  }
  const handleGetPrioritySuggestions = async () => {
    if (cachedPrioritySuggestionsId === ticket.id) return
    try {
      await suggestPriority(ticket.title, ticket.description || '', ticket.assignmentGroup || '')
      setCachedPrioritySuggestionsId(ticket.id)
      setShowPrioritySuggestions(true)
    } catch (err) {
      console.error('Priority suggestions failed:', err)
    }
  }
  const logCallToNotes = () => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const engineerName = user?.name || 'Engineer'
    const statusLabel = callStatus === 'Successful' ? 'Successful' : `${callStatus}`
    const callEntry = `[${timestamp}] ${engineerName} - [${callService}] Call ${statusLabel}${callNotes ? ': ' + callNotes : ''}`
    const updatedNotes = notesText ? `${notesText}\n${callEntry}` : callEntry
    setNotesText(updatedNotes)
    if (onSaveNotes) onSaveNotes(updatedNotes)
    setCallService('Teams')
    setCallStatus('Successful')
    setCallNotes('')
    setShowCallLogger(false)
    setShowSavedPopup(true)
  }
  const initiateCall = (service: 'Teams' | 'ZOOM' | 'Webex') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const engineerName = user?.name || 'Engineer'
    const userInfo = ticket.affectedUser || ticket.requester || 'User'
    const userEmail = ticket.affectedUserEmail || ''

    // Log the call initiation to notes
    const callEntry = `[${timestamp}] ${engineerName} - [${service}] Call initiated with ${userInfo}${userEmail ? ' (' + userEmail + ')' : ''}`
    const updatedNotes = notesText ? `${notesText}\n${callEntry}` : callEntry
    setNotesText(updatedNotes)
    if (onSaveNotes) onSaveNotes(updatedNotes)

    // Open the service - use href instead of window.open to avoid sandbox blocks
    const serviceUrls: { [key: string]: string } = {
      'Teams': 'https://teams.microsoft.com/',
      'ZOOM': 'https://zoom.us/',
      'Webex': 'https://webex.com/'
    }
    const url = serviceUrls[service]
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowCallMenu(false)
  }
  return <>
    <RecordStatusStrip ticket={ticket} now={now} />
    <div className="record-detail-actions" style={{ display: 'flex', gap: '8px', padding: '0 16px 16px 16px', position: 'relative' }}>
      <button className="log-action-btn" onClick={() => setShowCallMenu(!showCallMenu)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={16} /> Call user</button>
      {showCallMenu && <div className="ticket-card-popout" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCallMenu(false) }}>
        <div className="ticket-card-popout-dialog" style={{ width: 'auto', minWidth: '280px' }}>
          <button className="ticket-card-popout-close" onClick={() => setShowCallMenu(false)} aria-label="Close call menu">×</button>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Choose platform</h3>
          <div style={{ fontSize: '12px', color: '#6b7c80', marginBottom: '16px', padding: '0 8px' }}>
            <p style={{ margin: '0', lineHeight: '1.4' }}>Calling <b>{ticket.affectedUser || ticket.requester || 'user'}</b></p>
            {ticket.affectedUserEmail && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#9aa3a5' }}>{ticket.affectedUserEmail}</p>}
          </div>
          <div className="ticket-card-popout-actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px', justifyContent: 'flex-start' }}>
            <button className="ticket-card-popout-open" onClick={() => initiateCall('Teams')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Teams</button>
            <button className="ticket-card-popout-open" onClick={() => initiateCall('ZOOM')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>ZOOM</button>
            <button className="ticket-card-popout-open" onClick={() => initiateCall('Webex')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Webex</button>
          </div>
        </div>
      </div>}
    </div>
    <div className="record-layout-two-col">
      <div className="record-main">
        <section className="record-section">
          <div className="record-section-heading"><h3>Short description</h3></div>
          <p>{ticket.title}</p>
        </section>
        <section className="record-section">
          <div className="record-section-heading"><h3>Description</h3></div>
          <p>{ticket.description || 'No description recorded.'}</p>
        </section>
        <section className="record-section">
          <div className="record-section-heading"><h3>Tags</h3></div>
          {ticket.tags?.length ? <div className="ticket-detail-tags">{ticket.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : <p>No tags added.</p>}
        </section>
        <section className="record-section">
          <div className="record-section-heading">
            <h3>Call log</h3>
          </div>
          {onSaveNotes && !showCallLogger && (
            <button className="primary-button" onClick={() => setShowCallLogger(true)} style={{ marginBottom: '16px' }}>Log call</button>
          )}
          {showCallLogger && (
            <div style={{ padding: '12px', border: '1px solid #dde6e8', borderRadius: '5px', marginBottom: '16px', backgroundColor: '#f9fbf9' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#4c6067' }}>Service</label>
                <select value={callService} onChange={(e) => setCallService(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #dde6e8', borderRadius: '5px', fontFamily: 'inherit', fontSize: 'inherit', boxSizing: 'border-box' }}>
                  <option>Teams</option>
                  <option>ZOOM</option>
                  <option>Webex</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#4c6067' }}>Status</label>
                <select value={callStatus} onChange={(e) => setCallStatus(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #dde6e8', borderRadius: '5px', fontFamily: 'inherit', fontSize: 'inherit', boxSizing: 'border-box' }}>
                  <option>Successful</option>
                  <option>Failed</option>
                  <option>No Answer</option>
                  <option>Declined</option>
                  <option>Connection Issue</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#4c6067' }}>Notes</label>
                <textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="Call details or outcome..." rows={3} style={{ fontFamily: 'inherit', fontSize: 'inherit', padding: '8px', border: '1px solid #dde6e8', borderRadius: '5px', width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="primary-button" onClick={logCallToNotes} style={{ flex: 1 }}>Save call to notes</button>
                <button style={{ padding: '8px 12px', border: '1px solid #dde6e8', background: '#fff', borderRadius: '5px', cursor: 'pointer', fontSize: 'inherit' }} onClick={() => { setShowCallLogger(false); setCallService('Teams'); setCallStatus('Successful'); setCallNotes('') }}>Cancel</button>
              </div>
            </div>
          )}
        </section>
        <section className="record-section">
          <div className="record-section-heading">
            <h3>Work notes</h3>
          </div>
          {onSaveNotes ? (
            <>
              <textarea value={notesText} onChange={(event) => setNotesText(event.currentTarget.value)} placeholder="Internal notes or next action" rows={4} style={{ fontFamily: 'inherit', fontSize: 'inherit', padding: '8px', border: '1px solid #dde6e8', borderRadius: '5px', width: '100%', boxSizing: 'border-box' }} />
              <button className="primary-button" onClick={() => { onSaveNotes(notesText); setShowSavedPopup(true) }} style={{ marginTop: '8px' }}>Save notes</button>
            </>
          ) : (
            <div className="work-notes-display">
              {shouldShowToggle ? (
                <>
                  <p>{expandedNotes ? notesText : `${notesText?.substring(0, 200)}...`}</p>
                  <button className="see-more-btn" onClick={() => setExpandedNotes(!expandedNotes)}>{expandedNotes ? 'See less' : 'See more'}</button>
                </>
              ) : (
                <p>{notesText || 'No work notes recorded.'}</p>
              )}
            </div>
          )}
        </section>
        <section className="record-section">
          <div className="record-section-heading"><h3>Activity</h3><span>{ticket.activity?.length || 0} recorded changes</span></div>
          {ticket.activity?.length ? <div className="record-activity">{[...ticket.activity].reverse().map((event, index) => <div key={`${event.at}-${index}`}><time>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}</time><b>{event.label}</b></div>)}</div> : <p>Created {created}. Later changes made in this prototype will appear here.</p>}
        </section>
        <section className="record-section">
          <div className="record-section-heading"><h3>Requester follow-up</h3><span>{ticket.universalTasks.filter((task) => task.done).length}/{ticket.universalTasks.length} complete</span></div>
          {ticket.universalTasks.length ? <div className="record-followups">{ticket.universalTasks.map((task) => <div className={task.done ? 'done' : ''} key={task.id}><Check size={13} /><span>{task.title}<small>For {task.assignee}</small></span></div>)}</div> : <p>No follow-up tasks recorded.</p>}
        </section>
      </div>
      <aside className="record-sidebar">
        <section className="record-sidebar-section">
          <h4>Key information</h4>
          <div className="sidebar-fields">
            <div className="sidebar-field">
              <span>Status</span>
              <b className={`status-badge ${ticket.status.toLowerCase().replace(/\s+/g, '-')}`}>{ticket.status}</b>
            </div>
            <div className="sidebar-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span>Priority</span>
                <button className="small-icon-button" onClick={handleGetPrioritySuggestions} disabled={priorityLoading} title="Get priority suggestion"><Sparkles size={14} /></button>
              </div>
              <b className={`severity-badge ${sevClass(ticket.severity)}`}>{ticket.severity.split(' – ')[0]}</b>
              {showPrioritySuggestions && cachedPrioritySuggestionsId === ticket.id && (
                <div className="suggestions-panel">
                  {priorityLoading && <p className="text-muted">Getting suggestions...</p>}
                  {priorityError && <p className="ai-error">{priorityError.message}</p>}
                  {priorityResult && !priorityLoading && (
                    <div className="suggestions-content">
                      {priorityResult.split('\n').filter(Boolean).map((line: string, idx: number) => (
                        <p key={idx} className="suggestion-item">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="sidebar-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span>Assignment group</span>
                <button className="small-icon-button" onClick={handleGetQueueSuggestions} disabled={queueLoading} title="Get queue suggestion"><Sparkles size={14} /></button>
              </div>
              <b>{ticket.assignmentGroup || 'Unassigned'}</b>
              {showQueueSuggestions && cachedQueueSuggestionsId === ticket.id && (
                <div className="suggestions-panel">
                  {queueLoading && <p className="text-muted">Getting suggestions...</p>}
                  {queueError && <p className="ai-error">{queueError.message}</p>}
                  {queueResult && !queueLoading && (
                    <div className="suggestions-content">
                      {queueResult.split('\n').filter(Boolean).map((line: string, idx: number) => (
                        <p key={idx} className="suggestion-item">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="sidebar-field">
              <span>Assigned to</span>
              <b>{ticket.assignee || 'Unassigned'}</b>
            </div>
            <div className="sidebar-field">
              <span>Department</span>
              <b>{ticket.department || 'Field Services'}</b>
            </div>
            <div className="sidebar-field">
              <span>Impact</span>
              <b>{ticket.impact || 'Not assessed'}</b>
            </div>
            <div className="sidebar-field">
              <span>Urgency</span>
              <b>{ticket.urgency || 'Not assessed'}</b>
            </div>
            <div className="sidebar-field">
              <span>Escalation tier</span>
              <b>Tier {ticket.currentTier}</b>
            </div>
          </div>
        </section>
        <section className="record-sidebar-section">
          <h4>Dates</h4>
          <div className="sidebar-fields">
            <div className="sidebar-field">
              <span>Created</span>
              <b>{created}</b>
            </div>
            <div className="sidebar-field">
              <span>Due</span>
              <b>{due}</b>
            </div>
            <div className="sidebar-field">
              <span>Resolved</span>
              <b>{ticket.resolvedAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.resolvedAt)) : ticket.status === 'Resolved' ? 'Not recorded' : 'Open'}</b>
            </div>
            <div className="sidebar-field">
              <span>Time logged</span>
              <b>{logged}</b>
            </div>
          </div>
        </section>
        <section className="record-sidebar-section">
          <h4>Related</h4>
          <div className="sidebar-fields">
            <div className="sidebar-field">
              <span>Record type</span>
              <b>{ticket.recordType}</b>
            </div>
            <div className="sidebar-field">
              <span>Linked asset</span>
              <b>{linkedAssetId || ticket.assetId || 'Not linked'}</b>
            </div>
            <div className="sidebar-field">
              <span>Requested by</span>
              <b>{ticket.requester || 'Not recorded'}</b>
            </div>
            <div className="sidebar-field">
              <span>Created by</span>
              <b>{ticket.createdBy || 'Not recorded'}</b>
            </div>
            <div className="sidebar-field">
              <span>Affected user</span>
              <b>{ticket.affectedUser || 'Not recorded'}</b>
            </div>
            <div className="sidebar-field">
              <span>Email</span>
              <b>{ticket.affectedUserEmail || 'Not recorded'}</b>
            </div>
          </div>
        </section>
      </aside>
    </div>
    {showSavedPopup && <div className="ticket-card-popout" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSavedPopup(false) }}>
      <div className="ticket-card-popout-dialog" style={{ width: 'auto', minWidth: '300px', textAlign: 'center' }}>
        <button className="ticket-card-popout-close" onClick={() => setShowSavedPopup(false)} aria-label="Close">×</button>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Work notes saved</h3>
        <p style={{ margin: '0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Your notes have been successfully saved.</p>
      </div>
    </div>}
  </>
}

function TicketRecordPanel({ ticket, now, linkedAssetId, onOpenAsset, onToggleStar, onSaveTags, onSaveNotes, onClose }: { ticket: TicketItem; now: number; linkedAssetId: string; onOpenAsset: (id: string) => void; onToggleStar: () => void; onSaveTags: (value: string) => void; onSaveNotes: (value: string) => void; onClose: () => void }) {
  const { user } = useAuth()
  const [tagsText, setTagsText] = useState((ticket.tags || []).join(', '))
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchResults, setSearchResults] = useState('')
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [showSearchMenu, setShowSearchMenu] = useState(false)
  const [showCallMenu, setShowCallMenu] = useState(false)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [showEmailMenu, setShowEmailMenu] = useState(false)
  useEffect(() => { setTagsText((ticket.tags || []).join(', ')) }, [ticket.id, ticket.tags])
  const performSearch = async () => {
    setIsLoadingAI(true)
    try {
      const solutions = await generateTicketSuggestions(
        ticket.title,
        ticket.description || '',
        ticket.severity,
        ticket.assignmentGroup
      )
      setSearchResults(solutions)
      setShowSearchResults(true)
    } catch (error) {
      const fallback = `Analysis for: ${ticket.title}\n\nStatus: ${ticket.status}\nSeverity: ${ticket.severity}\n\nCould not generate AI recommendations. Make sure Gemini API is configured on the server.`
      setSearchResults(fallback)
      setShowSearchResults(true)
    } finally {
      setIsLoadingAI(false)
    }
  }
  const performTextSearch = () => {
    const searchTerm = `${ticket.title} ${ticket.description || ''}`.trim()
    const encodedQuery = encodeURIComponent(searchTerm)
    window.open(`https://duckduckgo.com/?q=${encodedQuery}`, '_blank')
  }
  const initiateCall = (service: 'Teams' | 'ZOOM' | 'Webex') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const engineerName = user?.name || 'Engineer'
    const userInfo = ticket.affectedUser || ticket.requester || 'User'
    const userEmail = ticket.affectedUserEmail || ''

    // Log the call initiation to notes
    const callEntry = `[${timestamp}] ${engineerName} - [${service}] Call initiated with ${userInfo}${userEmail ? ' (' + userEmail + ')' : ''}`
    const currentNotes = ticket.notes || ''
    const updatedNotes = currentNotes ? `${currentNotes}\n${callEntry}` : callEntry
    onSaveNotes(updatedNotes)

    // Open the service - use href instead of window.open to avoid sandbox blocks
    const serviceUrls: { [key: string]: string } = {
      'Teams': 'https://teams.microsoft.com/',
      'ZOOM': 'https://zoom.us/',
      'Webex': 'https://webex.com/'
    }
    const url = serviceUrls[service]
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowCallMenu(false)
  }
  const sendMessage = (service: 'Teams' | 'ZOOM' | 'Webex') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const engineerName = user?.name || 'Engineer'
    const userInfo = ticket.affectedUser || ticket.requester || 'User'
    const userEmail = ticket.affectedUserEmail || ''

    const messageEntry = `[${timestamp}] ${engineerName} - [${service}] Message sent to ${userInfo}${userEmail ? ' (' + userEmail + ')' : ''}`
    const currentNotes = ticket.notes || ''
    const updatedNotes = currentNotes ? `${currentNotes}\n${messageEntry}` : messageEntry
    onSaveNotes(updatedNotes)

    const serviceUrls: { [key: string]: string } = {
      'Teams': 'https://teams.microsoft.com/',
      'ZOOM': 'https://zoom.us/',
      'Webex': 'https://webex.com/'
    }
    const url = serviceUrls[service]
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowMessageMenu(false)
  }
  const sendEmailMessage = () => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const engineerName = user?.name || 'Engineer'
    const userInfo = ticket.affectedUser || ticket.requester || 'User'
    const userEmail = ticket.affectedUserEmail || ''

    const emailEntry = `[${timestamp}] ${engineerName} - Email sent to ${userInfo}${userEmail ? ' (' + userEmail + ')' : ''}`
    const currentNotes = ticket.notes || ''
    const updatedNotes = currentNotes ? `${currentNotes}\n${emailEntry}` : emailEntry
    onSaveNotes(updatedNotes)

    if (userEmail) {
      const link = document.createElement('a')
      link.href = `mailto:${userEmail}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    setShowEmailMenu(false)
  }
  const addSearchToNotes = () => {
    const timestamp = new Date().toLocaleString()
    const userName = user?.name || 'User'
    const convertToPastTense = (text: string) => {
      const pastTenseMap: { [key: string]: string } = {
        'Check': 'Checked', 'check': 'checked',
        'Restart': 'Restarted', 'restart': 'restarted',
        'Verify': 'Verified', 'verify': 'verified',
        'Review': 'Reviewed', 'review': 'reviewed',
        'Update': 'Updated', 'update': 'updated',
        'Clear': 'Cleared', 'clear': 'cleared',
        'Run': 'Ran', 'run': 'ran',
        'Test': 'Tested', 'test': 'tested',
        'Install': 'Installed', 'install': 'installed',
        'Remove': 'Removed', 'remove': 'removed',
        'Reset': 'Reset', 'reset': 'reset',
        'Configure': 'Configured', 'configure': 'configured',
        'Enable': 'Enabled', 'enable': 'enabled',
        'Disable': 'Disabled', 'disable': 'disabled',
        'Connect': 'Connected', 'connect': 'connected',
        'Disconnect': 'Disconnected', 'disconnect': 'disconnected',
        'Reboot': 'Rebooted', 'reboot': 'rebooted',
        'Monitor': 'Monitored', 'monitor': 'monitored',
        'Document': 'Documented', 'document': 'documented',
      }
      return text.replace(/^(\d+)\.\s*(\w+)/gm, (_match, num, verb) => {
        const pastVerb = pastTenseMap[verb] || verb + 'ed'
        return `${num}. ${pastVerb}`
      })
    }
    const pastTenseSteps = convertToPastTense(searchResults)
    const entry = `[${timestamp}] ${userName} - Troubleshooting steps taken:\n${pastTenseSteps}`
    const updatedNotes = ticket.notes ? `${ticket.notes}\n${entry}` : entry
    onSaveNotes(updatedNotes)
    setShowSearchResults(false)
  }
  return <section className="ticket-record-panel" role="dialog" aria-modal="true" aria-labelledby="ticket-record-title">
    <header className="record-header"><div><span className="record-table-name">{ticket.recordType} · {tableNames[ticket.recordType]}</span><h2 id="ticket-record-title">{ticket.id}</h2><p>{ticket.title}</p></div><div className="record-header-actions"><button className={"ticket-star" + (ticket.starred ? " is-starred" : "")} onClick={onToggleStar} aria-pressed={ticket.starred} aria-label={`${ticket.starred ? 'Remove star from' : 'Star'} ${ticket.id}`}><Star size={20} fill={ticket.starred ? "currentColor" : "none"} /></button>{linkedAssetId && <button className="record-asset-link" onClick={() => onOpenAsset(linkedAssetId)}>View asset {linkedAssetId} <ArrowRight size={13} /></button>}<button className="close-button" onClick={onClose} aria-label="Close ticket details"><X size={19} /></button></div></header>
    <div className="ticket-tags-editor"><label htmlFor="ticket-tags-input">Edit tags <small>Separate with commas</small></label><div><input id="ticket-tags-input" value={tagsText} onChange={(event) => setTagsText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSaveTags(tagsText) }} placeholder="VPN, payroll, follow-up…" /><button onClick={() => onSaveTags(tagsText)} disabled={JSON.stringify(parseTicketTags(tagsText)) === JSON.stringify(ticket.tags || [])}>Save tags</button></div></div>
    <div className="record-actions" style={{ display: 'flex', gap: '8px' }}>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowCallMenu(!showCallMenu)} style={{ border: '1px solid #0066cc', background: '#0066cc', color: '#fff', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: '600', minHeight: '40px' }}><Phone size={16} /> Call user</button>
        {showCallMenu && <div className="ticket-card-popout" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCallMenu(false) }}>
        <div className="ticket-card-popout-dialog" style={{ width: 'auto', minWidth: '280px' }}>
          <button className="ticket-card-popout-close" onClick={() => setShowCallMenu(false)} aria-label="Close call menu">×</button>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Choose platform</h3>
          <div style={{ fontSize: '12px', color: '#6b7c80', marginBottom: '16px', padding: '0 8px' }}>
            <p style={{ margin: '0', lineHeight: '1.4' }}>Calling <b>{ticket.affectedUser || ticket.requester || 'user'}</b></p>
            {ticket.affectedUserEmail && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#9aa3a5' }}>{ticket.affectedUserEmail}</p>}
          </div>
          <div className="ticket-card-popout-actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px', justifyContent: 'flex-start' }}>
            <button className="ticket-card-popout-open" onClick={() => initiateCall('Teams')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Teams</button>
            <button className="ticket-card-popout-open" onClick={() => initiateCall('ZOOM')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>ZOOM</button>
            <button className="ticket-card-popout-open" onClick={() => initiateCall('Webex')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Webex</button>
          </div>
        </div>
      </div>}
      </div>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowMessageMenu(!showMessageMenu)} style={{ border: '1px solid #d9e0e2', background: '#fff', color: '#627881', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: '600', minHeight: '40px' }}><MessageSquare size={16} /> Send message</button>
        {showMessageMenu && <div className="ticket-card-popout" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowMessageMenu(false) }}>
        <div className="ticket-card-popout-dialog" style={{ width: 'auto', minWidth: '280px' }}>
          <button className="ticket-card-popout-close" onClick={() => setShowMessageMenu(false)} aria-label="Close message menu">×</button>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Choose platform</h3>
          <div style={{ fontSize: '12px', color: '#6b7c80', marginBottom: '16px', padding: '0 8px' }}>
            <p style={{ margin: '0', lineHeight: '1.4' }}>Message to <b>{ticket.affectedUser || ticket.requester || 'user'}</b></p>
            {ticket.affectedUserEmail && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#9aa3a5' }}>{ticket.affectedUserEmail}</p>}
          </div>
          <div className="ticket-card-popout-actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px', justifyContent: 'flex-start' }}>
            <button className="ticket-card-popout-open" onClick={() => sendMessage('Teams')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Teams</button>
            <button className="ticket-card-popout-open" onClick={() => sendMessage('ZOOM')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>ZOOM</button>
            <button className="ticket-card-popout-open" onClick={() => sendMessage('Webex')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Webex</button>
          </div>
        </div>
      </div>}
      </div>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowEmailMenu(!showEmailMenu)} style={{ border: '1px solid #d9e0e2', background: '#fff', color: '#627881', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: '600', minHeight: '40px' }}><Mail size={16} /> Send email</button>
        {showEmailMenu && <div className="ticket-card-popout" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowEmailMenu(false) }}>
        <div className="ticket-card-popout-dialog" style={{ width: 'auto', minWidth: '280px' }}>
          <button className="ticket-card-popout-close" onClick={() => setShowEmailMenu(false)} aria-label="Close email menu">×</button>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Send email</h3>
          <div style={{ fontSize: '12px', color: '#6b7c80', marginBottom: '16px', padding: '0 8px' }}>
            <p style={{ margin: '0', lineHeight: '1.4' }}>Email to <b>{ticket.affectedUser || ticket.requester || 'user'}</b></p>
            {ticket.affectedUserEmail && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#9aa3a5' }}>{ticket.affectedUserEmail}</p>}
          </div>
          <div className="ticket-card-popout-actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px', justifyContent: 'flex-start' }}>
            <button className="ticket-card-popout-open" onClick={() => sendEmailMessage()} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Send email</button>
          </div>
        </div>
      </div>}
      </div>
      <button onClick={() => setShowSearchMenu(!showSearchMenu)} disabled={isLoadingAI} style={{ border: '1px solid #d9e0e2', background: '#fff', color: '#627881', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500, minHeight: '36px', minWidth: 'fit-content', whiteSpace: 'nowrap' }}><Search size={16} /> {isLoadingAI ? 'Analyzing...' : 'Search resolution'}</button>
      {showSearchMenu && <div className="ticket-card-popout" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSearchMenu(false) }}>
        <div className="ticket-card-popout-dialog" style={{ width: 'auto', minWidth: '300px' }}>
          <button className="ticket-card-popout-close" onClick={() => setShowSearchMenu(false)} aria-label="Close search menu">×</button>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Search options</h3>
          <div className="ticket-card-popout-actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px', justifyContent: 'flex-start' }}>
            <button className="ticket-card-popout-open" onClick={() => { performSearch(); setShowSearchMenu(false); }} disabled={isLoadingAI} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>{isLoadingAI ? 'Analyzing...' : 'Search AI'}</button>
            <button className="ticket-card-popout-open" onClick={() => { performTextSearch(); setShowSearchMenu(false); }} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px' }}>Search web</button>
          </div>
        </div>
      </div>}
    </div>
    {showSearchResults && <div className="ticket-search-results"><div className="search-results-header"><h5>Search & AI Results</h5><button onClick={() => setShowSearchResults(false)} aria-label="Close search results"><X size={16} /></button></div><div className="search-results-content"><p>{searchResults}</p><button className="search-add-btn" onClick={addSearchToNotes}><Plus size={14} /> Add to work notes</button></div></div>}
    <div style={{ padding: '0 16px' }}>
      <CompactSLATimer ticketId={ticket.id} createdAt={ticket.createdAt} status={ticket.status} compact={false} />
    </div>
    <TicketRecordDetails ticket={ticket} now={now} linkedAssetId={linkedAssetId} onSaveNotes={onSaveNotes} />
  </section>
}

function TicketRecordPage({ ticket, now }: { ticket: TicketItem; now: number }) {
  const boardUrl = window.location.href.split('#')[0]
  return <div className="record-page-shell">
    <header className="record-page-topbar"><a className="brand record-brand-home" href={boardUrl} aria-label="Go to home"><div className="brand-mark"><Activity size={17} /></div><span>OPS <b>KANBAN</b></span></a><a href={boardUrl}><ArrowLeft size={15} /> Back to home</a></header>
    <main className="record-page-main"><article className="ticket-record-page"><header className="record-header"><div><span className="record-table-name">{ticket.recordType} · {tableNames[ticket.recordType]}</span><h1>{ticket.id}</h1><p>{ticket.title}</p></div><span className={`severity-badge ${sevClass(ticket.severity)}`}>{ticket.severity.split(' – ')[0]}</span></header><TicketRecordDetails ticket={ticket} now={now} /></article></main>
  </div>
}

function ListView({ tickets, now, openTicket, openDescriptionPopup, toggleStar, selectedIds, onSelectionChange }: { tickets: TicketItem[]; now: number; openTicket: (id: string) => void; openDescriptionPopup: (id: string) => void; toggleStar: (id: string) => void; selectedIds: string[]; onSelectionChange: (ids: string[]) => void }) {
  const [filters, setFilters] = useState({ number: '', description: '', department: '', assignmentGroup: '', assignee: '', priority: '', state: '', created: '', sla: '' })
  const selectionAnchor = useRef<string>('')
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const assignmentGroupOptions = useMemo(() => [...new Set(tickets.map((ticket) => ticket.assignmentGroup || 'Unassigned'))].sort(), [tickets])
  const assigneeOptions = useMemo(() => [...new Set(tickets.map((ticket) => ticket.assignee || 'Unassigned'))].sort(), [tickets])
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    const created = ticket.createdAt ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ticket.createdAt)) : 'Not recorded'
    const sla = ticket.status === 'Resolved' ? 'Resolved' : slaTime(ticket, now).label
    return ticket.id.toLowerCase().includes(filters.number.toLowerCase())
      && ticket.title.toLowerCase().includes(filters.description.toLowerCase())
      && (!filters.department || (ticket.department || 'Field Services') === filters.department)
      && (!filters.assignmentGroup || (ticket.assignmentGroup || 'Unassigned') === filters.assignmentGroup)
      && (!filters.assignee || (ticket.assignee || 'Unassigned') === filters.assignee)
      && (!filters.priority || ticket.severity.startsWith(filters.priority))
      && (!filters.state || ticket.status === filters.state)
      && created.toLowerCase().includes(filters.created.toLowerCase())
      && sla.toLowerCase().includes(filters.sla.toLowerCase())
  }), [tickets, now, filters])
  const filtersActive = Object.values(filters).some(Boolean)
  const clearListFilters = () => setFilters({ number: '', description: '', department: '', assignmentGroup: '', assignee: '', priority: '', state: '', created: '', sla: '' })
  const toggleSelection = (id: string, shiftKey: boolean, checked: boolean) => {
    if (shiftKey && selectionAnchor.current) {
      const start = filteredTickets.findIndex((ticket) => ticket.id === selectionAnchor.current)
      const end = filteredTickets.findIndex((ticket) => ticket.id === id)
      if (start >= 0 && end >= 0) {
        const range = filteredTickets.slice(Math.min(start, end), Math.max(start, end) + 1).map((ticket) => ticket.id)
        onSelectionChange(checked ? [...new Set([...selectedIds, ...range])] : selectedIds.filter((selected) => !range.includes(selected)))
        return
      }
    }
    selectionAnchor.current = id
    onSelectionChange(checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((selected) => selected !== id))
  }
  const visibleIds = filteredTickets.map((ticket) => ticket.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  return <section className="list-view" id="board" aria-label="List of task records">
    <div className="list-view-heading"><div><b>All task records</b><span>Click a checkbox, then Shift-click another to select a range</span></div><div className="list-view-summary"><span>{selectedIds.length ? `${selectedIds.length} selected · ` : ''}{filteredTickets.length === tickets.length ? `${tickets.length} records` : `${filteredTickets.length} of ${tickets.length} records`}</span>{selectedIds.length > 0 && <button onClick={() => onSelectionChange([])}><X size={12} />Clear selection</button>}{filtersActive && <button onClick={clearListFilters}><X size={12} />Clear column filters</button>}</div></div>
    <div className="list-scroll"><table className="task-table"><thead><tr><th className="selection-column"><input type="checkbox" checked={allVisibleSelected} aria-label="Select all visible tickets" onChange={(event) => onSelectionChange(event.target.checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)))} /></th><th><HeaderFilter label="Number" value={filters.number} onChange={(value) => setFilter('number', value)} placeholder="Ticket number…" /></th><th><HeaderFilter label="Short description" value={filters.description} onChange={(value) => setFilter('description', value)} placeholder="Description contains…" /></th><th><HeaderFilter label="Department" value={filters.department} onChange={(value) => setFilter('department', value)} options={departments} /></th><th><HeaderFilter label="Assignment group" value={filters.assignmentGroup} onChange={(value) => setFilter('assignmentGroup', value)} options={assignmentGroupOptions} /></th><th><HeaderFilter label="Assigned to" value={filters.assignee} onChange={(value) => setFilter('assignee', value)} options={assigneeOptions} /></th><th><HeaderFilter label="Priority" value={filters.priority} onChange={(value) => setFilter('priority', value)} options={['P1', 'P2', 'P3', 'P4']} /></th><th><HeaderFilter label="State" value={filters.state} onChange={(value) => setFilter('state', value)} options={statuses} /></th><th><HeaderFilter label="Created" value={filters.created} onChange={(value) => setFilter('created', value)} placeholder="Date contains…" /></th><th><HeaderFilter label="Resolution SLA" value={filters.sla} onChange={(value) => setFilter('sla', value)} placeholder="SLA contains…" /></th></tr></thead><tbody>{filteredTickets.length ? filteredTickets.map((ticket) => {
      const created = ticket.createdAt ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ticket.createdAt)) : 'Not recorded'
      return <tr key={ticket.id} className={selectedIds.includes(ticket.id) ? 'selected-row' : ''}>
        <td className="selection-column"><input type="checkbox" checked={selectedIds.includes(ticket.id)} aria-label={`Select ${ticket.id}`} onClick={(event) => toggleSelection(ticket.id, event.shiftKey, event.currentTarget.checked)} onChange={() => {}} /></td>
        <td><div className="ticket-list-number"><button className={"ticket-star" + (ticket.starred ? " is-starred" : "")} onClick={() => toggleStar(ticket.id)} aria-pressed={ticket.starred} aria-label={`${ticket.starred ? 'Remove star from' : 'Star'} ${ticket.id}`}><Star size={15} fill={ticket.starred ? "currentColor" : "none"} /></button><button className="list-ticket-id" onClick={() => openTicket(ticket.id)} title={`Open ${ticket.id} details`}>{ticket.id}</button><button className="list-search-btn" onClick={() => openTicket(ticket.id)} title={`Search for ${ticket.title}`} aria-label={`Search for ${ticket.id}`} style={{ marginLeft: '6px', padding: '4px', background: 'none', border: 'none', color: '#596f79', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', fontSize: '14px' }}><Search size={14} /></button></div></td>
        <td><button className="list-title list-title-link" onClick={() => openDescriptionPopup(ticket.id)} title={`Show details for ${ticket.title}`}>{ticket.title}</button><span className="list-type">{ticket.recordType}</span>{!!ticket.tags?.length && <span className="ticket-list-tags">{ticket.tags.slice(0, 3).join(" · ")}{ticket.tags.length > 3 ? ` +${ticket.tags.length - 3}` : ""}</span>}</td>
        <td>{ticket.department || 'Field Services'}</td>
        <td>{ticket.assignmentGroup || 'Unassigned'}</td>
        <td>{ticket.assignee || 'Unassigned'}</td>
        <td><span className={`severity-badge ${sevClass(ticket.severity)}`}>{ticket.severity.split(' – ')[0]}</span></td>
        <td><span className={`status-pill status-${ticket.status.toLowerCase().replace(/\s+/g, '-')}`}>{ticket.status}</span></td>
        <td className="list-date">{created}</td>
        <td><CompactSLATimer ticketId={ticket.id} createdAt={ticket.createdAt} status={ticket.status} compact={true} /></td>
      </tr>
    }) : <tr><td colSpan={10} className="list-empty">No task records match the current filters.</td></tr>}</tbody></table></div>
  </section>
}

function TicketCard({ ticket, index, laneCount, boardBy, now, move, remove, addUniversalTask, toggleUniversalTask, toggleTimer, escalate, openMatrix, toggleStar, openTicket }: { ticket: TicketItem; index: number; laneCount: number; boardBy: BoardBy; now: number; move: (ticket: TicketItem, step: number) => void; remove: (id: string) => void; addUniversalTask: (ticketId: string, title: string) => void; toggleUniversalTask: (ticketId: string, taskId: string) => void; toggleTimer: (ticketId: string) => void; escalate: (ticket: TicketItem) => void; openMatrix: (id: string) => void; toggleStar: (id: string) => void; openTicket: (id: string) => void }) {
  const [showFollowUps, setShowFollowUps] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showAiGuidance, setShowAiGuidance] = useState(false)
  const dragged = useRef(false)
  const [taskTitle, setTaskTitle] = useState('')
  const due = ticket.dueAt ? new Date(ticket.dueAt) : null
  const isOverdue = Boolean(due && due.getTime() < now && ticket.status !== 'Resolved')
  const isAtRisk = slaAtRisk(ticket, now)
  const isEscalationDue = escalationDue(ticket, now)
  const dueLabel = due ? `${isOverdue ? 'Past due' : 'Due'} ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(due)}` : 'No due date'
  const resolutionSla = slaTime(ticket, now)
  const completedTasks = ticket.universalTasks.filter((task) => task.done).length
  const nextContact = ticket.currentTier < 3 ? tierRows[ticket.currentTier] : null
  const elapsedLogged = loggedSecondsNow(ticket, now)
  const createdLabel = ticket.createdAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ticket.createdAt)) : 'Not recorded'
  const addTask = () => { if (!taskTitle.trim()) return; addUniversalTask(ticket.id, taskTitle.trim()); setTaskTitle('') }
  const laneName = boardBy === 'State' ? 'state' : boardBy === 'Task type' ? 'task type' : 'assignment group'
  return <article className={`ticket-card ${showDetails ? 'expanded' : ''} ${isOverdue ? 'overdue' : ''}${isAtRisk ? ' at-risk' : ''}`} draggable={!showDetails} onDragStart={(event) => { dragged.current = true; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', ticket.id) }} onDragEnd={() => { window.setTimeout(() => { dragged.current = false }, 0) }} onClick={(event) => { if (dragged.current || (event.target as HTMLElement).closest('button, a, input, select, textarea, label')) return; openTicket(ticket.id) }}>
    <div className={`ticket-card-inner${showDetails ? ' flipped' : ''}`}>
      <div className="ticket-card-face ticket-card-front">
    <div className="ticket-card-front-layout">
      <div className="ticket-card-left">
        <div className="card-top"><button className={"ticket-star" + (ticket.starred ? " is-starred" : "")} onClick={() => toggleStar(ticket.id)} aria-pressed={ticket.starred} aria-label={`${ticket.starred ? 'Remove star from' : 'Star'} ${ticket.id}`}><Star size={14} fill={ticket.starred ? "currentColor" : "none"} /></button><button className="ticket-id-link" onClick={() => openMatrix(ticket.id)} title={`Show ${ticket.id} in escalation matrix`}>{ticket.id}</button><button className="flip-card-button" onClick={() => setShowDetails(true)} aria-label={`Show more details for ${ticket.id}`} title="Show ticket details"><RotateCcw size={15} /></button><button className="more-button" title="Move task to Deleted" onClick={() => remove(ticket.id)} aria-label={`Move ${ticket.id} to Deleted`}><X size={14} /></button></div>
        <div className="record-type-line"><span>{ticket.recordType}</span><code>{tableNames[ticket.recordType]}</code></div><h3>{ticket.title}</h3>{ticket.requester && <div className="requester">Requested by {ticket.requester}</div>}<div className="created-at-line">Created {createdLabel}</div>{!!ticket.tags?.length && <div className="ticket-card-tags" title={ticket.tags.join(", ")}>{ticket.tags.slice(0, 2).join(" · ")}{ticket.tags.length > 2 ? ` +${ticket.tags.length - 2}` : ""}</div>}<div className="department-line">Department <b>{ticket.department || 'Field Services'}</b></div>{ticket.affectedUser && <div className="affected-user-line">Affected user <b>{ticket.affectedUser}</b></div>}
        <div className="card-meta"><span className={`severity-badge ${sevClass(ticket.severity)}`}>{ticket.severity.split(' – ')[0]}</span>{ticket.status === 'Escalated' && <span className="escalated-tag"><ArrowUp size={11} /> Tier {ticket.currentTier}</span>}{isEscalationDue && <span className="escalation-due-tag">Tier {ticket.currentTier + 1} due</span>}</div>
        <div className={`resolution-sla ${resolutionSla.breached && ticket.status !== 'Resolved' ? 'breached' : ''}${isAtRisk ? ' at-risk' : ''}`} title={`Resolution target: ${Math.round(resolutionTargetMs(ticket.severity) / 3_600_000)} calendar hours from creation`}><Clock3 size={12} /><span>Resolution SLA{isAtRisk ? ' · at risk' : ''}</span><b>{ticket.status === 'Resolved' ? 'Resolved' : resolutionSla.label}</b></div>
        <div className={`next-action ${ticket.severity.startsWith('P1') && ticket.status !== 'Resolved' ? 'urgent' : ''}`}><span>Next step</span><b>{nextAction(ticket, now)}</b></div>
        <div className="assignment-line"><Building2 size={12} /><span>{ticket.assignmentGroup || 'Unassigned group'}</span></div>
        <div className="card-bottom"><div className="assignee"><span className="avatar">{ticket.assignee ? ticket.assignee.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() : '—'}</span><span>{ticket.assignee || 'Unassigned'}</span></div><span className={`due-label ${isOverdue ? 'late' : ''}`} title={due?.toLocaleString()}>{isOverdue && <AlertTriangle size={12} />}<Clock3 size={12} />{dueLabel}</span></div>
      </div>
      <div className="ticket-card-right">
        <div className="ticket-description-section"><h5>Description</h5><p>{ticket.description || 'No description'}</p></div>
      </div>
    </div>
    <div className="card-actions">
      <div className="card-utility-actions"><button onClick={() => { setShowDetails(true); setShowFollowUps(true) }}><ListChecks size={13} />{ticket.universalTasks.length ? 'Follow-up tasks' : 'Add follow-up'}</button><button className="resolution-search" onClick={() => window.open(resolutionSearchUrl(ticket.title), '_blank')} aria-label={`Search the web for a resolution to ${ticket.title}`} title="Search the public web using this ticket title"><Search size={13} />Search resolution</button><button onClick={() => setShowAiGuidance(!showAiGuidance)} className="ai-guidance-btn" title="Ask AI for guidance on this ticket"><BrainCircuit size={13} />Ask AI</button></div>
      <div className="card-secondary-actions"><div className={`time-log ${ticket.timerStartedAt ? 'running' : ''}`}><span>Logged {loggedLabel(elapsedLogged)}</span><button disabled={ticket.status === 'Resolved'} onClick={() => toggleTimer(ticket.id)} title={ticket.timerStartedAt ? 'Stop and save time' : 'Start a timer'}>{ticket.timerStartedAt ? 'Stop' : 'Start'}</button></div>{nextContact && ticket.status !== 'Resolved' && <button className="escalate-action" onClick={() => escalate(ticket)} title={`Escalate to ${nextContact.role} (placeholder contact)`} aria-label={`Escalate ${ticket.id} to Tier ${ticket.currentTier + 1}`}><ShieldAlert size={13} /> Escalate</button>}
        <span className="card-move-actions">{index > 0 && <button onClick={() => move(ticket, -1)} aria-label={`Move to previous ${laneName}`} title={`Move to previous ${laneName}`}><ArrowLeft size={13} /></button>}{index < laneCount - 1 && <button onClick={() => move(ticket, 1)} aria-label={`Move to next ${laneName}`} title={`Move to next ${laneName}`}><ArrowRight size={13} /></button>}</span></div>
    </div>
      </div>
      {showAiGuidance && <div className="ticket-ai-guidance"><div className="ai-guidance-header"><h5>AI Guidance</h5><button onClick={() => setShowAiGuidance(false)} aria-label="Close AI guidance"><X size={16} /></button></div><div className="ai-guidance-content"><p><strong>{ticket.id}</strong></p><p className="ai-guidance-context">For {ticket.title}</p><div className="ai-guidance-suggestions"><p><small>Suggested guidance topics:</small></p><ul><li>Troubleshooting steps for this issue</li><li>Similar resolved tickets and solutions</li><li>Best practices for {ticket.assignmentGroup}</li><li>Escalation criteria and next steps</li></ul></div></div></div>}
      <div className="ticket-card-face ticket-card-back">
        <div className="ticket-detail-header"><div><span>FULL TICKET DETAILS</span><h3>{ticket.id}</h3></div><button className="flip-card-button" onClick={() => setShowDetails(false)} aria-label={`Return to ${ticket.id} summary`} title="Back to ticket summary"><RotateCcw size={15} /></button></div>
        <h4 className="ticket-detail-title">{ticket.title}</h4>{!!ticket.tags?.length && <div className="ticket-detail-tags">{ticket.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        <div className="ticket-detail-grid">
          <div><span>Status</span><b>{ticket.status}</b></div><div><span>Priority</span><b>{ticket.severity}</b></div>
          <div><span>Task type / table</span><b>{ticket.recordType} · {tableNames[ticket.recordType]}</b></div><div><span>Current escalation tier</span><b>{ticket.status === 'Escalated' ? `Tier ${ticket.currentTier}` : 'Tier 1'}</b></div>
          <div><span>Requested by</span><b>{ticket.requester || 'Not recorded'}</b></div><div><span>Created by</span><b>{ticket.createdBy || 'Not recorded'}</b></div>
          <div><span>Department</span><b>{ticket.department || 'Field Services'}</b></div><div><span>Affected user</span><b>{ticket.affectedUser || 'Not recorded'}</b></div>
          <div><span>Affected user email</span><b>{ticket.affectedUserEmail || 'Not recorded'}</b></div>
          <div><span>Assignment group</span><b>{ticket.assignmentGroup || 'Unassigned'}</b></div><div><span>Assigned to</span><b>{ticket.assignee || 'Unassigned'}</b></div>
          <div><span>Opened</span><b>{createdLabel}</b></div><div><span>Resolution due</span><b>{due?.toLocaleString() || 'Not set'}</b></div>
          <div><span>Time logged</span><b>{loggedLabel(elapsedLogged)}</b></div><div><span>Resolution SLA</span><b>{ticket.status === 'Resolved' ? 'Resolved' : resolutionSla.label}</b></div>
        </div>
        <section className="ticket-detail-section"><h5>Description</h5><p>{ticket.description || 'No description recorded.'}</p></section>
        <section className="ticket-detail-section"><h5>Work notes</h5><p>{ticket.notes || 'No work notes recorded.'}</p></section>
        <section className="ticket-detail-section ticket-followup-section"><div className="ticket-followup-heading"><h5>Requester follow-up</h5><span>{completedTasks}/{ticket.universalTasks.length} done</span></div>{ticket.universalTasks.length ? ticket.universalTasks.map((task) => <label className={`ticket-followup-task ${task.done ? 'done' : ''}`} key={task.id}><input type="checkbox" checked={task.done} onChange={() => toggleUniversalTask(ticket.id, task.id)} /><span>{task.title}<small>For {task.assignee}</small></span></label>) : <p>No follow-up tasks recorded.</p>}{showFollowUps && <div className="universal-task-add"><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addTask() }} placeholder="Requester action item" aria-label="Universal Task title" /><button onClick={addTask} aria-label="Add Universal Task"><Plus size={14} /></button></div>}</section>
      </div>
    </div>
  </article>
}

export default App

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Box, Check, Clock3, Link2, Package, Pencil, Plus, RotateCcw, Search, ShieldAlert, Star, Trash2, Wrench, X } from 'lucide-react'
import Overlay from './Overlay'
import SavedViews, { loadSavedViews, type SavedView } from './SavedViews'
import { exportCsv, type CsvValue } from './lib/exportCsv'
import { exportXlsx, exportXlsxWorkbook } from './lib/exportXlsx'

export type AssetStatus = 'Available' | 'Assigned' | 'In Repair' | 'Retired' | 'Lost'
export type DeviceHealth = 'Healthy' | 'At Risk' | 'Critical'
export type HealthLevel = DeviceHealth | 'Monitor'
export type AssetEvent = { at: string; action: string; detail: string }
export type AssetItem = {
  id: string
  name: string
  category: string
  manufacturer: string
  model: string
  serial: string
  status: AssetStatus
  assignedTo: string
  department: string
  location: string
  assignedAt: string
  expectedReturnAt: string
  issuedBy: string
  purchaseDate: string
  warrantyEnd: string
  condition: 'Good' | 'Fair' | 'Damaged'
  health: DeviceHealth
  notes: string
  tags: string[]
  starred: boolean
  linkedTicketIds: string[]
  history: AssetEvent[]
}
export type StockItem = {
  sku: string
  name: string
  category: string
  quantity: number
  minimum: number
  location: string
  tags: string[]
  starred: boolean
  updatedAt: string
  history: AssetEvent[]
}
export type TicketReference = { id: string; title: string; status: string; assetId?: string }
export type InventoryCommand = { action: 'add-asset' | 'add-stock' | 'in-stock' | 'low-stock' | 'export-csv' | 'export-xlsx'; revision: number }
type InventoryViewMode = 'list' | 'cards' | 'split' | 'grouped' | 'attention'
type InventorySplitPaneMode = Exclude<InventoryViewMode, 'split'> | 'details'
type InventoryPaneSettings = { tab: 'assets' | 'stock'; viewMode: InventoryViewMode; splitLeft: InventorySplitPaneMode; splitRight: InventorySplitPaneMode; query: string; statusFilter: 'All' | AssetStatus | 'Warranty soon'; categoryFilter: string; assignedFilter: string; tagFilter: string; healthFilter: 'All health' | HealthLevel; starredOnly: boolean; lowStockOnly: boolean; inStockOnly: boolean }
type InventoryWorkspaceTab = { id: string; settings: InventoryPaneSettings }
type InventoryViewSettings = InventoryPaneSettings & { workspaceTabs?: InventoryWorkspaceTab[]; activeWorkspaceId?: string }
type InventoryWorkspace = { tabs: InventoryWorkspaceTab[]; activeId: string }

const ASSET_KEY = 'it-ticket-kanban-assets-v1'
const STOCK_KEY = 'it-ticket-kanban-stock-v1'
const SAVED_INVENTORY_VIEWS_KEY = 'it-ticket-kanban-inventory-saved-views-v1'
const INVENTORY_VIEW_MODE_KEY = 'it-ticket-kanban-inventory-view-mode-v1'
const INVENTORY_WORKSPACE_KEY = 'it-ticket-kanban-inventory-workspace-v1'
const inventoryViewModes: InventoryViewMode[] = ['list', 'cards', 'split', 'grouped', 'attention']
const inventorySplitPaneModes: InventorySplitPaneMode[] = ['list', 'details', 'cards', 'grouped', 'attention']
const newWorkspaceId = () => `inventory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const defaultPaneSettings = (tab: 'assets' | 'stock' = 'assets'): InventoryPaneSettings => ({ tab, viewMode: 'list', splitLeft: 'list', splitRight: 'details', query: '', statusFilter: 'All', categoryFilter: 'All categories', assignedFilter: 'All people', tagFilter: 'All tags', healthFilter: 'All health', starredOnly: false, lowStockOnly: false, inStockOnly: false })
function normalizeInventoryPane(value: Partial<InventoryPaneSettings>): InventoryPaneSettings {
  return { ...defaultPaneSettings(), ...value, tab: value.tab === 'stock' ? 'stock' : 'assets', healthFilter: healthLevels.includes(value.healthFilter as HealthLevel) ? value.healthFilter as HealthLevel : 'All health', viewMode: inventoryViewModes.includes(value.viewMode as InventoryViewMode) ? value.viewMode as InventoryViewMode : 'list', splitLeft: inventorySplitPaneModes.includes(value.splitLeft as InventorySplitPaneMode) ? value.splitLeft as InventorySplitPaneMode : 'list', splitRight: inventorySplitPaneModes.includes(value.splitRight as InventorySplitPaneMode) ? value.splitRight as InventorySplitPaneMode : 'details', inStockOnly: Boolean(value.inStockOnly) }
}
function loadInventoryWorkspace(): InventoryWorkspace {
  try {
    const saved = JSON.parse(localStorage.getItem(INVENTORY_WORKSPACE_KEY) || 'null')
    const tabs: InventoryWorkspaceTab[] = Array.isArray(saved?.tabs) ? saved.tabs.filter((item: unknown): item is InventoryWorkspaceTab => !!item && typeof item === 'object' && typeof (item as InventoryWorkspaceTab).id === 'string' && !!(item as InventoryWorkspaceTab).settings && typeof (item as InventoryWorkspaceTab).settings === 'object').map((item: InventoryWorkspaceTab) => ({ id: item.id, settings: normalizeInventoryPane(item.settings) })) : []
    if (tabs.length) return { tabs, activeId: tabs.some((item) => item.id === saved.activeId) ? saved.activeId : tabs[0].id }
  } catch { /* Fall back to one tab. */ }
  const id = newWorkspaceId()
  return { tabs: [{ id, settings: defaultPaneSettings() }], activeId: id }
}
function normalizeSavedInventoryView(view: SavedView<InventoryViewSettings>): SavedView<InventoryViewSettings> {
  const pane = normalizeInventoryPane(view.settings)
  const tabs = Array.isArray(view.settings.workspaceTabs) && view.settings.workspaceTabs.length ? view.settings.workspaceTabs.map((item) => ({ id: item.id, settings: normalizeInventoryPane(item.settings) })) : [{ id: `saved-${view.id}`, settings: pane }]
  const activeId = tabs.some((item) => item.id === view.settings.activeWorkspaceId) ? view.settings.activeWorkspaceId : tabs[0].id
  return { ...view, settings: { ...pane, workspaceTabs: tabs, activeWorkspaceId: activeId } }
}
const inStockPane: InventoryPaneSettings = { ...defaultPaneSettings('stock'), inStockOnly: true }
const inStockView: SavedView<InventoryViewSettings> = { id: 'built-in-in-stock', name: 'In Stock', builtIn: true, settings: { ...inStockPane, workspaceTabs: [{ id: 'built-in-in-stock-tab', settings: inStockPane }], activeWorkspaceId: 'built-in-in-stock-tab' } }
const statuses: AssetStatus[] = ['Available', 'Assigned', 'In Repair', 'Retired', 'Lost']
const deviceHealthOptions: DeviceHealth[] = ['Healthy', 'At Risk', 'Critical']
const healthLevels: HealthLevel[] = ['Healthy', 'Monitor', 'At Risk', 'Critical']
const healthDescriptions: Record<HealthLevel, string> = { Healthy: 'Device is operating normally', Monitor: 'Device is healthy but needs observation', 'At Risk': 'Device needs service attention', Critical: 'Device is offline, lost, or severely impaired' }
const healthClass = (level: HealthLevel) => level.toLowerCase().replace(/\s+/g, '-')
// Earlier versions saved "Needs attention" and "Offline"; map them onto the current levels.
export function normalizeHealth(value: unknown): DeviceHealth {
  if (value === 'At Risk' || value === 'Needs attention') return 'At Risk'
  if (value === 'Critical' || value === 'Offline') return 'Critical'
  return 'Healthy'
}
// A device is "warranty soon" when its warranty ends within the next 60 days.
export const isWarrantySoon = (asset: AssetItem) => asset.status !== 'Retired' && asset.status !== 'Lost' && !!asset.warrantyEnd && asset.warrantyEnd >= new Date().toISOString().slice(0, 10) && new Date(asset.warrantyEnd).getTime() - Date.now() <= 60 * 86_400_000
export const assetHealthLevel = (asset: AssetItem): HealthLevel => asset.health === 'Healthy' && isWarrantySoon(asset) ? 'Monitor' : asset.health

export const ASSET_EXPORT_HEADERS = ['Asset ID', 'Item', 'Category', 'Status', 'Assigned to', 'Department', 'Location', 'Manufacturer', 'Model', 'Serial number', 'Condition', 'Device health', 'Assigned date', 'Expected return', 'Purchase date', 'Warranty ends', 'Tags', 'Linked tickets', 'Notes']
export const STOCK_EXPORT_HEADERS = ['Stock ID', 'Item', 'Category', 'On hand', 'Minimum', 'Stock level', 'Location', 'Tags', 'Last updated']
export const assetExportRows = (assets: AssetItem[], tickets: TicketReference[]): CsvValue[][] => assets.map((asset) => [asset.id, asset.name, asset.category, asset.status, asset.assignedTo, asset.department, asset.location, asset.manufacturer, asset.model, asset.serial, asset.condition, assetHealthLevel(asset), asset.assignedAt, asset.expectedReturnAt, asset.purchaseDate, asset.warrantyEnd, (asset.tags || []).join('; '), [...new Set([...asset.linkedTicketIds, ...tickets.filter((ticket) => ticket.assetId === asset.id).map((ticket) => ticket.id)])].join('; '), asset.notes])
export const stockExportRows = (stock: StockItem[]): CsvValue[][] => stock.map((item) => [item.sku, item.name, item.category, item.quantity, item.minimum, item.quantity === 0 ? 'Out of stock' : item.quantity <= item.minimum ? 'Low stock' : 'In stock', item.location, (item.tags || []).join('; '), item.updatedAt])

/** Exports every asset and every stock item (not just the filtered ones): two CSV files, or one Excel workbook with an Assets and a Stock sheet. */
export function exportAllInventory(format: 'csv' | 'xlsx', assets: AssetItem[], stock: StockItem[], tickets: TicketReference[]) {
  const date = new Date().toISOString().slice(0, 10)
  const assetRows = assetExportRows(assets, tickets)
  const stockRows = stockExportRows(stock)
  if (format === 'xlsx') exportXlsxWorkbook(`inventory-${date}.xlsx`, [{ name: 'Assets', headers: ASSET_EXPORT_HEADERS, rows: assetRows }, { name: 'Stock', headers: STOCK_EXPORT_HEADERS, rows: stockRows }])
  else {
    exportCsv(`inventory-assets-${date}.csv`, ASSET_EXPORT_HEADERS, assetRows)
    exportCsv(`inventory-stock-${date}.csv`, STOCK_EXPORT_HEADERS, stockRows)
  }
}
// Demo only: simulates an Action1 device-health lookup. There is no live Action1 connection.
function mockAction1HealthCheck(items: AssetItem[]): Promise<{ serial: string; health: DeviceHealth }[]> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(items.map((asset) => {
      const roll = Math.random()
      return { serial: asset.serial, health: roll < 0.72 ? 'Healthy' : roll < 0.9 ? 'At Risk' : 'Critical' }
    })), 900 + 700 * Math.random())
  })
}
const categories = ['Laptop', 'Desktop', 'Monitor', 'Phone', 'Tablet', 'Network', 'Peripheral', 'Other']
const departments = ['Field Services', 'Finance', 'People & HR', 'Facilities', 'Platform Engineering', 'Commerce', 'Customer Care', 'Data & Analytics', 'Security']
const dateOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value + (value.length === 10 ? 'T12:00:00' : ''))) : 'Not recorded'
const stampLabel = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const assetCode = (value: string) => value.trim().toUpperCase()
const parseTags = (value: string) => [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)

function sampleAssets(): AssetItem[] {
  const now = new Date().toISOString()
  const make = (id: string, name: string, category: string, manufacturer: string, model: string, serial: string, status: AssetStatus, assignedTo: string, department: string, location: string, warrantyDays: number, linkedTicketIds: string[] = []): AssetItem => ({
    id, name, category, manufacturer, model, serial, status, assignedTo, department, location,
    assignedAt: assignedTo ? dateOffset(-45) : '', expectedReturnAt: '', issuedBy: assignedTo ? 'Service Desk' : '',
    purchaseDate: dateOffset(-420), warrantyEnd: dateOffset(warrantyDays), condition: status === 'In Repair' ? 'Damaged' : 'Good', health: status === 'In Repair' ? 'At Risk' : status === 'Lost' ? 'Critical' : 'Healthy', notes: '', tags: category === 'Laptop' ? ['Endpoint'] : category === 'Network' ? ['Infrastructure'] : [], starred: false, linkedTicketIds,
    history: [{ at: now, action: 'Sample asset added', detail: 'Mock inventory record for this local prototype.' }],
  })
  return [
    make('AST-1001', 'Latitude 7450 laptop', 'Laptop', 'Dell', 'Latitude 7450', 'DL7450-21084', 'Assigned', 'Keiko Mori', 'Field Services', 'Tokyo · 3F', 210),
    make('AST-1002', 'ThinkPad T14 laptop', 'Laptop', 'Lenovo', 'ThinkPad T14 Gen 5', 'LNT14-58231', 'Assigned', 'Mina Sato', 'Field Services', 'Tokyo · Remote', 44, ['OPS-102']),
    make('AST-1003', 'MacBook Pro 14', 'Laptop', 'Apple', 'MacBook Pro M3', 'APMBP-77412', 'Available', '', 'Platform Engineering', 'Tokyo · IT storage', 390),
    make('AST-1004', 'UltraSharp 27 monitor', 'Monitor', 'Dell', 'U2724D', 'DL2724-91837', 'Assigned', 'Jordan Lee', 'Data & Analytics', 'Tokyo · 5F', 95),
    make('AST-1005', 'iPhone 15', 'Phone', 'Apple', 'iPhone 15', 'API15-30944', 'Assigned', 'Sam Rivera', 'Security', 'Tokyo · 4F', 18),
    make('AST-1006', 'EliteBook 840 laptop', 'Laptop', 'HP', 'EliteBook 840 G10', 'HP840-63420', 'In Repair', '', 'Field Services', 'Tokyo · Repair shelf', 24, ['OPS-107']),
    make('AST-1007', 'Surface Laptop 6', 'Laptop', 'Microsoft', 'Surface Laptop 6', 'MSL6-20776', 'Available', '', 'Finance', 'Tokyo · IT storage', 430),
    make('AST-1008', 'Catalyst access point', 'Network', 'Cisco', 'CW9164', 'CSAP-11490', 'In Repair', '', 'Facilities', 'West wing · Network closet', 60, ['OPS-108']),
    make('AST-1009', 'OptiPlex Micro desktop', 'Desktop', 'Dell', 'OptiPlex 7020', 'DLOP-45029', 'Available', '', 'Customer Care', 'Tokyo · IT storage', 320),
    make('AST-1010', 'iPad Air', 'Tablet', 'Apple', 'iPad Air 11', 'APIP-83371', 'Assigned', 'Aiko Tanaka', 'Field Services', 'Osaka · Office', 180),
    make('AST-1011', 'Legacy file server', 'Network', 'HPE', 'ProLiant DL360', 'HPDL-10298', 'Retired', '', 'Platform Engineering', 'Tokyo · Archive', -120),
    make('AST-1012', 'Jabra Evolve2 headset', 'Peripheral', 'Jabra', 'Evolve2 65', 'JBE2-66217', 'Available', '', 'Customer Care', 'Tokyo · IT storage', 510),
  ]
}
function sampleStock(): StockItem[] {
  const now = new Date().toISOString()
  const make = (sku: string, name: string, category: string, quantity: number, minimum: number, location: string): StockItem => ({ sku, name, category, quantity, minimum, location, tags: [], starred: false, updatedAt: now, history: [{ at: now, action: 'Sample stock added', detail: 'Mock stock record for this local prototype.' }] })
  return [
    make('STK-201', 'USB-C charging cable', 'Cable', 8, 10, 'Tokyo · IT storage'),
    make('STK-202', 'Wireless mouse', 'Peripheral', 24, 8, 'Tokyo · IT storage'),
    make('STK-203', 'HDMI cable 2m', 'Cable', 6, 6, 'Tokyo · IT storage'),
    make('STK-204', 'USB-C docking station', 'Dock', 3, 5, 'Tokyo · IT storage'),
    make('STK-205', 'Ethernet patch cable', 'Cable', 38, 12, 'Osaka · IT storage'),
  ]
}
export function loadAssets(): AssetItem[] {
  try { const saved = localStorage.getItem(ASSET_KEY); return saved ? (JSON.parse(saved) as AssetItem[]).map((asset) => ({ ...asset, health: normalizeHealth(asset.health), tags: Array.isArray(asset.tags) ? asset.tags : [], starred: Boolean(asset.starred) })) : sampleAssets() } catch { return sampleAssets() }
}
export function loadStock(): StockItem[] {
  try { const saved = localStorage.getItem(STOCK_KEY); return saved ? (JSON.parse(saved) as StockItem[]).map((item) => ({ ...item, tags: Array.isArray(item.tags) ? item.tags : [], starred: Boolean(item.starred) })) : sampleStock() } catch { return sampleStock() }
}
export function saveAssets(items: AssetItem[]) { localStorage.setItem(ASSET_KEY, JSON.stringify(items)) }
export function saveStock(items: StockItem[]) { localStorage.setItem(STOCK_KEY, JSON.stringify(items)) }

type InventoryProps = {
  focusId?: string
  focusRevision?: number
  command?: InventoryCommand | null
  onCommandHandled?: () => void
  assets: AssetItem[]
  stock: StockItem[]
  updateAssets: (update: (items: AssetItem[]) => AssetItem[]) => void
  updateStock: (update: (items: StockItem[]) => StockItem[]) => void
  tickets: TicketReference[]
  openTicket: (id: string) => void
  linkTicket: (ticketId: string, assetId: string) => void
  createTicket: (asset: AssetItem) => void
}
const emptyAsset = { id: '', name: '', category: 'Laptop', manufacturer: '', model: '', serial: '', department: 'Field Services', location: '', purchaseDate: '', warrantyEnd: '', condition: 'Good' as AssetItem['condition'], health: 'Healthy' as DeviceHealth, notes: '', tagsText: '' }
const emptyStock = { sku: '', name: '', category: 'Cable', quantity: '0', minimum: '0', location: '', tagsText: '' }

export default function InventoryPage({ focusId = '', focusRevision = 0, command, onCommandHandled, assets, stock, updateAssets, updateStock, tickets, openTicket, linkTicket, createTicket }: InventoryProps) {
  const [tab, setTab] = useState<'assets' | 'stock'>('assets')
  const [workspace, setWorkspace] = useState<InventoryWorkspace>(loadInventoryWorkspace)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [viewMode, setViewMode] = useState<InventoryViewMode>(() => {
    const saved = localStorage.getItem(INVENTORY_VIEW_MODE_KEY)
    return inventoryViewModes.includes(saved as InventoryViewMode) ? saved as InventoryViewMode : 'list'
  })
  const [splitLeft, setSplitLeft] = useState<InventorySplitPaneMode>('list')
  const [splitRight, setSplitRight] = useState<InventorySplitPaneMode>('details')
  const [splitAssetId, setSplitAssetId] = useState('')
  const [splitStockSku, setSplitStockSku] = useState('')
  useEffect(() => { localStorage.setItem(INVENTORY_VIEW_MODE_KEY, viewMode) }, [viewMode])
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | AssetStatus | 'Warranty soon'>('All')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [assignedFilter, setAssignedFilter] = useState('All people')
  const [healthFilter, setHealthFilter] = useState<'All health' | HealthLevel>('All health')
  const [action1Syncing, setAction1Syncing] = useState(false)
  const [action1LastSyncedAt, setAction1LastSyncedAt] = useState<Date | null>(null)
  const [action1SyncError, setAction1SyncError] = useState('')
  const [starredOnly, setStarredOnly] = useState(false)
  const [savedInventoryViews, setSavedInventoryViews] = useState<SavedView<InventoryViewSettings>[]>(() => loadSavedViews<InventoryViewSettings>(SAVED_INVENTORY_VIEWS_KEY).map(normalizeSavedInventoryView))
  useEffect(() => { localStorage.setItem(SAVED_INVENTORY_VIEWS_KEY, JSON.stringify(savedInventoryViews)) }, [savedInventoryViews])
  const [selectedId, setSelectedId] = useState(focusId)
  useEffect(() => { if (focusId) setSelectedId(focusId) }, [focusId, focusRevision])
  const [selectedSku, setSelectedSku] = useState('')
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [showAddStock, setShowAddStock] = useState(false)
  const handledCommandRevision = useRef(0)
  const [assetForm, setAssetForm] = useState(emptyAsset)
  const [showEditAsset, setShowEditAsset] = useState(false)
  const [editForm, setEditForm] = useState(emptyAsset)
  const [stockForm, setStockForm] = useState(emptyStock)
  const [formError, setFormError] = useState('')
  const [action, setAction] = useState<'assign' | 'return' | 'repair' | 'move' | 'retire' | 'lost' | ''>('')
  const [actionForm, setActionForm] = useState({ person: '', department: 'Field Services', location: '', issuedBy: '', expectedReturn: '', condition: 'Good' as AssetItem['condition'], note: '', returnStatus: 'Available' as 'Available' | 'In Repair' })
  const [ticketToLink, setTicketToLink] = useState('')
  const [stockChange, setStockChange] = useState({ amount: '', reason: '' })
  const [stockTagsText, setStockTagsText] = useState('')
  const selected = assets.find((asset) => asset.id === selectedId)
  const stockSelected = stock.find((item) => item.sku === selectedSku)
  const today = new Date().toISOString().slice(0, 10)
  const warrantySoon = isWarrantySoon
  // A healthy device whose warranty ends within 60 days is shown as Monitor.
  const healthLevel = assetHealthLevel
  const healthBadge = (asset: AssetItem) => {
    const level = healthLevel(asset)
    // Generate waveform path based on health level
    const generateWaveform = (health: HealthLevel) => {
      const points: [number, number][] = []
      const amp = health === 'Healthy' ? 6 : health === 'Monitor' ? 5 : health === 'At Risk' ? 4 : 2
      const freq = health === 'Healthy' ? 1.2 : health === 'Monitor' ? 1 : health === 'At Risk' ? 0.8 : 0.3
      for (let x = 0; x <= 60; x += 2) {
        const y = 8 + Math.sin((x / 60) * Math.PI * 2 * freq) * amp + (health === 'Critical' || health === 'At Risk' ? Math.random() * 2 - 1 : 0)
        points.push([x, y])
      }
      return points.map((p) => p.join(',')).join(' ')
    }
    return (
      <span className={'inventory-health-badge ' + healthClass(level)} title={healthDescriptions[level]}>
        <svg viewBox="0 0 70 16" className="health-waveform" aria-hidden="true">
          <polyline points={generateWaveform(level)} />
        </svg>
        <span>{level}</span>
      </span>
    )
  }
  const counts = { available: assets.filter((asset) => asset.status === 'Available').length, assigned: assets.filter((asset) => asset.status === 'Assigned').length, repair: assets.filter((asset) => asset.status === 'In Repair').length, warranty: assets.filter(warrantySoon).length, low: stock.filter((item) => item.quantity <= item.minimum).length }
  const assetCategories = useMemo(() => [...new Set(assets.map((asset) => asset.category))].sort(), [assets])
  const assignedPeople = useMemo(() => [...new Set(assets.map((asset) => asset.assignedTo).filter(Boolean))].sort(), [assets])
  const assetTags = useMemo(() => [...new Set(assets.flatMap((asset) => asset.tags || []))].sort(), [assets])
  const stockTags = useMemo(() => [...new Set(stock.flatMap((item) => item.tags || []))].sort(), [stock])
  const [tagFilter, setTagFilter] = useState('All tags')
  const filteredAssets = useMemo(() => assets.filter((asset) => {
    const text = [asset.id, asset.name, asset.category, asset.manufacturer, asset.model, asset.serial, asset.assignedTo, asset.department, asset.location, ...(asset.tags || []), ...asset.linkedTicketIds].join(' ').toLowerCase()
    return text.includes(query.toLowerCase()) && (statusFilter === 'All' || statusFilter === 'Warranty soon' ? statusFilter !== 'Warranty soon' || warrantySoon(asset) : asset.status === statusFilter) && (categoryFilter === 'All categories' || asset.category === categoryFilter) && (assignedFilter === 'All people' || (assignedFilter === 'Unassigned' ? !asset.assignedTo : asset.assignedTo === assignedFilter)) && (tagFilter === 'All tags' || (asset.tags || []).includes(tagFilter)) && (healthFilter === 'All health' || healthLevel(asset) === healthFilter) && (!starredOnly || asset.starred)
  }), [assets, query, statusFilter, categoryFilter, assignedFilter, tagFilter, healthFilter, starredOnly])
  const filteredStock = useMemo(() => stock.filter((item) => [item.sku, item.name, item.category, item.location, ...(item.tags || [])].join(' ').toLowerCase().includes(query.toLowerCase()) && (!lowStockOnly || item.quantity <= item.minimum) && (!inStockOnly || item.quantity > 0) && (tagFilter === 'All tags' || (item.tags || []).includes(tagFilter)) && (!starredOnly || item.starred)), [stock, query, lowStockOnly, inStockOnly, tagFilter, starredOnly])
  const exportCurrentInventory = (format: 'csv' | 'xlsx') => {
    const date = new Date().toISOString().slice(0, 10)
    if (tab === 'assets') {
      const visible = viewMode === 'attention' ? filteredAssets.filter((asset) => asset.status === 'In Repair' || asset.status === 'Lost' || warrantySoon(asset)) : filteredAssets
      const rows = assetExportRows(visible, tickets)
      const headers = ASSET_EXPORT_HEADERS
      if (format === 'xlsx') exportXlsx(`inventory-assets-${date}.xlsx`, 'Assets', headers, rows)
      else exportCsv(`inventory-assets-${date}.csv`, headers, rows)
    } else {
      const rows = stockExportRows(filteredStock)
      const headers = STOCK_EXPORT_HEADERS
      if (format === 'xlsx') exportXlsx(`inventory-stock-${date}.xlsx`, 'Stock', headers, rows)
      else exportCsv(`inventory-stock-${date}.csv`, headers, rows)
    }
  }
  const splitAsset = filteredAssets.find((asset) => asset.id === splitAssetId) || filteredAssets[0]
  const splitStock = filteredStock.find((item) => item.sku === splitStockSku) || filteredStock[0]
  const relatedTickets = selected ? tickets.filter((ticket) => ticket.assetId === selected.id || selected.linkedTicketIds.includes(ticket.id)) : []
  const currentPane: InventoryPaneSettings = { tab, viewMode, splitLeft, splitRight, query, statusFilter, categoryFilter, assignedFilter, tagFilter, healthFilter, starredOnly, lowStockOnly, inStockOnly }
  const currentInventoryView: InventoryViewSettings = { ...currentPane, workspaceTabs: workspace.tabs.map((item) => item.id === workspace.activeId ? { ...item, settings: currentPane } : item), activeWorkspaceId: workspace.activeId }
  const applyPaneView = (settings: InventoryPaneSettings) => {
    setTab(settings.tab === 'stock' ? 'stock' : 'assets')
    setViewMode(inventoryViewModes.includes(settings.viewMode) ? settings.viewMode : 'list')
    setSplitLeft(inventorySplitPaneModes.includes(settings.splitLeft) ? settings.splitLeft : 'list')
    setSplitRight(inventorySplitPaneModes.includes(settings.splitRight) ? settings.splitRight : 'details')
    setQuery(settings.query || '')
    setStatusFilter(statuses.includes(settings.statusFilter as AssetStatus) || settings.statusFilter === 'Warranty soon' ? settings.statusFilter : 'All')
    setCategoryFilter(settings.categoryFilter || 'All categories')
    setAssignedFilter(settings.assignedFilter || 'All people')
    setTagFilter(settings.tagFilter || 'All tags')
    setHealthFilter(healthLevels.includes(settings.healthFilter as HealthLevel) ? settings.healthFilter : 'All health')
    setStarredOnly(Boolean(settings.starredOnly))
    setLowStockOnly(Boolean(settings.lowStockOnly))
    setInStockOnly(Boolean(settings.inStockOnly))
  }
  useEffect(() => {
    const active = workspace.tabs.find((item) => item.id === workspace.activeId)
    if (active) applyPaneView(active.settings)
    setWorkspaceReady(true)
  }, [])
  useEffect(() => {
    if (!workspaceReady) return
    localStorage.setItem(INVENTORY_WORKSPACE_KEY, JSON.stringify({ tabs: workspace.tabs.map((item) => item.id === workspace.activeId ? { ...item, settings: currentPane } : item), activeId: workspace.activeId }))
  }, [workspace, workspaceReady, tab, viewMode, splitLeft, splitRight, query, statusFilter, categoryFilter, assignedFilter, tagFilter, healthFilter, starredOnly, lowStockOnly, inStockOnly])
  const switchWorkspaceTab = (id: string) => {
    if (id === workspace.activeId) return
    const next = workspace.tabs.find((item) => item.id === id)
    if (!next) return
    setWorkspace({ tabs: workspace.tabs.map((item) => item.id === workspace.activeId ? { ...item, settings: currentPane } : item), activeId: id })
    applyPaneView(next.settings)
  }
  const addWorkspaceTab = () => {
    const id = newWorkspaceId()
    const settings = defaultPaneSettings(tab)
    setWorkspace({ tabs: [...workspace.tabs.map((item) => item.id === workspace.activeId ? { ...item, settings: currentPane } : item), { id, settings }], activeId: id })
    applyPaneView(settings)
  }
  const closeWorkspaceTab = (id: string) => {
    if (workspace.tabs.length === 1) return
    const index = workspace.tabs.findIndex((item) => item.id === id)
    if (index < 0) return
    const tabs = workspace.tabs.filter((item) => item.id !== id).map((item) => item.id === workspace.activeId ? { ...item, settings: currentPane } : item)
    const activeId = id === workspace.activeId ? tabs[Math.min(index, tabs.length - 1)].id : workspace.activeId
    setWorkspace({ tabs, activeId })
    if (id === workspace.activeId) applyPaneView(tabs.find((item) => item.id === activeId)!.settings)
  }
  const applyInventoryView = (settings: InventoryViewSettings) => {
    const tabs = Array.isArray(settings.workspaceTabs) ? settings.workspaceTabs.filter((item): item is InventoryWorkspaceTab => !!item && typeof item.id === 'string' && !!item.settings) : []
    if (tabs.length) {
      const activeId = tabs.some((item) => item.id === settings.activeWorkspaceId) ? settings.activeWorkspaceId! : tabs[0].id
      setWorkspace({ tabs, activeId })
      applyPaneView(tabs.find((item) => item.id === activeId)!.settings)
    } else {
      const id = newWorkspaceId()
      setWorkspace({ tabs: [{ id, settings }], activeId: id })
      applyPaneView(settings)
    }
  }
  const resetInventoryView = () => {
    const id = newWorkspaceId()
    const settings = defaultPaneSettings()
    setWorkspace({ tabs: [{ id, settings }], activeId: id })
    applyPaneView(settings)
  }
  useEffect(() => {
    if (!command || command.revision === handledCommandRevision.current) return
    handledCommandRevision.current = command.revision
    if (command.action === 'export-csv' || command.action === 'export-xlsx') {
      exportCurrentInventory(command.action === 'export-csv' ? 'csv' : 'xlsx')
      onCommandHandled?.()
      return
    }
    setSelectedId('')
    setSelectedSku('')
    setFormError('')
    if (command.action === 'add-asset') { setTab('assets'); setShowAddAsset(true); setShowAddStock(false) }
    if (command.action === 'add-stock') { setTab('stock'); setShowAddStock(true); setShowAddAsset(false) }
    if (command.action === 'in-stock') applyPaneView(inStockView.settings)
    if (command.action === 'low-stock') { setTab('stock'); setQuery(''); setTagFilter('All tags'); setStarredOnly(false); setLowStockOnly(true); setInStockOnly(false) }
    onCommandHandled?.()
  }, [command?.revision, command?.action])
  const toggleAssetStar = (id: string) => updateAssets((items) => items.map((asset) => asset.id === id ? { ...asset, starred: !asset.starred } : asset))
  const toggleStockStar = (sku: string) => updateStock((items) => items.map((item) => item.sku === sku ? { ...item, starred: !item.starred } : item))
  const saveStockTags = () => {
    if (!stockSelected) return
    const tags = parseTags(stockTagsText)
    updateStock((items) => items.map((item) => item.sku === stockSelected.sku ? { ...item, tags, updatedAt: new Date().toISOString(), history: [...(item.history || []), { at: new Date().toISOString(), action: 'Tags updated', detail: tags.length ? tags.join(', ') : 'Tags cleared.' }] } : item))
  }

  const openAction = (value: typeof action) => {
    if (!selected) return
    setAction(value)
    setFormError('')
    setActionForm({ person: selected.assignedTo, department: selected.department || 'Field Services', location: selected.location, issuedBy: selected.issuedBy, expectedReturn: selected.expectedReturnAt, condition: selected.condition, note: '', returnStatus: 'Available' })
  }
  const openEdit = () => {
    if (!selected) return
    setEditForm({ id: selected.id, name: selected.name, category: selected.category, manufacturer: selected.manufacturer, model: selected.model, serial: selected.serial, department: selected.department, location: selected.location, purchaseDate: selected.purchaseDate, warrantyEnd: selected.warrantyEnd, condition: selected.condition, health: selected.health, notes: selected.notes, tagsText: (selected.tags || []).join(', ') })
    setFormError('')
    setShowEditAsset(true)
  }
  const saveEdit = () => {
    if (!selected) return
    if (!editForm.name.trim()) { setFormError('Enter an item name.'); return }
    if (!editForm.serial.trim()) { setFormError('Enter a serial number.'); return }
    if (assets.some((asset) => asset.id !== selected.id && asset.serial.toLowerCase() === editForm.serial.trim().toLowerCase())) { setFormError('That serial number is already in use.'); return }
    const nextFields = { name: editForm.name.trim(), category: editForm.category, manufacturer: editForm.manufacturer.trim(), model: editForm.model.trim(), serial: editForm.serial.trim(), department: editForm.department, location: editForm.location.trim(), purchaseDate: editForm.purchaseDate, warrantyEnd: editForm.warrantyEnd, condition: editForm.condition, health: editForm.health, notes: editForm.notes.trim(), tags: parseTags(editForm.tagsText) }
    const changed = (Object.keys(nextFields) as (keyof typeof nextFields)[]).filter((key) => JSON.stringify(selected[key]) !== JSON.stringify(nextFields[key]))
    if (changed.length) updateAssets((items) => items.map((asset) => asset.id === selected.id ? { ...asset, ...nextFields, history: [...(asset.history || []), { at: new Date().toISOString(), action: 'Asset details updated', detail: 'Changed ' + changed.join(', ') + '.' }] } : asset))
    setShowEditAsset(false)
    setFormError('')
  }
  const applyAction = () => {
    if (!selected || !action) return
    if (action === 'assign' && !actionForm.person.trim()) { setFormError('Enter the person receiving this asset.'); return }
    if (action === 'assign' && !actionForm.issuedBy.trim()) { setFormError('Enter who issued this asset.'); return }
    if ((action === 'assign' || action === 'return' || action === 'repair' || action === 'move') && !actionForm.location.trim()) { setFormError('Enter the asset location.'); return }
    if ((action === 'retire' || action === 'lost') && !actionForm.note.trim()) { setFormError('Add a reason to the history.'); return }
    const at = new Date().toISOString()
    updateAssets((items) => items.map((asset) => {
      if (asset.id !== selected.id) return asset
      let next: AssetItem = { ...asset }
      let detail = ''
      if (action === 'assign') { next = { ...next, status: 'Assigned', assignedTo: actionForm.person.trim(), department: actionForm.department, location: actionForm.location.trim(), assignedAt: today, expectedReturnAt: actionForm.expectedReturn, issuedBy: actionForm.issuedBy.trim(), condition: actionForm.condition }; detail = (asset.assignedTo && asset.assignedTo !== next.assignedTo ? 'Reassigned from ' + asset.assignedTo + ' to ' + next.assignedTo : 'Assigned to ' + next.assignedTo) + ' by ' + next.issuedBy + (next.expectedReturnAt ? '; expected return ' + dateLabel(next.expectedReturnAt) : '') }
      if (action === 'return') { next = { ...next, status: actionForm.returnStatus, assignedTo: '', assignedAt: '', expectedReturnAt: '', issuedBy: '', location: actionForm.location.trim(), condition: actionForm.condition }; detail = 'Returned by ' + (asset.assignedTo || 'previous holder') + '; moved to ' + next.location + ' as ' + next.status }
      if (action === 'repair') { next = { ...next, status: 'In Repair', assignedTo: '', assignedAt: '', expectedReturnAt: '', issuedBy: '', location: actionForm.location.trim(), condition: 'Damaged' }; detail = 'Sent for repair at ' + next.location }
      if (action === 'move') { next = { ...next, location: actionForm.location.trim() }; detail = 'Moved from ' + asset.location + ' to ' + next.location }
      if (action === 'retire') { next = { ...next, status: 'Retired', assignedTo: '', assignedAt: '', expectedReturnAt: '', issuedBy: '' }; detail = 'Retired: ' + actionForm.note.trim() }
      if (action === 'lost') { next = { ...next, status: 'Lost', assignedTo: '', assignedAt: '', expectedReturnAt: '', issuedBy: '' }; detail = 'Marked lost: ' + actionForm.note.trim() }
      if (actionForm.note.trim() && action !== 'retire' && action !== 'lost') detail += '. Note: ' + actionForm.note.trim()
      return { ...next, history: [...(asset.history || []), { at, action: action === 'assign' ? 'Assigned' : action === 'return' ? 'Returned' : action === 'repair' ? 'Sent for repair' : action === 'move' ? 'Location changed' : action === 'retire' ? 'Retired' : 'Marked lost', detail }] }
    }))
    setAction('')
    setFormError('')
  }
  const addAsset = () => {
    const id = assetCode(assetForm.id || 'AST-' + String(Date.now()).slice(-5))
    if (!assetForm.name.trim()) { setFormError('Enter an item name.'); return }
    if (!assetForm.serial.trim()) { setFormError('Enter a serial number.'); return }
    if (assets.some((asset) => asset.id.toLowerCase() === id.toLowerCase())) { setFormError('That asset ID is already in use.'); return }
    if (assets.some((asset) => asset.serial.toLowerCase() === assetForm.serial.trim().toLowerCase())) { setFormError('That serial number is already in use.'); return }
    const at = new Date().toISOString()
    const { tagsText, ...fields } = assetForm
    updateAssets((items) => [{ ...fields, id, name: assetForm.name.trim(), serial: assetForm.serial.trim(), tags: parseTags(tagsText), starred: false, status: 'Available', assignedTo: '', assignedAt: '', expectedReturnAt: '', issuedBy: '', linkedTicketIds: [], history: [{ at, action: 'Asset added', detail: 'Added to inventory as Available.' }] }, ...items])
    setAssetForm(emptyAsset); setFormError(''); setShowAddAsset(false); setTab('assets'); setSelectedId(id)
  }
  const addStock = () => {
    const sku = assetCode(stockForm.sku || 'STK-' + String(Date.now()).slice(-5))
    if (!stockForm.name.trim()) { setFormError('Enter an item name.'); return }
    if (stock.some((item) => item.sku.toLowerCase() === sku.toLowerCase())) { setFormError('That stock ID is already in use.'); return }
    const quantity = Number(stockForm.quantity), minimum = Number(stockForm.minimum)
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(minimum) || minimum < 0) { setFormError('Enter whole numbers of zero or more for quantities.'); return }
    const at = new Date().toISOString()
    updateStock((items) => [{ sku, name: stockForm.name.trim(), category: stockForm.category.trim(), quantity, minimum, location: stockForm.location.trim(), tags: parseTags(stockForm.tagsText), starred: false, updatedAt: at, history: [{ at, action: 'Stock item added', detail: 'Starting quantity: ' + quantity }] }, ...items])
    setStockForm(emptyStock); setFormError(''); setShowAddStock(false); setTab('stock'); setSelectedSku(sku)
  }
  const adjustStock = () => {
    if (!stockSelected) return
    const amount = Number(stockChange.amount)
    if (!Number.isInteger(amount) || amount === 0) { setFormError('Enter a non-zero whole number. Use a minus sign to issue stock.'); return }
    if (stockSelected.quantity + amount < 0) { setFormError('The adjustment would make stock negative.'); return }
    if (!stockChange.reason.trim()) { setFormError('Enter a reason for the adjustment.'); return }
    const at = new Date().toISOString()
    updateStock((items) => items.map((item) => item.sku === stockSelected.sku ? { ...item, quantity: item.quantity + amount, updatedAt: at, history: [...(item.history || []), { at, action: amount > 0 ? 'Stock received' : 'Stock issued', detail: Math.abs(amount) + ' units. ' + stockChange.reason.trim() }] } : item))
    setStockChange({ amount: '', reason: '' }); setFormError('')
  }
  const syncHealthFromAction1 = async () => {
    if (action1Syncing) return
    setAction1Syncing(true)
    setAction1SyncError('')
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('No network connection')
      const results = await mockAction1HealthCheck(assets)
      const at = new Date().toISOString()
      updateAssets((items) => items.map((asset) => {
        const result = results.find((item) => item.serial === asset.serial)
        if (!result || result.health === asset.health) return asset
        return { ...asset, health: result.health, history: [...(asset.history || []), { at, action: 'Device health synced', detail: `${asset.health} → ${result.health} (Action1 demo data).` }] }
      }))
      setAction1LastSyncedAt(new Date())
    } catch (error) {
      setAction1SyncError(error instanceof Error && error.message ? error.message : 'Sync failed')
    } finally {
      setAction1Syncing(false)
    }
  }
  const addTicketLink = () => {
    if (!selected || !ticketToLink) return
    linkTicket(ticketToLink, selected.id)
    updateAssets((items) => items.map((asset) => asset.id === selected.id ? { ...asset, linkedTicketIds: [...new Set([...asset.linkedTicketIds, ticketToLink])], history: [...(asset.history || []), { at: new Date().toISOString(), action: 'Ticket linked', detail: ticketToLink + ' linked to this asset.' }] } : asset.linkedTicketIds.includes(ticketToLink) ? { ...asset, linkedTicketIds: asset.linkedTicketIds.filter((id) => id !== ticketToLink), history: [...(asset.history || []), { at: new Date().toISOString(), action: 'Ticket unlinked', detail: ticketToLink + ' moved to another asset.' }] } : asset))
    setTicketToLink('')
  }

  const openAssetRecord = (asset: AssetItem) => { setSelectedId(asset.id); setTicketToLink('') }
  const openStockRecord = (item: StockItem) => { setSelectedSku(item.sku); setStockTagsText((item.tags || []).join(', ')); setStockChange({ amount: '', reason: '' }); setFormError('') }
  const assetStatus = (asset: AssetItem) => <span className={'inventory-status ' + asset.status.toLowerCase().replace(/\s+/g, '-')}>{asset.status}</span>
  const stockStatus = (item: StockItem) => <span className={'inventory-status ' + (item.quantity === 0 ? 'lost' : item.quantity <= item.minimum ? 'in-repair' : 'available')}>{item.quantity === 0 ? 'Out of stock' : item.quantity <= item.minimum ? 'Low stock' : 'In stock'}</span>
  const assetCard = (asset: AssetItem) => <article className="inventory-view-card" key={asset.id}>
    <div className="inventory-view-card-top"><span>{asset.id}</span><button className={'inventory-star' + (asset.starred ? ' is-starred' : '')} onClick={() => toggleAssetStar(asset.id)} aria-label={`${asset.starred ? 'Remove star from' : 'Star'} ${asset.id}`} aria-pressed={asset.starred}><Star size={16} fill={asset.starred ? 'currentColor' : 'none'} /></button></div>
    <button className="inventory-view-card-title" onClick={() => openAssetRecord(asset)}>{asset.name}</button>
    <p>{asset.manufacturer} {asset.model} · {asset.category}</p>
    <div className="inventory-view-card-meta">{assetStatus(asset)}<span>{asset.assignedTo || 'Unassigned'}</span><span>{asset.department || 'No department'}</span><span>{asset.location || 'No location'}</span></div>
    <footer><span className={warrantySoon(asset) ? 'warranty-soon' : ''}>Warranty {dateLabel(asset.warrantyEnd)}</span><button onClick={() => openAssetRecord(asset)}>Details <ArrowRight size={13} /></button></footer>
  </article>
  const stockCard = (item: StockItem) => <article className="inventory-view-card" key={item.sku}>
    <div className="inventory-view-card-top"><span>{item.sku}</span><button className={'inventory-star' + (item.starred ? ' is-starred' : '')} onClick={() => toggleStockStar(item.sku)} aria-label={`${item.starred ? 'Remove star from' : 'Star'} ${item.sku}`} aria-pressed={item.starred}><Star size={16} fill={item.starred ? 'currentColor' : 'none'} /></button></div>
    <button className="inventory-view-card-title" onClick={() => openStockRecord(item)}>{item.name}</button>
    <p>{item.category} · {item.location || 'No location'}</p>
    <div className="inventory-view-card-meta">{stockStatus(item)}<span><b>{item.quantity}</b> on hand</span><span>Minimum {item.minimum}</span></div>
    <footer><span>Updated {stampLabel(item.updatedAt)}</span><button onClick={() => openStockRecord(item)}>Details <ArrowRight size={13} /></button></footer>
  </article>
  const assetRow = (asset: AssetItem) => <button key={asset.id} className="inventory-view-row" onClick={() => openAssetRecord(asset)}><span className="inventory-view-row-id">{asset.id}</span><span className="inventory-view-row-name">{asset.name}</span>{assetStatus(asset)}<ArrowRight size={14} /></button>
  const stockRow = (item: StockItem) => <button key={item.sku} className="inventory-view-row" onClick={() => openStockRecord(item)}><span className="inventory-view-row-id">{item.sku}</span><span className="inventory-view-row-name">{item.name}</span>{stockStatus(item)}<ArrowRight size={14} /></button>
  const assetGroups = [...new Set(filteredAssets.map((asset) => asset.department || 'No department'))].sort()
  const stockGroups = [...new Set(filteredStock.map((item) => item.category || 'Uncategorized'))].sort()
  const workspaceTabLabel = (settings: InventoryPaneSettings) => `${settings.tab === 'stock' ? 'Stock' : 'Assets'} · ${settings.viewMode === 'grouped' ? settings.tab === 'stock' ? 'By category' : 'By department' : settings.viewMode === 'attention' ? settings.tab === 'stock' ? 'Stock levels' : 'Needs attention' : settings.viewMode === 'split' ? 'Split' : settings.viewMode === 'cards' ? 'Cards' : 'List'}`
  const splitPaneLabel = (mode: InventorySplitPaneMode) => ({ list: 'List', details: 'Details', cards: 'Cards', grouped: tab === 'stock' ? 'By category' : 'By department', attention: tab === 'stock' ? 'Stock levels' : 'Needs attention' })[mode]
  const chooseSplitAsset = (asset: AssetItem) => { setSplitAssetId(asset.id); if (splitLeft !== 'details' && splitRight !== 'details') openAssetRecord(asset) }
  const chooseSplitStock = (item: StockItem) => { setSplitStockSku(item.sku); if (splitLeft !== 'details' && splitRight !== 'details') openStockRecord(item) }
  const splitAssetRow = (asset: AssetItem) => <button key={asset.id} className={'inventory-split-item' + (splitAsset?.id === asset.id ? ' active' : '')} aria-pressed={splitAsset?.id === asset.id} onClick={() => chooseSplitAsset(asset)}><span>{asset.id}</span><b>{asset.name}</b><small>{asset.assignedTo || 'Unassigned'} · {asset.status}</small></button>
  const splitStockRow = (item: StockItem) => <button key={item.sku} className={'inventory-split-item' + (splitStock?.sku === item.sku ? ' active' : '')} aria-pressed={splitStock?.sku === item.sku} onClick={() => chooseSplitStock(item)}><span>{item.sku}</span><b>{item.name}</b><small>{item.quantity} on hand · minimum {item.minimum}</small></button>
  const renderSplitPane = (mode: InventorySplitPaneMode) => {
    const hasItems = tab === 'assets' ? filteredAssets.length > 0 : filteredStock.length > 0
    if (mode === 'list') return <div className="inventory-split-list">{tab === 'assets' ? filteredAssets.map(splitAssetRow) : filteredStock.map(splitStockRow)}{!hasItems && <div className="inventory-empty">No records match these filters.</div>}</div>
    if (mode === 'details') return <div className="inventory-split-detail">{tab === 'assets' && splitAsset ? <><div className="eyebrow">ASSET · {splitAsset.id}</div><h2>{splitAsset.name}</h2><p>{splitAsset.manufacturer} {splitAsset.model}</p><div className="inventory-split-badge">{assetStatus(splitAsset)}<span>{splitAsset.category}</span></div><dl><div><dt>Assigned to</dt><dd>{splitAsset.assignedTo || 'Unassigned'}</dd></div><div><dt>Department</dt><dd>{splitAsset.department || '—'}</dd></div><div><dt>Location</dt><dd>{splitAsset.location || '—'}</dd></div><div><dt>Serial</dt><dd>{splitAsset.serial}</dd></div><div><dt>Warranty ends</dt><dd className={warrantySoon(splitAsset) ? 'warranty-soon' : ''}>{dateLabel(splitAsset.warrantyEnd)}</dd></div></dl><button className="inventory-split-open" onClick={() => openAssetRecord(splitAsset)}>Open full record <ArrowRight size={14} /></button></> : tab === 'stock' && splitStock ? <><div className="eyebrow">STOCK · {splitStock.sku}</div><h2>{splitStock.name}</h2><p>{splitStock.category} · {splitStock.location || 'No location'}</p><div className="inventory-split-badge">{stockStatus(splitStock)}</div><dl><div><dt>On hand</dt><dd>{splitStock.quantity}</dd></div><div><dt>Minimum</dt><dd>{splitStock.minimum}</dd></div><div><dt>Location</dt><dd>{splitStock.location || '—'}</dd></div><div><dt>Last updated</dt><dd>{stampLabel(splitStock.updatedAt)}</dd></div></dl><button className="inventory-split-open" onClick={() => openStockRecord(splitStock)}>Open full record <ArrowRight size={14} /></button></> : <div className="inventory-empty">No record matches these filters.</div>}</div>
    if (mode === 'cards') return <div className="inventory-split-card-grid">{tab === 'assets' ? filteredAssets.map((asset) => <button key={asset.id} className={'inventory-split-choice-card' + (splitAsset?.id === asset.id ? ' active' : '')} onClick={() => chooseSplitAsset(asset)}><span>{asset.id}</span><b>{asset.name}</b>{assetStatus(asset)}<small>{asset.assignedTo || 'Unassigned'} · {asset.department}</small></button>) : filteredStock.map((item) => <button key={item.sku} className={'inventory-split-choice-card' + (splitStock?.sku === item.sku ? ' active' : '')} onClick={() => chooseSplitStock(item)}><span>{item.sku}</span><b>{item.name}</b>{stockStatus(item)}<small>{item.quantity} on hand · minimum {item.minimum}</small></button>)}{!hasItems && <div className="inventory-empty">No records match these filters.</div>}</div>
    const groups: { name: string; assets?: AssetItem[]; stock?: StockItem[] }[] = mode === 'grouped'
      ? tab === 'assets' ? assetGroups.map((name) => ({ name, assets: filteredAssets.filter((asset) => (asset.department || 'No department') === name) })) : stockGroups.map((name) => ({ name, stock: filteredStock.filter((item) => (item.category || 'Uncategorized') === name) }))
      : tab === 'assets' ? [{ name: 'In repair', assets: filteredAssets.filter((asset) => asset.status === 'In Repair') }, { name: 'Warranty soon', assets: filteredAssets.filter(warrantySoon) }, { name: 'Lost', assets: filteredAssets.filter((asset) => asset.status === 'Lost') }] : [{ name: 'Out of stock', stock: filteredStock.filter((item) => item.quantity === 0) }, { name: 'Low stock', stock: filteredStock.filter((item) => item.quantity > 0 && item.quantity <= item.minimum) }, { name: 'In stock', stock: filteredStock.filter((item) => item.quantity > item.minimum) }]
    return <div className="inventory-split-groups">{groups.map((group) => <section key={group.name}><h3>{group.name} <span>{(group.assets || group.stock || []).length}</span></h3>{tab === 'assets' ? (group.assets || []).map(splitAssetRow) : (group.stock || []).map(splitStockRow)}{!(group.assets || group.stock || []).length && <p className="inventory-group-empty">No records in this group.</p>}</section>)}{!groups.length && <div className="inventory-empty">No records match these filters.</div>}</div>
  }

  return <main className="main-content inventory-page">
    <div className="inventory-heading"><div><div className="eyebrow">SERVICE DESK · ASSET MANAGEMENT</div><h1>Inventory</h1><p>Know what is available, where it is, and who has it.</p></div><div className="inventory-heading-actions"><button className="primary-button" onClick={() => { setFormError(''); tab === 'assets' ? setShowAddAsset(true) : setShowAddStock(true) }}><Plus size={16} /> Add {tab === 'assets' ? 'asset' : 'stock item'}</button></div></div>
    <section className="inventory-kpis" aria-label="Inventory summary"><button className={statusFilter === 'All' && tab === 'assets' ? 'selected' : ''} onClick={() => { setTab('assets'); setLowStockOnly(false); setInStockOnly(false); setQuery(''); setCategoryFilter('All categories'); setAssignedFilter('All people'); setTagFilter('All tags'); setHealthFilter('All health'); setStatusFilter('All') }}><Package size={18} /><span>Total assets</span><strong>{assets.length}</strong></button><button className={statusFilter === 'Available' && tab === 'assets' ? 'selected' : ''} onClick={() => { setTab('assets'); setLowStockOnly(false); setInStockOnly(false); setQuery(''); setCategoryFilter('All categories'); setAssignedFilter('All people'); setTagFilter('All tags'); setHealthFilter('All health'); setStatusFilter('Available') }}><Check size={18} /><span>Available</span><strong>{counts.available}</strong></button><button className={statusFilter === 'Assigned' && tab === 'assets' ? 'selected' : ''} onClick={() => { setTab('assets'); setLowStockOnly(false); setInStockOnly(false); setQuery(''); setCategoryFilter('All categories'); setAssignedFilter('All people'); setTagFilter('All tags'); setHealthFilter('All health'); setStatusFilter('Assigned') }}><Box size={18} /><span>Assigned</span><strong>{counts.assigned}</strong></button><button className={statusFilter === 'In Repair' && tab === 'assets' ? 'selected' : ''} onClick={() => { setTab('assets'); setLowStockOnly(false); setInStockOnly(false); setQuery(''); setCategoryFilter('All categories'); setAssignedFilter('All people'); setTagFilter('All tags'); setHealthFilter('All health'); setStatusFilter('In Repair') }}><Wrench size={18} /><span>In repair</span><strong>{counts.repair}</strong></button><button className={statusFilter === 'Warranty soon' && tab === 'assets' ? 'selected' : ''} onClick={() => { setTab('assets'); setLowStockOnly(false); setInStockOnly(false); setQuery(''); setCategoryFilter('All categories'); setAssignedFilter('All people'); setTagFilter('All tags'); setHealthFilter('All health'); setStatusFilter('Warranty soon') }}><Clock3 size={18} /><span>Warranty soon</span><strong>{counts.warranty}</strong></button><button className={tab === 'stock' && lowStockOnly ? 'selected' : ''} onClick={() => { setTab('stock'); setQuery(''); setTagFilter('All tags'); setInStockOnly(false); setLowStockOnly(true) }}><ShieldAlert size={18} /><span>Low stock</span><strong>{counts.low}</strong></button></section>
    <div className="inventory-browser-tabs">
      <div className="inventory-browser-tab-scroll" role="tablist" aria-label="Open inventory tabs">
        {workspace.tabs.map((item) => { const settings = item.id === workspace.activeId ? currentPane : item.settings; return <div className={'inventory-browser-tab' + (item.id === workspace.activeId ? ' active' : '')} key={item.id}><button role="tab" aria-selected={item.id === workspace.activeId} onClick={() => switchWorkspaceTab(item.id)} title={workspaceTabLabel(settings)}>{workspaceTabLabel(settings)}{(settings.query || settings.statusFilter !== 'All' || settings.categoryFilter !== 'All categories' || settings.assignedFilter !== 'All people' || settings.tagFilter !== 'All tags' || settings.healthFilter !== 'All health' || settings.starredOnly || settings.lowStockOnly || settings.inStockOnly) && <span className="inventory-tab-filter-dot" aria-label="Filtered" />}</button>{workspace.tabs.length > 1 && <button className="inventory-browser-tab-close" onClick={() => closeWorkspaceTab(item.id)} aria-label={`Close ${workspaceTabLabel(settings)} tab`} title="Close tab"><X size={12} /></button>}</div> })}
        <button className="inventory-browser-add" onClick={addWorkspaceTab} aria-label="New inventory tab" title="New inventory tab"><Plus size={16} /><span>New tab</span></button>
      </div>
      <SavedViews label="Inventory views" views={[inStockView, ...savedInventoryViews]} current={currentInventoryView} onApply={applyInventoryView} onReset={resetInventoryView} onSave={(view) => setSavedInventoryViews((items) => [...items, view])} onDelete={(id) => setSavedInventoryViews((items) => items.filter((view) => view.id !== id))} saveButtonLabel="Save tabs as view" saveDescription="Save all open inventory tabs, including each tab’s layout, search, and filters. Reopen the full set from Saved views." />
    </div>
    <div className="inventory-toolbar"><div className="inventory-tabs" role="tablist" aria-label="Inventory type"><button role="tab" aria-selected={tab === 'assets'} className={tab === 'assets' ? 'active' : ''} onClick={() => { setTab('assets'); setTagFilter('All tags'); setLowStockOnly(false); setInStockOnly(false) }}>Assets <span>{assets.length}</span></button><button role="tab" aria-selected={tab === 'stock'} className={tab === 'stock' ? 'active' : ''} onClick={() => { setTab('stock'); setLowStockOnly(false); setInStockOnly(false); setTagFilter('All tags') }}>Stock <span>{stock.length}</span></button></div><div className="inventory-controls"><label className="inventory-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'assets' ? 'Search ID, serial, person, tag…' : 'Search stock…'} aria-label="Search inventory" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</label>{tab === 'assets' && <><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter asset status"><option>All</option>{statuses.map((value) => <option key={value}>{value}</option>)}<option>Warranty soon</option></select><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter asset category"><option>All categories</option>{assetCategories.map((value) => <option key={value}>{value}</option>)}</select><select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)} aria-label="Filter assigned person"><option>All people</option><option>Unassigned</option>{assignedPeople.map((value) => <option key={value}>{value}</option>)}</select></>}{tab === 'stock' && <select value={inStockOnly ? 'In Stock' : lowStockOnly ? 'Low stock' : 'All stock'} onChange={(event) => { setInStockOnly(event.target.value === 'In Stock'); setLowStockOnly(event.target.value === 'Low stock') }} aria-label="Filter stock availability"><option>All stock</option><option>In Stock</option><option>Low stock</option></select>}<select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filter inventory tag"><option>All tags</option>{(tab === 'assets' ? assetTags : stockTags).map((value) => <option key={value}>{value}</option>)}</select>{tab === 'assets' && <><select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as typeof healthFilter)} aria-label="Filter device health" className="inventory-health-filter"><option>All health</option>{healthLevels.map((level) => <option key={level}>{level}</option>)}</select><div className="inventory-action1-sync"><button type="button" className="inventory-action1-sync-button" disabled={action1Syncing} onClick={syncHealthFromAction1} title="Demo only — pulls simulated health data, not a live Action1 connection"><span className={'inventory-action1-spinner' + (action1Syncing ? ' spinning' : '')} />{action1Syncing ? 'Syncing…' : 'Sync from Action1'}</button>{action1SyncError ? <span className="inventory-action1-sync-status error">{action1SyncError}</span> : action1LastSyncedAt ? <span className="inventory-action1-sync-status">Synced {action1LastSyncedAt.toLocaleTimeString()} (demo data)</span> : <span className="inventory-action1-sync-status muted">Not synced (demo)</span>}</div></>}<button className={'inventory-star-filter' + (starredOnly ? ' active' : '')} aria-pressed={starredOnly} onClick={() => setStarredOnly((value) => !value)}><Star size={14} fill={starredOnly ? 'currentColor' : 'none'} /> Starred</button></div></div>
    <div className="inventory-view-toolbar" aria-label="Inventory display views">
      <div className="inventory-view-buttons" role="group" aria-label="Inventory view">
        <button aria-pressed={viewMode === 'list'} className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
        <button aria-pressed={viewMode === 'cards'} className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')}>Cards</button>
        <button aria-pressed={viewMode === 'split'} className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')}>Split view</button>
      </div>
      <label className="inventory-more-views"><span>More views</span><select aria-label="More inventory views" value={viewMode === 'grouped' || viewMode === 'attention' ? viewMode : ''} onChange={(event) => setViewMode(event.target.value as InventoryViewMode)}><option value="">Choose a view…</option><option value="grouped">{tab === 'assets' ? 'By department' : 'By category'}</option><option value="attention">{tab === 'assets' ? 'Needs attention' : 'Stock levels'}</option></select></label>
      <span className="inventory-view-count">{tab === 'assets' ? filteredAssets.length : filteredStock.length} records</span>
    </div>
    {viewMode === 'list' && (tab === 'assets' ? <section className="inventory-list" aria-label="Asset list"><div className="inventory-list-caption"><b>Assets</b><span>{filteredAssets.length} of {assets.length} records</span><div className="device-health-legend" aria-label="Device health levels">{healthLevels.map((level) => <span key={level} className={healthClass(level)} title={healthDescriptions[level]}><i />{level}</span>)}</div></div><div className="inventory-table-scroll"><table className="inventory-table"><thead><tr><th>Asset ID</th><th>Item / model</th><th>Serial number</th><th>Status</th><th>Assigned to</th><th className="inventory-col-even">Device health</th><th className="inventory-col-even">Department</th><th className="inventory-col-even">Location</th><th>Warranty ends</th><th>Linked tickets</th></tr></thead><tbody>{filteredAssets.map((asset) => { const links = tickets.filter((ticket) => ticket.assetId === asset.id || asset.linkedTicketIds.includes(ticket.id)); return <tr key={asset.id}><td><div className="inventory-id-group"><button className={'inventory-star' + (asset.starred ? ' is-starred' : '')} onClick={() => toggleAssetStar(asset.id)} aria-label={`${asset.starred ? 'Remove star from' : 'Star'} ${asset.id}`} aria-pressed={asset.starred}><Star size={15} fill={asset.starred ? 'currentColor' : 'none'} /></button><button className="inventory-id" onClick={() => { setSelectedId(asset.id); setTicketToLink('') }}>{asset.id}</button></div></td><td><b>{asset.name}</b><small>{asset.manufacturer} {asset.model} · {asset.category}</small>{!!asset.tags?.length && <span className="inventory-row-tags">{asset.tags.slice(0, 2).join(' · ')}{asset.tags.length > 2 ? ` +${asset.tags.length - 2}` : ''}</span>}</td><td>{asset.serial}</td><td><span className={'inventory-status ' + asset.status.toLowerCase().replace(/\s+/g, '-')}>{asset.status}</span></td><td>{asset.assignedTo || <span className="inventory-muted">Not assigned</span>}</td><td className="inventory-col-even">{healthBadge(asset)}</td><td className="inventory-col-even">{asset.department || '—'}</td><td className="inventory-col-even">{asset.location || '—'}</td><td><span className={warrantySoon(asset) ? 'warranty-soon' : ''}>{dateLabel(asset.warrantyEnd)}</span></td><td>{links.length ? links.length + ' ticket' + (links.length === 1 ? '' : 's') : '—'}</td></tr> })}</tbody></table>{!filteredAssets.length && <div className="inventory-empty">No assets match these filters.</div>}</div></section> : <section className="inventory-list" aria-label="Stock list"><div className="inventory-list-caption"><b>Stock</b><span>{filteredStock.length} of {stock.length} records</span></div><div className="inventory-table-scroll"><table className="inventory-table stock-table"><thead><tr><th>Stock ID</th><th>Item</th><th>Category</th><th>On hand</th><th>Minimum</th><th>Location</th><th>Last updated</th></tr></thead><tbody>{filteredStock.map((item) => <tr key={item.sku}><td><div className="inventory-id-group"><button className={'inventory-star' + (item.starred ? ' is-starred' : '')} onClick={() => toggleStockStar(item.sku)} aria-label={`${item.starred ? 'Remove star from' : 'Star'} ${item.sku}`} aria-pressed={item.starred}><Star size={15} fill={item.starred ? 'currentColor' : 'none'} /></button><button className="inventory-id" onClick={() => { setSelectedSku(item.sku); setStockTagsText((item.tags || []).join(', ')); setStockChange({ amount: '', reason: '' }); setFormError('') }}>{item.sku}</button></div></td><td><b>{item.name}</b>{!!item.tags?.length && <span className="inventory-row-tags">{item.tags.slice(0, 2).join(' · ')}{item.tags.length > 2 ? ` +${item.tags.length - 2}` : ''}</span>}</td><td>{item.category}</td><td><span className={item.quantity <= item.minimum ? 'stock-low' : ''}>{item.quantity}</span></td><td>{item.minimum}</td><td>{item.location || '—'}</td><td>{stampLabel(item.updatedAt)}</td></tr>)}</tbody></table>{!filteredStock.length && <div className="inventory-empty">No stock items match this search.</div>}</div></section>)}
    {viewMode === 'cards' && <section className="inventory-view-grid" aria-label={tab === 'assets' ? 'Asset cards' : 'Stock cards'}>{tab === 'assets' ? filteredAssets.map(assetCard) : filteredStock.map(stockCard)}{(tab === 'assets' ? !filteredAssets.length : !filteredStock.length) && <div className="inventory-empty">No records match these filters.</div>}</section>}
    {viewMode === 'split' && <>
      <div className="inventory-split-options" aria-label="Inventory split layout">
        <strong>Split layout</strong>
        <label>Left view<select value={splitLeft} onChange={(event) => setSplitLeft(event.target.value as InventorySplitPaneMode)} aria-label="Choose left inventory view"><option value="list">List</option><option value="details">Details</option><option value="cards">Cards</option><option value="grouped">{tab === 'assets' ? 'By department' : 'By category'}</option><option value="attention">{tab === 'assets' ? 'Needs attention' : 'Stock levels'}</option></select></label>
        <label>Right view<select value={splitRight} onChange={(event) => setSplitRight(event.target.value as InventorySplitPaneMode)} aria-label="Choose right inventory view"><option value="list">List</option><option value="details">Details</option><option value="cards">Cards</option><option value="grouped">{tab === 'assets' ? 'By department' : 'By category'}</option><option value="attention">{tab === 'assets' ? 'Needs attention' : 'Stock levels'}</option></select></label>
        <button type="button" onClick={() => { setSplitLeft(splitRight); setSplitRight(splitLeft) }}><RotateCcw size={13} /> Swap sides</button>
      </div>
      <section className="inventory-split" aria-label="Inventory split view">
        <div className="inventory-split-pane"><div className="inventory-split-pane-heading">Left · {splitPaneLabel(splitLeft)}</div>{renderSplitPane(splitLeft)}</div>
        <div className="inventory-split-pane"><div className="inventory-split-pane-heading">Right · {splitPaneLabel(splitRight)}</div>{renderSplitPane(splitRight)}</div>
      </section>
    </>}
    {viewMode === 'grouped' && <section className="inventory-grouped" aria-label={tab === 'assets' ? 'Assets by department' : 'Stock by category'}>{tab === 'assets' ? assetGroups.map((group) => <div className="inventory-view-group" key={group}><header><h2>{group}</h2><span>{filteredAssets.filter((asset) => (asset.department || 'No department') === group).length} assets</span></header>{filteredAssets.filter((asset) => (asset.department || 'No department') === group).map(assetRow)}</div>) : stockGroups.map((group) => <div className="inventory-view-group" key={group}><header><h2>{group}</h2><span>{filteredStock.filter((item) => (item.category || 'Uncategorized') === group).length} items</span></header>{filteredStock.filter((item) => (item.category || 'Uncategorized') === group).map(stockRow)}</div>)}{(tab === 'assets' ? !assetGroups.length : !stockGroups.length) && <div className="inventory-empty">No records match these filters.</div>}</section>}
    {viewMode === 'attention' && <section className="inventory-grouped" aria-label={tab === 'assets' ? 'Assets needing attention' : 'Stock levels'}>{tab === 'assets' ? ([['In repair', filteredAssets.filter((asset) => asset.status === 'In Repair')], ['Warranty soon', filteredAssets.filter(warrantySoon)], ['Lost', filteredAssets.filter((asset) => asset.status === 'Lost')]] as [string, AssetItem[]][]).map(([label, items]) => <div className="inventory-view-group" key={label}><header><h2>{label}</h2><span>{items.length} assets</span></header>{items.length ? items.map(assetRow) : <p className="inventory-group-empty">No assets in this category.</p>}</div>) : ([['Out of stock', filteredStock.filter((item) => item.quantity === 0)], ['Low stock', filteredStock.filter((item) => item.quantity > 0 && item.quantity <= item.minimum)], ['In stock', filteredStock.filter((item) => item.quantity > item.minimum)]] as [string, StockItem[]][]).map(([label, items]) => <div className="inventory-view-group" key={label}><header><h2>{label}</h2><span>{items.length} items</span></header>{items.length ? items.map(stockRow) : <p className="inventory-group-empty">No items in this category.</p>}</div>)}</section>}
    <p className="inventory-footnote">Asset assignments and stock changes are recorded in this browser. This prototype is not connected to a shared inventory system.</p>

    {selected && <Overlay className="inventory-overlay" onClose={() => { setSelectedId(''); setAction('') }}><section className="inventory-detail-panel" role="dialog" aria-modal="true" aria-labelledby="asset-detail-title"><header className="inventory-detail-header"><div><span className="eyebrow">ASSET RECORD · {selected.id}</span><h2 id="asset-detail-title">{selected.name}</h2><p>{selected.manufacturer} {selected.model} · {selected.serial}</p></div><div className="inventory-header-actions"><button className={'inventory-star' + (selected.starred ? ' is-starred' : '')} onClick={() => toggleAssetStar(selected.id)} aria-label={`${selected.starred ? 'Remove star from' : 'Star'} ${selected.id}`} aria-pressed={selected.starred}><Star size={20} fill={selected.starred ? 'currentColor' : 'none'} /></button><button className="close-button" onClick={() => { setSelectedId(''); setAction('') }} aria-label="Close asset details"><X size={19} /></button></div></header><div className="inventory-detail-body"><div className="inventory-status-row"><span className={'inventory-status ' + selected.status.toLowerCase().replace(/\s+/g, '-')}>{selected.status}</span>{healthBadge(selected)}<span>{selected.category}</span><span>{selected.condition} condition</span></div><div className="inventory-detail-actions"><button onClick={() => openAction('assign')} disabled={selected.status === 'Retired'}><Box size={14} /> Assign</button>{selected.status === 'Assigned' && <button onClick={() => openAction('return')}><RotateCcw size={14} /> Return</button>}<button onClick={() => openAction('repair')} disabled={selected.status === 'Retired'}><Wrench size={14} /> Send for repair</button><button onClick={() => openAction('move')}><ArrowRight size={14} /> Move</button><button onClick={() => { setSelectedId(''); createTicket(selected) }}><Plus size={14} /> Create ticket</button><button onClick={openEdit}><Pencil size={14} /> Edit details</button></div><section className="inventory-detail-section"><h3>Current assignment</h3><div className="inventory-detail-grid"><div><span>Assigned to</span><b>{selected.assignedTo || 'Not assigned'}</b></div><div><span>Department</span><b>{selected.department || 'Not recorded'}</b></div><div><span>Assigned date</span><b>{dateLabel(selected.assignedAt)}</b></div><div><span>Expected return</span><b>{dateLabel(selected.expectedReturnAt)}</b></div><div><span>Issued by</span><b>{selected.issuedBy || 'Not recorded'}</b></div><div><span>Location</span><b>{selected.location || 'Not recorded'}</b></div></div></section><section className="inventory-detail-section"><h3>Asset information</h3><div className="inventory-detail-grid"><div><span>Asset ID</span><b>{selected.id}</b></div><div><span>Serial number</span><b>{selected.serial}</b></div><div><span>Purchase date</span><b>{dateLabel(selected.purchaseDate)}</b></div><div><span>Warranty ends</span><b className={warrantySoon(selected) ? 'warranty-soon' : ''}>{dateLabel(selected.warrantyEnd)}</b></div></div>{!!selected.tags?.length && <div className="inventory-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}{selected.notes && <p className="inventory-detail-note">{selected.notes}</p>}</section><section className="inventory-detail-section"><h3>Linked tickets <span>{relatedTickets.length}</span></h3>{relatedTickets.length ? <div className="inventory-linked-tickets">{relatedTickets.map((ticket) => <button key={ticket.id} onClick={() => { setSelectedId(''); openTicket(ticket.id) }}><Link2 size={14} /><b>{ticket.id}</b><span>{ticket.title}</span><small>{ticket.status}</small><ArrowRight size={13} /></button>)}</div> : <p className="inventory-muted">No tickets linked yet.</p>}<div className="inventory-link-form"><select value={ticketToLink} onChange={(event) => setTicketToLink(event.target.value)} aria-label="Choose ticket to link"><option value="">Choose a ticket…</option>{tickets.filter((ticket) => !relatedTickets.some((related) => related.id === ticket.id)).map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.id} · {ticket.title}</option>)}</select><button onClick={addTicketLink} disabled={!ticketToLink}>Link ticket</button></div></section><section className="inventory-detail-section"><h3>History <span>{selected.history?.length || 0}</span></h3><div className="inventory-history">{[...(selected.history || [])].reverse().map((event, index) => <div key={event.at + index}><time>{stampLabel(event.at)}</time><b>{event.action}</b><p>{event.detail}</p></div>)}</div></section><div className="inventory-secondary-actions"><button onClick={() => openAction('lost')} disabled={selected.status === 'Lost' || selected.status === 'Retired'}>Mark lost</button><button onClick={() => openAction('retire')} disabled={selected.status === 'Retired'}><Trash2 size={13} /> Retire asset</button></div></div></section></Overlay>}

    {selected && action && <Overlay className="inventory-action-overlay" onClose={() => setAction('')}><section className="inventory-action-panel" role="dialog" aria-modal="true" aria-labelledby="asset-action-title"><header><div><span className="eyebrow">{selected.id}</span><h2 id="asset-action-title">{action === 'assign' ? 'Assign asset' : action === 'return' ? 'Return asset' : action === 'repair' ? 'Send for repair' : action === 'move' ? 'Move asset' : action === 'retire' ? 'Retire asset' : 'Mark asset lost'}</h2></div><button className="close-button" onClick={() => setAction('')} aria-label="Close action"><X size={18} /></button></header><div className="inventory-action-fields">{action === 'assign' && <><label>Assigned to <em>*</em><input value={actionForm.person} onChange={(event) => setActionForm({ ...actionForm, person: event.target.value })} placeholder="Person receiving the asset" /></label><label>Issued by <em>*</em><input value={actionForm.issuedBy} onChange={(event) => setActionForm({ ...actionForm, issuedBy: event.target.value })} placeholder="Service desk person" /></label><label>Department<select value={actionForm.department} onChange={(event) => setActionForm({ ...actionForm, department: event.target.value })}>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label>Expected return<input type="date" value={actionForm.expectedReturn} onChange={(event) => setActionForm({ ...actionForm, expectedReturn: event.target.value })} /></label></>}{(action === 'assign' || action === 'return' || action === 'repair' || action === 'move') && <label>Location <em>*</em><input value={actionForm.location} onChange={(event) => setActionForm({ ...actionForm, location: event.target.value })} placeholder="Office, floor, storage room…" /></label>}{(action === 'assign' || action === 'return') && <label>Condition<select value={actionForm.condition} onChange={(event) => setActionForm({ ...actionForm, condition: event.target.value as AssetItem['condition'] })}><option>Good</option><option>Fair</option><option>Damaged</option></select></label>}{action === 'return' && <label>After return<select value={actionForm.returnStatus} onChange={(event) => setActionForm({ ...actionForm, returnStatus: event.target.value as 'Available' | 'In Repair' })}><option>Available</option><option>In Repair</option></select></label>}<label>{action === 'retire' || action === 'lost' ? 'Reason *' : 'Notes'}<textarea rows={3} value={actionForm.note} onChange={(event) => setActionForm({ ...actionForm, note: event.target.value })} placeholder="Add context to the asset history" /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<footer><button className="text-button" onClick={() => setAction('')}>Cancel</button><button className="primary-button" onClick={applyAction}>Save change</button></footer></section></Overlay>}

    {selected && showEditAsset && <Overlay className="inventory-create-overlay inventory-edit-overlay" onClose={() => setShowEditAsset(false)}><section className="inventory-create-panel" role="dialog" aria-modal="true" aria-labelledby="edit-asset-title"><header className="inventory-detail-header"><div><span className="eyebrow">ASSET RECORD · {selected.id}</span><h2 id="edit-asset-title">Edit asset details</h2><p>Updates are added to the asset history.</p></div><button className="close-button" onClick={() => setShowEditAsset(false)} aria-label="Close edit asset"><X size={19} /></button></header><div className="inventory-create-grid"><label>Item name <em>*</em><input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label><label>Category<select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}>{[...new Set([...categories, editForm.category])].map((item) => <option key={item}>{item}</option>)}</select></label><label>Serial number <em>*</em><input value={editForm.serial} onChange={(event) => setEditForm({ ...editForm, serial: event.target.value })} /></label><label>Manufacturer<input value={editForm.manufacturer} onChange={(event) => setEditForm({ ...editForm, manufacturer: event.target.value })} /></label><label>Model<input value={editForm.model} onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} /></label><label>Department<select value={editForm.department} onChange={(event) => setEditForm({ ...editForm, department: event.target.value })}>{[...new Set([...departments, editForm.department])].map((item) => <option key={item}>{item}</option>)}</select></label><label>Location<input value={editForm.location} onChange={(event) => setEditForm({ ...editForm, location: event.target.value })} /></label><label>Purchase date<input type="date" value={editForm.purchaseDate} onChange={(event) => setEditForm({ ...editForm, purchaseDate: event.target.value })} /></label><label>Warranty ends<input type="date" value={editForm.warrantyEnd} onChange={(event) => setEditForm({ ...editForm, warrantyEnd: event.target.value })} /></label><label>Condition<select value={editForm.condition} onChange={(event) => setEditForm({ ...editForm, condition: event.target.value as AssetItem['condition'] })}><option>Good</option><option>Fair</option><option>Damaged</option></select></label><label>Device health<select value={editForm.health} onChange={(event) => setEditForm({ ...editForm, health: event.target.value as DeviceHealth })}>{deviceHealthOptions.map((level) => <option key={level}>{level}</option>)}</select></label><label className="wide">Tags <small>Separate with commas</small><input value={editForm.tagsText} onChange={(event) => setEditForm({ ...editForm, tagsText: event.target.value })} placeholder="Loaner, encrypted, shared…" /></label><label className="wide">Notes<textarea rows={2} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<footer><button className="text-button" onClick={() => setShowEditAsset(false)}>Cancel</button><button className="primary-button" onClick={saveEdit}>Save details</button></footer></section></Overlay>}

    {stockSelected && <Overlay className="inventory-overlay" onClose={() => setSelectedSku('')}><section className="inventory-detail-panel stock-detail-panel" role="dialog" aria-modal="true" aria-labelledby="stock-detail-title"><header className="inventory-detail-header"><div><span className="eyebrow">STOCK RECORD · {stockSelected.sku}</span><h2 id="stock-detail-title">{stockSelected.name}</h2><p>{stockSelected.category} · {stockSelected.location}</p></div><div className="inventory-header-actions"><button className={'inventory-star' + (stockSelected.starred ? ' is-starred' : '')} onClick={() => toggleStockStar(stockSelected.sku)} aria-label={`${stockSelected.starred ? 'Remove star from' : 'Star'} ${stockSelected.sku}`} aria-pressed={stockSelected.starred}><Star size={20} fill={stockSelected.starred ? 'currentColor' : 'none'} /></button><button className="close-button" onClick={() => setSelectedSku('')} aria-label="Close stock details"><X size={19} /></button></div></header><div className="inventory-detail-body"><div className="stock-balance"><strong>{stockSelected.quantity}</strong><span>on hand</span><small>Minimum {stockSelected.minimum}</small></div>{stockSelected.quantity <= stockSelected.minimum && <p className="stock-warning">At or below the minimum quantity. Consider replenishment.</p>}<section className="inventory-detail-section"><h3>Tags</h3><div className="inventory-tags">{(stockSelected.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="stock-tags-editor"><input value={stockTagsText} onChange={(event) => setStockTagsText(event.target.value)} placeholder="Comma-separated tags" aria-label="Stock tags" /><button onClick={saveStockTags} disabled={stockTagsText === (stockSelected.tags || []).join(', ')}>Save tags</button></div></section><section className="inventory-detail-section"><h3>Adjust stock</h3><p className="inventory-muted">Use a positive number when receiving stock or a negative number when issuing it.</p><div className="stock-adjust-fields"><label>Quantity change<input type="number" step="1" value={stockChange.amount} onChange={(event) => setStockChange({ ...stockChange, amount: event.target.value })} placeholder="For example, -2 or 10" /></label><label>Reason<input value={stockChange.reason} onChange={(event) => setStockChange({ ...stockChange, reason: event.target.value })} placeholder="Issued to team, delivery received…" /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<button className="primary-button stock-save" onClick={adjustStock}>Save adjustment</button></section><section className="inventory-detail-section"><h3>Stock history</h3><div className="inventory-history">{[...(stockSelected.history || [])].reverse().map((event, index) => <div key={event.at + index}><time>{stampLabel(event.at)}</time><b>{event.action}</b><p>{event.detail}</p></div>)}</div></section></div></section></Overlay>}

    {showAddAsset && <Overlay className="inventory-create-overlay" onClose={() => setShowAddAsset(false)}><section className="inventory-create-panel" role="dialog" aria-modal="true" aria-labelledby="add-asset-title"><header className="inventory-detail-header"><div><span className="eyebrow">NEW INVENTORY RECORD</span><h2 id="add-asset-title">Add asset</h2><p>Individual items have their own serial number and assignment history.</p></div><button className="close-button" onClick={() => setShowAddAsset(false)} aria-label="Close add asset"><X size={19} /></button></header><div className="inventory-create-grid"><label>Asset ID <small>Optional</small><input value={assetForm.id} onChange={(event) => setAssetForm({ ...assetForm, id: event.target.value })} placeholder="Auto-assigned if blank" /></label><label>Item name <em>*</em><input value={assetForm.name} onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })} placeholder="Latitude 7450 laptop" /></label><label>Category<select value={assetForm.category} onChange={(event) => setAssetForm({ ...assetForm, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Serial number <em>*</em><input value={assetForm.serial} onChange={(event) => setAssetForm({ ...assetForm, serial: event.target.value })} placeholder="Unique device serial" /></label><label>Manufacturer<input value={assetForm.manufacturer} onChange={(event) => setAssetForm({ ...assetForm, manufacturer: event.target.value })} /></label><label>Model<input value={assetForm.model} onChange={(event) => setAssetForm({ ...assetForm, model: event.target.value })} /></label><label>Department<select value={assetForm.department} onChange={(event) => setAssetForm({ ...assetForm, department: event.target.value })}>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label>Location<input value={assetForm.location} onChange={(event) => setAssetForm({ ...assetForm, location: event.target.value })} placeholder="Tokyo · IT storage" /></label><label>Purchase date<input type="date" value={assetForm.purchaseDate} onChange={(event) => setAssetForm({ ...assetForm, purchaseDate: event.target.value })} /></label><label>Warranty ends<input type="date" value={assetForm.warrantyEnd} onChange={(event) => setAssetForm({ ...assetForm, warrantyEnd: event.target.value })} /></label><label>Condition<select value={assetForm.condition} onChange={(event) => setAssetForm({ ...assetForm, condition: event.target.value as AssetItem['condition'] })}><option>Good</option><option>Fair</option><option>Damaged</option></select></label><label>Device health<select value={assetForm.health} onChange={(event) => setAssetForm({ ...assetForm, health: event.target.value as DeviceHealth })}>{deviceHealthOptions.map((level) => <option key={level}>{level}</option>)}</select></label><label className="wide">Tags <small>Separate with commas</small><input value={assetForm.tagsText} onChange={(event) => setAssetForm({ ...assetForm, tagsText: event.target.value })} placeholder="Loaner, encrypted, shared…" /></label><label className="wide">Notes<textarea rows={2} value={assetForm.notes} onChange={(event) => setAssetForm({ ...assetForm, notes: event.target.value })} /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<footer><button className="text-button" onClick={() => setShowAddAsset(false)}>Cancel</button><button className="primary-button" onClick={addAsset}>Add asset</button></footer></section></Overlay>}

    {showAddStock && <Overlay className="inventory-create-overlay" onClose={() => setShowAddStock(false)}><section className="inventory-create-panel stock-create-panel" role="dialog" aria-modal="true" aria-labelledby="add-stock-title"><header className="inventory-detail-header"><div><span className="eyebrow">NEW STOCK RECORD</span><h2 id="add-stock-title">Add stock item</h2><p>Use one record for supplies tracked by quantity.</p></div><button className="close-button" onClick={() => setShowAddStock(false)} aria-label="Close add stock"><X size={19} /></button></header><div className="inventory-create-grid"><label>Stock ID <small>Optional</small><input value={stockForm.sku} onChange={(event) => setStockForm({ ...stockForm, sku: event.target.value })} placeholder="Auto-assigned if blank" /></label><label>Item name <em>*</em><input value={stockForm.name} onChange={(event) => setStockForm({ ...stockForm, name: event.target.value })} placeholder="USB-C cable" /></label><label>Category<input value={stockForm.category} onChange={(event) => setStockForm({ ...stockForm, category: event.target.value })} /></label><label>Location<input value={stockForm.location} onChange={(event) => setStockForm({ ...stockForm, location: event.target.value })} /></label><label className="wide">Tags <small>Separate with commas</small><input value={stockForm.tagsText} onChange={(event) => setStockForm({ ...stockForm, tagsText: event.target.value })} placeholder="Cable, spare…" /></label><label>Starting quantity<input type="number" min="0" step="1" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} /></label><label>Minimum quantity<input type="number" min="0" step="1" value={stockForm.minimum} onChange={(event) => setStockForm({ ...stockForm, minimum: event.target.value })} /></label></div>{formError && <div className="form-error" role="alert">{formError}</div>}<footer><button className="text-button" onClick={() => setShowAddStock(false)}>Cancel</button><button className="primary-button" onClick={addStock}>Add stock item</button></footer></section></Overlay>}
  </main>
}

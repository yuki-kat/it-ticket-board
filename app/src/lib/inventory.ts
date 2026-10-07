import type { SavedView } from '../components/SavedViews'
import { exportCsv, type CsvValue } from './exportCsv'
import { exportXlsxWorkbook } from './exportXlsx'

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
export type InventoryViewMode = 'list' | 'cards' | 'split' | 'grouped' | 'attention'
export type InventorySplitPaneMode = Exclude<InventoryViewMode, 'split'> | 'details'
export type InventoryPaneSettings = { tab: 'assets' | 'stock'; viewMode: InventoryViewMode; splitLeft: InventorySplitPaneMode; splitRight: InventorySplitPaneMode; query: string; statusFilter: 'All' | AssetStatus | 'Warranty soon'; categoryFilter: string; assignedFilter: string; tagFilter: string; healthFilter: 'All health' | HealthLevel; starredOnly: boolean; lowStockOnly: boolean; inStockOnly: boolean }
export type InventoryWorkspaceTab = { id: string; settings: InventoryPaneSettings }
export type InventoryViewSettings = InventoryPaneSettings & { workspaceTabs?: InventoryWorkspaceTab[]; activeWorkspaceId?: string }
export type InventoryWorkspace = { tabs: InventoryWorkspaceTab[]; activeId: string }

export type InventoryProps = {
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

export const ASSET_KEY = 'it-ticket-kanban-assets-v1'
export const STOCK_KEY = 'it-ticket-kanban-stock-v1'
export const SAVED_INVENTORY_VIEWS_KEY = 'it-ticket-kanban-inventory-saved-views-v1'
export const INVENTORY_VIEW_MODE_KEY = 'it-ticket-kanban-inventory-view-mode-v1'
export const INVENTORY_WORKSPACE_KEY = 'it-ticket-kanban-inventory-workspace-v1'
export const inventoryViewModes: InventoryViewMode[] = ['list', 'cards', 'split', 'grouped', 'attention']
export const inventorySplitPaneModes: InventorySplitPaneMode[] = ['list', 'details', 'cards', 'grouped', 'attention']
export const newWorkspaceId = () => `inventory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
export const defaultPaneSettings = (tab: 'assets' | 'stock' = 'assets'): InventoryPaneSettings => ({ tab, viewMode: 'list', splitLeft: 'list', splitRight: 'details', query: '', statusFilter: 'All', categoryFilter: 'All categories', assignedFilter: 'All people', tagFilter: 'All tags', healthFilter: 'All health', starredOnly: false, lowStockOnly: false, inStockOnly: false })
export function normalizeInventoryPane(value: Partial<InventoryPaneSettings>): InventoryPaneSettings {
  return { ...defaultPaneSettings(), ...value, tab: value.tab === 'stock' ? 'stock' : 'assets', healthFilter: healthLevels.includes(value.healthFilter as HealthLevel) ? value.healthFilter as HealthLevel : 'All health', viewMode: inventoryViewModes.includes(value.viewMode as InventoryViewMode) ? value.viewMode as InventoryViewMode : 'list', splitLeft: inventorySplitPaneModes.includes(value.splitLeft as InventorySplitPaneMode) ? value.splitLeft as InventorySplitPaneMode : 'list', splitRight: inventorySplitPaneModes.includes(value.splitRight as InventorySplitPaneMode) ? value.splitRight as InventorySplitPaneMode : 'details', inStockOnly: Boolean(value.inStockOnly) }
}
export function loadInventoryWorkspace(): InventoryWorkspace {
  try {
    const saved = JSON.parse(localStorage.getItem(INVENTORY_WORKSPACE_KEY) || 'null')
    const tabs: InventoryWorkspaceTab[] = Array.isArray(saved?.tabs) ? saved.tabs.filter((item: unknown): item is InventoryWorkspaceTab => !!item && typeof item === 'object' && typeof (item as InventoryWorkspaceTab).id === 'string' && !!(item as InventoryWorkspaceTab).settings && typeof (item as InventoryWorkspaceTab).settings === 'object').map((item: InventoryWorkspaceTab) => ({ id: item.id, settings: normalizeInventoryPane(item.settings) })) : []
    if (tabs.length) return { tabs, activeId: tabs.some((item) => item.id === saved.activeId) ? saved.activeId : tabs[0].id }
  } catch { /* Fall back to one tab. */ }
  const id = newWorkspaceId()
  return { tabs: [{ id, settings: defaultPaneSettings() }], activeId: id }
}
export function normalizeSavedInventoryView(view: SavedView<InventoryViewSettings>): SavedView<InventoryViewSettings> {
  const pane = normalizeInventoryPane(view.settings)
  const tabs = Array.isArray(view.settings.workspaceTabs) && view.settings.workspaceTabs.length ? view.settings.workspaceTabs.map((item) => ({ id: item.id, settings: normalizeInventoryPane(item.settings) })) : [{ id: `saved-${view.id}`, settings: pane }]
  const activeId = tabs.some((item) => item.id === view.settings.activeWorkspaceId) ? view.settings.activeWorkspaceId : tabs[0].id
  return { ...view, settings: { ...pane, workspaceTabs: tabs, activeWorkspaceId: activeId } }
}
export const inStockPane: InventoryPaneSettings = { ...defaultPaneSettings('stock'), inStockOnly: true }
export const inStockView: SavedView<InventoryViewSettings> = { id: 'built-in-in-stock', name: 'In Stock', builtIn: true, settings: { ...inStockPane, workspaceTabs: [{ id: 'built-in-in-stock-tab', settings: inStockPane }], activeWorkspaceId: 'built-in-in-stock-tab' } }
export const statuses: AssetStatus[] = ['Available', 'Assigned', 'In Repair', 'Retired', 'Lost']
export const deviceHealthOptions: DeviceHealth[] = ['Healthy', 'At Risk', 'Critical']
export const healthLevels: HealthLevel[] = ['Healthy', 'Monitor', 'At Risk', 'Critical']
export const healthDescriptions: Record<HealthLevel, string> = { Healthy: 'Device is operating normally', Monitor: 'Device is healthy but needs observation', 'At Risk': 'Device needs service attention', Critical: 'Device is offline, lost, or severely impaired' }
export const healthClass = (level: HealthLevel) => level.toLowerCase().replace(/\s+/g, '-')
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
export function mockAction1HealthCheck(items: AssetItem[]): Promise<{ serial: string; health: DeviceHealth }[]> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(items.map((asset) => {
      const roll = Math.random()
      return { serial: asset.serial, health: roll < 0.72 ? 'Healthy' : roll < 0.9 ? 'At Risk' : 'Critical' }
    })), 900 + 700 * Math.random())
  })
}
export const categories = ['Laptop', 'Desktop', 'Monitor', 'Phone', 'Tablet', 'Network', 'Peripheral', 'Other']
export const departments = ['Field Services', 'Finance', 'People & HR', 'Facilities', 'Platform Engineering', 'Commerce', 'Customer Care', 'Data & Analytics', 'Security']
export const dateOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value + (value.length === 10 ? 'T12:00:00' : ''))) : 'Not recorded'
export const stampLabel = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
export const assetCode = (value: string) => value.trim().toUpperCase()
export const parseTags = (value: string) => [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)

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

export const emptyAsset = { id: '', name: '', category: 'Laptop', manufacturer: '', model: '', serial: '', department: 'Field Services', location: '', purchaseDate: '', warrantyEnd: '', condition: 'Good' as AssetItem['condition'], health: 'Healthy' as DeviceHealth, notes: '', tagsText: '' }
export const emptyStock = { sku: '', name: '', category: 'Cable', quantity: '0', minimum: '0', location: '', tagsText: '' }

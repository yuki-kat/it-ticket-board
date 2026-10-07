import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSavedViews, type SavedView } from '../components/SavedViews'
import {
  type AssetItem, type AssetStatus, type HealthLevel, type InventoryPaneSettings,
  type InventoryProps, type InventoryViewMode, type InventoryViewSettings, type InventoryWorkspace,
  type InventoryWorkspaceTab, type InventorySplitPaneMode, type StockItem,
  ASSET_EXPORT_HEADERS, SAVED_INVENTORY_VIEWS_KEY, STOCK_EXPORT_HEADERS, INVENTORY_VIEW_MODE_KEY,
  INVENTORY_WORKSPACE_KEY, assetCode, assetExportRows, assetHealthLevel,
  defaultPaneSettings, emptyAsset, emptyStock, healthLevels, inStockView, inventorySplitPaneModes,
  inventoryViewModes, isWarrantySoon, loadInventoryWorkspace, mockAction1HealthCheck, newWorkspaceId,
  normalizeSavedInventoryView, parseTags, statuses, stockExportRows, dateLabel,
} from '../lib/inventory'
import { exportCsv } from '../lib/exportCsv'
import { exportXlsx } from '../lib/exportXlsx'

/**
 * Owns every piece of UI state, derived data, and mutation handler for the Inventory page
 * (search/filter/view-mode state, workspace tabs, saved views, asset/stock forms, Action1
 * health sync, ticket linking). Returns a single "view model" object that `InventoryView`
 * renders from as plain props — this hook is the "container" half of the container/
 * presentational split; `InventoryView` is the "presentational" half.
 */
export function useInventoryContainer({ focusId = '', focusRevision = 0, command, onCommandHandled, assets, stock, updateAssets, updateStock, tickets, openTicket, linkTicket, createTicket }: InventoryProps) {
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
  const [tableFilters, setTableFilters] = useState({ id: '', name: '', serial: '', status: '', assignedTo: '', location: '' })
  const setTableFilter = (key: keyof typeof tableFilters, value: string) => setTableFilters((current) => ({ ...current, [key]: value }))
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
  const counts = { available: assets.filter((asset) => asset.status === 'Available').length, assigned: assets.filter((asset) => asset.status === 'Assigned').length, repair: assets.filter((asset) => asset.status === 'In Repair').length, warranty: assets.filter(warrantySoon).length, low: stock.filter((item) => item.quantity <= item.minimum).length }
  const assetCategories = useMemo(() => [...new Set(assets.map((asset) => asset.category))].sort(), [assets])
  const assignedPeople = useMemo(() => [...new Set(assets.map((asset) => asset.assignedTo).filter(Boolean))].sort(), [assets])
  const assetTags = useMemo(() => [...new Set(assets.flatMap((asset) => asset.tags || []))].sort(), [assets])
  const stockTags = useMemo(() => [...new Set(stock.flatMap((item) => item.tags || []))].sort(), [stock])
  const [tagFilter, setTagFilter] = useState('All tags')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false)
      }
    }
    if (showFilterDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown])
  const filteredAssets = useMemo(() => assets.filter((asset) => {
    const text = [asset.id, asset.name, asset.category, asset.manufacturer, asset.model, asset.serial, asset.assignedTo, asset.department, asset.location, ...(asset.tags || []), ...asset.linkedTicketIds].join(' ').toLowerCase()
    return text.includes(query.toLowerCase()) && (statusFilter === 'All' || statusFilter === 'Warranty soon' ? statusFilter !== 'Warranty soon' || warrantySoon(asset) : asset.status === statusFilter) && (categoryFilter === 'All categories' || asset.category === categoryFilter) && (assignedFilter === 'All people' || (assignedFilter === 'Unassigned' ? !asset.assignedTo : asset.assignedTo === assignedFilter)) && (tagFilter === 'All tags' || (asset.tags || []).includes(tagFilter)) && (healthFilter === 'All health' || healthLevel(asset) === healthFilter) && (!starredOnly || asset.starred) && asset.id.toLowerCase().includes(tableFilters.id.toLowerCase()) && asset.name.toLowerCase().includes(tableFilters.name.toLowerCase()) && asset.serial.toLowerCase().includes(tableFilters.serial.toLowerCase()) && (!tableFilters.status || asset.status === tableFilters.status) && (asset.assignedTo || 'Unassigned').toLowerCase().includes(tableFilters.assignedTo.toLowerCase()) && (asset.location || '').toLowerCase().includes(tableFilters.location.toLowerCase())
  }), [assets, query, statusFilter, categoryFilter, assignedFilter, tagFilter, healthFilter, starredOnly, tableFilters])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!workspaceReady) return
    localStorage.setItem(INVENTORY_WORKSPACE_KEY, JSON.stringify({ tabs: workspace.tabs.map((item) => item.id === workspace.activeId ? { ...item, settings: currentPane } : item), activeId: workspace.activeId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const assetGroups = [...new Set(filteredAssets.map((asset) => asset.department || 'No department'))].sort()
  const stockGroups = [...new Set(filteredStock.map((item) => item.category || 'Uncategorized'))].sort()
  const chooseSplitAsset = (asset: AssetItem) => { setSplitAssetId(asset.id); if (splitLeft !== 'details' && splitRight !== 'details') openAssetRecord(asset) }
  const chooseSplitStock = (item: StockItem) => { setSplitStockSku(item.sku); if (splitLeft !== 'details' && splitRight !== 'details') openStockRecord(item) }

  return {
    // pass-through data from props
    assets, stock, tickets, openTicket, createTicket,
    // tab / workspace
    tab, setTab, workspace, switchWorkspaceTab, addWorkspaceTab, closeWorkspaceTab,
    savedInventoryViews, setSavedInventoryViews, currentInventoryView, applyInventoryView, resetInventoryView,
    // view mode / split layout
    viewMode, setViewMode, splitLeft, setSplitLeft, splitRight, setSplitRight, splitAsset, splitStock,
    chooseSplitAsset, chooseSplitStock,
    // filters / search
    query, setQuery, statusFilter, setStatusFilter, categoryFilter, setCategoryFilter, assignedFilter, setAssignedFilter,
    tagFilter, setTagFilter, healthFilter, setHealthFilter, starredOnly, setStarredOnly, lowStockOnly, setLowStockOnly,
    inStockOnly, setInStockOnly, tableFilters, setTableFilter, showFilterDropdown, setShowFilterDropdown, filterDropdownRef,
    assetCategories, assignedPeople, assetTags, stockTags, filteredAssets, filteredStock, assetGroups, stockGroups,
    // selection / detail panel
    selected, stockSelected, selectedId, setSelectedId, selectedSku, setSelectedSku,
    relatedTickets, openAssetRecord, openStockRecord,
    // asset actions (assign/return/repair/move/retire/lost)
    action, setAction, actionForm, setActionForm, openAction, applyAction,
    // asset edit
    showEditAsset, setShowEditAsset, editForm, setEditForm, openEdit, saveEdit,
    // add asset / add stock
    showAddAsset, setShowAddAsset, showAddStock, setShowAddStock, assetForm, setAssetForm, stockForm, setStockForm,
    addAsset, addStock,
    // stock detail (tags / adjust)
    stockTagsText, setStockTagsText, saveStockTags, stockChange, setStockChange, adjustStock,
    // ticket linking
    ticketToLink, setTicketToLink, addTicketLink,
    // stars
    toggleAssetStar, toggleStockStar,
    // Action1 demo sync
    action1Syncing, action1LastSyncedAt, action1SyncError, syncHealthFromAction1,
    // misc
    counts, today, formError, setFormError, exportCurrentInventory, currentPane,
  }
}

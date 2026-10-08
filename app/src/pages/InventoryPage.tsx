export {
  type AssetStatus, type DeviceHealth, type HealthLevel, type AssetEvent, type AssetItem,
  type StockItem, type TicketReference, type InventoryCommand,
  normalizeHealth, isWarrantySoon, assetHealthLevel, ASSET_EXPORT_HEADERS, STOCK_EXPORT_HEADERS,
  assetExportRows, stockExportRows, exportAllInventory, loadAssets, loadStock, saveAssets, saveStock,
} from '../lib/inventory'
import type { InventoryProps } from '../lib/inventory'
import { useInventoryContainer } from '../hooks/useInventoryContainer'
import InventoryView from './InventoryView'

/**
 * Asset and stock tracking inventory page.
 *
 * Manages two tabs: Assets (devices, hardware) and Stock (supplies, consumables). Includes:
 * - Multiple view modes: list, cards, split-pane, grouped, and attention (devices needing service)
 * - Asset search, filtering by status, category, assignee, health, and warranty expiration
 * - Stock filtering by quantity (in stock, low stock)
 * - Workspace tabs with independent view settings
 * - Asset lifecycle tracking: assigned/in-repair/retired/lost status and event history
 * - Device health monitoring: healthy, at-risk (needs attention), critical (offline/lost)
 * - Warranty tracking: alerts for items expiring within 60 days
 * - Ticket linkage: associate tickets with assets, create tickets for asset issues
 * - CSV and Excel export with filtering support
 *
 * This is a thin wiring component: all state and logic live in `useInventoryContainer`,
 * all rendering lives in `InventoryView`.
 */
export default function InventoryPage(props: InventoryProps) {
  const vm = useInventoryContainer(props)
  return <InventoryView {...vm} />
}

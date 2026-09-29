export type CsvValue = string | number | boolean | null | undefined

/**
 * Format a single CSV cell value, escaping quotes and preventing formula injection.
 * Prefixes formula-like values (starting with =, +, -, @) with an apostrophe for safety.
 */
function cell(value: CsvValue): string {
  const text = value == null ? '' : String(value)
  const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * Export data as CSV file with BOM for UTF-8 compatibility in Excel.
 * Automatically triggers browser download and cleans up the object URL.
 *
 * @param filename - Name for the downloaded file (e.g., "tickets.csv")
 * @param headers - Column header names
 * @param rows - Array of row data, each row is an array of CsvValue elements
 */
export function exportCsv(filename: string, headers: string[], rows: CsvValue[][]): void {
  const content = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

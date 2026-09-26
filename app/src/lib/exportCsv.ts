export type CsvValue = string | number | boolean | null | undefined

function cell(value: CsvValue): string {
  const text = value == null ? '' : String(value)
  const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

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

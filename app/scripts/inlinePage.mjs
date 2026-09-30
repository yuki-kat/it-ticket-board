// Turns the Vite build in dist/ into ONE self-contained file (../index.html): the script and styles are put
// inside the page, so it opens by double-clicking, with no server and no other files.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(app, 'dist')
const target = resolve(app, '..', 'index.html')

const read = (reference) => {
  const file = resolve(dist, reference.replace(/^\.?\//, ''))
  if (!existsSync(file)) throw new Error(`The build refers to ${reference}, but ${file} does not exist.`)
  return readFileSync(file, 'utf8')
}

let html = readFileSync(resolve(dist, 'index.html'), 'utf8')
html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_match, href) => `<style>${read(href).replace(/<\/style/gi, '<\\/style')}</style>`)
html = html.replace(/<link rel="icon"[^>]*href="([^"]+)"[^>]*>/g, (_match, href) => `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(read(href)).toString('base64')}">`)
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_match, src) => `<script type="module">${read(src).replace(/<\/script/gi, '<\\/script')}</script>`)

// Check the page around the script and styles (not the app's own code, which contains text that looks like links).
const skeleton = html.replace(/<script[\s\S]*?<\/script>/g, '<script></script>').replace(/<style[\s\S]*?<\/style>/g, '<style></style>')
const leftovers = skeleton.match(/(?:src|href)="(?!https?:|data:|#|mailto:)[^"]*"/g)
if (leftovers) throw new Error(`Some files are still referenced from outside the page: ${leftovers.join(', ')}`)
if (!html.includes('<script type="module">')) throw new Error('The script was not put inside the page.')

html = html.replace('<!doctype html>', '<!doctype html>\n<!-- Built from app/ by "npm run build:page". Edit the source in app/, not this file. -->')
writeFileSync(target, html)
console.log(`Wrote ${target} (${(html.length / 1024).toFixed(0)} KB)`)

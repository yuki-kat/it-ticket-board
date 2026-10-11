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
html = html.replace(/<link rel="icon"[^>]*href="([^"]+)"[^>]*>/g, (_match, href) => `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(read(href)).toString('base64')}">`)

// The app's styles and script (over 1 MB) go at the end of <body>, not in <head> where Vite puts them, so the small
// loading screen in index.html shows while they arrive. The script is a module, which runs after the page is
// parsed wherever it sits, and the styles come before it, so the app never renders unstyled.
const tail = []
html = html.replace(/\s*<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_match, href) => { tail.push(`<style>${read(href).replace(/<\/style/gi, '<\\/style')}</style>`); return '' })
html = html.replace(/\s*<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_match, src) => { tail.push(`<script type="module">${read(src).replace(/<\/script/gi, '<\\/script')}</script>`); return '' })
if (!html.includes('</body>')) throw new Error('The page has no </body> to put the script and styles before.')
// A function, not a string: the minified script contains $' and $& sequences that a replacement string would expand.
html = html.replace('</body>', () => `${tail.join('\n')}\n</body>`)

// Check the page around the script and styles (not the app's own code, which contains text that looks like links).
const skeleton = html.replace(/<script[\s\S]*?<\/script>/g, '<script></script>').replace(/<style[\s\S]*?<\/style>/g, '<style></style>')
const leftovers = skeleton.match(/(?:src|href)="(?!https?:|data:|#|mailto:)[^"]*"/g)
if (leftovers) throw new Error(`Some files are still referenced from outside the page: ${leftovers.join(', ')}`)
if (!html.includes('<script type="module">')) throw new Error('The script was not put inside the page.')

html = html.replace('<!doctype html>', '<!doctype html>\n<!-- Built from app/ by "npm run build:page". Edit the source in app/, not this file. -->')
writeFileSync(target, html)
console.log(`Wrote ${target} (${(html.length / 1024).toFixed(0)} KB)`)

/**
 * Binboard theme pass for the legacy stylesheets (PostCSS plugin, wired up in postcss.config.js).
 *
 * The older CSS hard-codes a teal/slate palette, Aptos and 7–12px corners in thousands of places. Rather than edit
 * those files by hand, this rewrites their values at build time into the Material UI look, by the role a value plays:
 *
 *   - colours in the teal family (hue 165–203°) become MUI values: text → rgba(0,0,0,.87)/.6 or blue links,
 *     fills → #1976d2 or blue tints/neutral greys, borders → rgba(0,0,0,.12)/.23 or the outlined-blue border,
 *     shadows → black (or blue for focus glows). Other hues (status reds, ambers, greens, legal-hold violet) are left alone.
 *   - font stacks naming Aptos / Segoe UI / Inter become Roboto (bundled in styles/fonts.css, with system fallbacks).
 *   - corner radii of 5–15px become 4px. Pills (16px and up) and percentages are kept.
 *
 * The source files are untouched, so removing this plugin restores the old look. Component-level details that a
 * value mapping can't express live in styles/binboard-theme.css.
 */
const TEXT_PROPS = /^(color|caret-color|text-decoration-color|-webkit-text-fill-color)$/
const FILL_PROPS = /^(background|background-color|background-image|fill|stroke|stop-color|accent-color)$/
const BORDER_PROPS = /^(border|border-(top|right|bottom|left|block|inline)(-(start|end))?(-color)?|border-color|outline|outline-color|column-rule(-color)?)$/
const SHADOW_PROPS = /^(box-shadow|text-shadow|filter|-webkit-box-shadow)$/
const COLOR = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|rgba?\([^)]*\)/gi
const FONT = /Aptos|Segoe UI|\bInter\b/i
const ROBOTO = 'Roboto, Helvetica, Arial, sans-serif'

function parse(token) {
  if (token[0] === '#') {
    let hex = token.slice(1)
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }
  const parts = token.slice(token.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || parts.slice(0, 3).some((p) => !/^[\d.]+%?$/.test(p))) return null
  const channel = (p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
  return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha }
}

function hsl({ r, g, b }) {
  const [rr, gg, bb] = [r, g, b].map((v) => v / 255)
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), l = (max + min) / 2, d = max - min
  if (d < 0.015) return { h: 0, s: 0, l } // very light tints carry little chroma, so keep this threshold low
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

const isTeal = ({ h, s }) => h >= 165 && h < 203 && s >= 0.12
const rgba = (r, g, b, a) => (a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`)
const black = (a) => rgba(0, 0, 0, a)
const blue = (a = 1) => rgba(25, 118, 210, a)
const hex = (value, a) => (a >= 1 ? value : rgba(...[1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)), a))

function text({ s, l }, a) {
  if (l >= 0.75) return rgba(255, 255, 255, Math.min(1, 0.9 * a)) // light text sits on dark fills
  if (l < 0.24) return black(0.87 * a)
  if (s >= 0.3 && l < 0.6) return hex('#1565c0', a) // accent text: links, outlined-button labels, ids
  return l < 0.38 ? black(0.87 * a) : black(0.6 * a)
}

function fill({ s, l }, a) {
  if (a < 1 && l < 0.6) return s >= 0.3 ? blue(a) : black(a) // translucent overlays and glows
  if (l < 0.5) return s >= 0.2 ? hex('#1976d2', a) : hex('#424242', a)
  if (l < 0.8) return s >= 0.3 ? hex('#90caf9', a) : hex('#bdbdbd', a)
  if (s >= 0.25) return l >= 0.95 ? hex('#f3f8fd', a) : l >= 0.88 ? hex('#e3eefa', a) : hex('#bbdefb', a)
  return l >= 0.97 ? hex('#fafafa', a) : l >= 0.93 ? hex('#f5f5f5', a) : l >= 0.88 ? hex('#eeeeee', a) : hex('#e0e0e0', a)
}

function border({ s, l }, a) {
  if (l >= 0.85) return black(0.12 * a)
  if (l >= 0.65) return s >= 0.3 ? blue(0.5 * a) : black(0.23 * a)
  return s >= 0.25 ? hex('#1976d2', a) : black(0.6 * a)
}

// Focus glows (saturated, clearly visible) turn blue; soft drop shadows turn neutral black.
const shadow = ({ s, l }, a) => (s >= 0.3 && l < 0.6 && a >= 0.12 && a < 1 ? blue(a) : black(Math.min(a, 0.2)))

function role(prop) {
  if (prop.startsWith('--')) return /text|fg|ink|heading|muted|label/i.test(prop) ? text : /border|divider|line|ring/i.test(prop) ? border : fill
  if (TEXT_PROPS.test(prop)) return text
  if (FILL_PROPS.test(prop)) return fill
  if (BORDER_PROPS.test(prop)) return border
  if (SHADOW_PROPS.test(prop)) return shadow
  return null
}

function recolor(value, map) {
  return value.replace(COLOR, (token) => {
    const c = parse(token)
    if (!c) return token
    const tone = hsl(c)
    return isTeal(tone) ? map(tone, c.a) : token
  })
}

const radius = (value) => value.replace(/(\d*\.?\d+)px/g, (match, n) => (Number(n) >= 5 && Number(n) <= 15 ? '4px' : match))

export default function binboard() {
  return {
    postcssPlugin: 'binboard-theme',
    Declaration(decl) {
      const prop = decl.prop.toLowerCase()
      if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) { decl.value = radius(decl.value); return }
      if (prop === 'font-family' || prop === 'font') { if (FONT.test(decl.value)) decl.value = prop === 'font' ? decl.value.replace(/(['"]?(Aptos|Segoe UI|Inter)['"]?\s*,\s*)+[^;]*$/i, ROBOTO) : ROBOTO; return }
      const map = role(prop)
      if (map) decl.value = recolor(decl.value, map)
    },
  }
}
binboard.postcss = true

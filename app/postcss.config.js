import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import binboard from './scripts/postcss-binboard.js'

export default {
  // binboard: rewrites the legacy teal palette, fonts and corners into the Binboard (Material UI) look at build time.
  plugins: [tailwindcss, autoprefixer, binboard],
}

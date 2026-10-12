import { useEffect, useState } from 'react'
import '../styles/binboard-logo.css'

// The Binboard mark: a blue tile with three lanes and six cards (3-2-1), drawn on a 64-unit grid.
const LANES = [11, 26, 41]
const LANE_X = [13, 28, 43]
const STATIC_CARDS: [number, number][] = [[13, 15], [13, 26], [13, 37], [28, 15], [28, 26], [43, 15]]

type Tone = 'brand' | 'onDark'

function Tile({ tone }: { tone: Tone }) {
  return tone === 'brand'
    ? <rect width="64" height="64" rx="8" fill="#1976d2" />
    : <rect width="64" height="64" rx="8" fill="#ffffff" fillOpacity="0.08" />
}

function Lanes({ tone }: { tone: Tone }) {
  return <>{LANES.map((x) => <rect key={x} x={x} y="11" width="12" height="42" rx="3" fill="#ffffff" fillOpacity={tone === 'brand' ? 0.25 : 0.16} />)}</>
}

/** The static mark. Decorative by default; pass a label when it stands alone. */
export function BinboardMark({ size = 32, label }: { size?: number; label?: string }) {
  return <svg className="bb-mark" width={size} height={size} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <Tile tone="brand" />
    <Lanes tone="brand" />
    {STATIC_CARDS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="8" height="7" rx="1.5" fill="#ffffff" />)}
  </svg>
}

/** "Bin" bold + "board" regular, set in Roboto next to the mark. */
export function BinboardWordmark() {
  return <span className="bb-wordmark"><b>Bin</b>board</span>
}

/** Mark and wordmark together, as used in the header. */
export default function BinboardLogo({ size = 30 }: { size?: number }) {
  return <span className="bb-logo"><BinboardMark size={size} /><BinboardWordmark /></span>
}

type Card = { lane: number; t: number }
const START: Card[] = [{ lane: 0, t: 0 }, { lane: 0, t: 1 }, { lane: 0, t: 2 }, { lane: 1, t: 3 }, { lane: 1, t: 4 }, { lane: 2, t: 5 }]

/**
 * The mark as a toy: each click moves the top card of lane (i % 3) to the bottom of the next lane. State lives in the
 * component, so a refresh resets it. The transition class is added after the first paint so nothing flies in on load,
 * and prefers-reduced-motion turns the movement off (binboard-logo.css).
 */
export function AnimatedBinboardMark({ size = 120, tone = 'brand', className = '' }: { size?: number; tone?: Tone; className?: string }) {
  const [cards, setCards] = useState(START)
  const [clicks, setClicks] = useState(0)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const move = () => {
    const source = clicks % 3
    setClicks((value) => value + 1)
    setCards((current) => {
      const top = current.filter((card) => card.lane === source).sort((a, b) => a.t - b.t)[0]
      if (!top) return current
      const tick = Math.max(...current.map((card) => card.t)) + 1
      return current.map((card) => card === top ? { lane: (source + 1) % 3, t: tick } : card)
    })
  }

  return <button type="button" className={`bb-animated${ready ? ' ready' : ''}${tone === 'onDark' ? ' on-dark' : ''} ${className}`.trim()} onClick={move} aria-label="Binboard logo: click to move a card">
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <Tile tone={tone} />
      <Lanes tone={tone} />
      {cards.map((card, index) => {
        const slot = cards.filter((other) => other.lane === card.lane && other.t < card.t).length
        return <rect key={index} className="bb-card" width="8" height="7" rx="1.5" fill="#ffffff" style={{ transform: `translate(${LANE_X[card.lane]}px, ${15 + 11 * slot}px)` }} />
      })}
    </svg>
  </button>
}

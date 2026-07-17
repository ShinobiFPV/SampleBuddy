import type { CSSProperties } from 'react'
import { MAX_REGIONS, PAIR_COLORS, type ChopRegion, formatPairLabel } from './waveform'

interface PadGridProps {
  regions: ChopRegion[]
  activePads: Set<number>
  onToggle: (index: number) => void
}

export default function PadGrid({ regions, activePads, onToggle }: PadGridProps): JSX.Element {
  return (
    <div className="pad-grid">
      {Array.from({ length: MAX_REGIONS }, (_, index) => {
        const region = regions[index]
        const ready = !!region && region.endSec !== null
        const active = activePads.has(index)
        const color = PAIR_COLORS[index % PAIR_COLORS.length]
        return (
          <button
            key={index}
            type="button"
            className={`pad${active ? ' pad-active' : ''}`}
            style={{ '--pad-color': color } as CSSProperties}
            disabled={!ready}
            onClick={() => onToggle(index)}
          >
            {formatPairLabel(index)}
          </button>
        )
      })}
    </div>
  )
}

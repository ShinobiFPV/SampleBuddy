import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_REGIONS,
  PAIR_COLORS,
  type ChopRegion,
  type PadControllerMap,
  type TriggerMode,
  formatPairLabel,
  triggerModeAbbrev,
  triggerModeLabel
} from './waveform'

interface PadGridProps {
  regions: ChopRegion[]
  activePads: Set<number>
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
  learningPad: number | null
  onPadDown: (index: number) => void
  onPadUp: (index: number) => void
  onCycleTriggerMode: (index: number) => void
  onLearnController: (index: number) => void
  onClearController: (index: number) => void
}

export default function PadGrid({
  regions,
  activePads,
  triggerModes,
  controllerMap,
  learningPad,
  onPadDown,
  onPadUp,
  onCycleTriggerMode,
  onLearnController,
  onClearController
}: PadGridProps): JSX.Element {
  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, index: number): void {
    if (e.button !== 0) return // ignore right/middle click, leave context menu alone
    // Pointer capture keeps the release on this button even if the cursor/finger
    // drifts off it before letting go — required for gate mode to reliably stop.
    e.currentTarget.setPointerCapture(e.pointerId)
    onPadDown(index)
  }

  return (
    <div className="pad-grid">
      {Array.from({ length: MAX_REGIONS }, (_, index) => {
        const region = regions[index]
        const ready = !!region && region.endSec !== null
        const active = activePads.has(index)
        const color = PAIR_COLORS[index % PAIR_COLORS.length]
        const mode = triggerModes[index]
        const mapping = controllerMap[index]
        const learning = learningPad === index

        return (
          <div className="pad-wrap" key={index} style={{ '--pad-color': color } as CSSProperties}>
            <button
              type="button"
              className={`pad${active ? ' pad-active' : ''}`}
              disabled={!ready}
              onPointerDown={(e) => handlePointerDown(e, index)}
              onPointerUp={() => onPadUp(index)}
              onPointerCancel={() => onPadUp(index)}
            >
              <span className="pad-key">{index + 1}</span>
              {formatPairLabel(index)}
            </button>

            <button
              type="button"
              className="pad-badge pad-mode"
              title={`Trigger mode: ${triggerModeLabel(mode)} — click to change`}
              onClick={() => onCycleTriggerMode(index)}
            >
              {triggerModeAbbrev(mode)}
            </button>

            <button
              type="button"
              className={`pad-badge pad-learn${learning ? ' pad-learn-active' : ''}`}
              title={
                learning
                  ? 'Press a controller button…'
                  : mapping
                    ? `Mapped to controller button ${mapping.buttonIndex + 1} — click to relearn, right-click to clear`
                    : 'Click, then press a controller button to map it to this pad'
              }
              onClick={() => onLearnController(index)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (mapping) onClearController(index)
              }}
            >
              {learning ? '…' : mapping ? `B${mapping.buttonIndex + 1}` : '–'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_REGIONS,
  PAIR_COLORS,
  type ChopRegion,
  type PadControllerMap,
  type PadMidiMap,
  type TriggerMode,
  formatPairLabel,
  noteName,
  triggerModeAbbrev,
  triggerModeLabel
} from './waveform'

interface PadGridProps {
  regions: ChopRegion[]
  activePads: Set<number>
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
  midiMap: (PadMidiMap | null)[]
  /** Per-pad note sourced from a connected known-profile device (e.g. an
   *  MPK Mini MK4), shown only where midiMap has no explicit override. */
  midiDefaults: (number | null)[]
  learningPad: number | null
  learningMidiPad: number | null
  onPadDown: (index: number) => void
  onPadUp: (index: number) => void
  onCycleTriggerMode: (index: number) => void
  onLearnController: (index: number) => void
  onClearController: (index: number) => void
  onLearnMidi: (index: number) => void
  onClearMidi: (index: number) => void
}

export default function PadGrid({
  regions,
  activePads,
  triggerModes,
  controllerMap,
  midiMap,
  midiDefaults,
  learningPad,
  learningMidiPad,
  onPadDown,
  onPadUp,
  onCycleTriggerMode,
  onLearnController,
  onClearController,
  onLearnMidi,
  onClearMidi
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
        const midiMapping = midiMap[index]
        const midiDefault = midiDefaults[index]
        const midiLearning = learningMidiPad === index
        const midiNote = midiMapping ? midiMapping.note : midiDefault

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

            <button
              type="button"
              className={`pad-badge pad-learn-midi${midiLearning ? ' pad-learn-active' : ''}${
                !midiMapping && midiDefault !== null ? ' pad-learn-default' : ''
              }`}
              title={
                midiLearning
                  ? 'Press a MIDI pad/key…'
                  : midiMapping
                    ? `Mapped to MIDI note ${noteName(midiMapping.note)} — click to relearn, right-click to clear`
                    : midiDefault !== null
                      ? `Default mapping from a connected controller profile: ${noteName(midiDefault)} — click to override`
                      : 'Click, then press a MIDI pad/key to map it to this pad'
              }
              onClick={() => onLearnMidi(index)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (midiMapping) onClearMidi(index)
              }}
            >
              {midiLearning ? '…' : midiNote !== null ? noteName(midiNote) : '–'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  PAIR_COLORS,
  type PadControllerMap,
  type PadKnobMap,
  type PadMidiMap,
  type TriggerMode,
  noteName,
  triggerModeAbbrev,
  triggerModeLabel
} from './types'

/** What a pad shows and whether it's playable — the caller (Chop or
 *  Playback) decides what "ready" and "label" mean for its own pad content
 *  (a completed region vs. an assigned file). */
export interface PadDescriptor {
  label: string
  ready: boolean
}

interface PadGridProps {
  pads: PadDescriptor[]
  activePads: Set<number>
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
  midiMap: (PadMidiMap | null)[]
  /** Per-pad note sourced from a connected known-profile device (e.g. an
   *  MPK Mini MK4), shown only where midiMap has no explicit override. */
  midiDefaults: (number | null)[]
  knobMap: (PadKnobMap | null)[]
  /** Per-pad knob CC sourced from a connected known-profile device, shown
   *  only where knobMap has no explicit override. */
  knobDefaults: (number | null)[]
  /** Current live gain (0-1) per pad, from the last CC value received on
   *  its mapped (explicit or default-profile) knob. */
  padGains: number[]
  learningPad: number | null
  learningMidiPad: number | null
  learningKnobPad: number | null
  onPadDown: (index: number) => void
  onPadUp: (index: number) => void
  onCycleTriggerMode: (index: number) => void
  onLearnController: (index: number) => void
  onClearController: (index: number) => void
  onLearnMidi: (index: number) => void
  onClearMidi: (index: number) => void
  onLearnKnob: (index: number) => void
  onClearKnob: (index: number) => void
}

export default function PadGrid({
  pads,
  activePads,
  triggerModes,
  controllerMap,
  midiMap,
  midiDefaults,
  knobMap,
  knobDefaults,
  padGains,
  learningPad,
  learningMidiPad,
  learningKnobPad,
  onPadDown,
  onPadUp,
  onCycleTriggerMode,
  onLearnController,
  onClearController,
  onLearnMidi,
  onClearMidi,
  onLearnKnob,
  onClearKnob
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
      {pads.map((pad, index) => {
        const active = activePads.has(index)
        const color = PAIR_COLORS[index % PAIR_COLORS.length]
        const mode = triggerModes[index]
        const mapping = controllerMap[index]
        const learning = learningPad === index
        const midiMapping = midiMap[index]
        const midiDefault = midiDefaults[index]
        const midiLearning = learningMidiPad === index
        const midiNote = midiMapping ? midiMapping.note : midiDefault
        const knobMapping = knobMap[index]
        const knobDefault = knobDefaults[index]
        const knobLearning = learningKnobPad === index
        const knobController = knobMapping ? knobMapping.controller : knobDefault
        const gain = padGains[index] ?? 1

        return (
          <div className="pad-wrap" key={index} style={{ '--pad-color': color } as CSSProperties}>
            <button
              type="button"
              className={`pad${active ? ' pad-active' : ''}`}
              disabled={!pad.ready}
              onPointerDown={(e) => handlePointerDown(e, index)}
              onPointerUp={() => onPadUp(index)}
              onPointerCancel={() => onPadUp(index)}
            >
              <span className="pad-key">{index + 1}</span>
              {pad.label}
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

            <button
              type="button"
              className={`pad-badge pad-learn-knob${knobLearning ? ' pad-learn-active' : ''}${
                !knobMapping && knobDefault !== null ? ' pad-learn-default' : ''
              }`}
              style={{ '--pad-knob-gain': `${Math.round(gain * 100)}%` } as CSSProperties}
              title={
                knobLearning
                  ? 'Turn a knob…'
                  : knobMapping
                    ? `Gain trim from knob CC${knobMapping.controller} (${Math.round(gain * 100)}%) — click to relearn, right-click to clear`
                    : knobDefault !== null
                      ? `Default gain-trim knob from a connected controller profile: CC${knobDefault} (${Math.round(gain * 100)}%) — click to override`
                      : 'Click, then turn a knob to map it to this pad’s gain'
              }
              onClick={() => onLearnKnob(index)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (knobMapping) onClearKnob(index)
              }}
            >
              {knobLearning ? '…' : knobController !== null ? `K${knobController}` : '–'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

import { noteName, type PadControllerMap, type PadMidiMap } from './types'

interface ControlAssignBadgesProps {
  /** Named in tooltips, e.g. "Record" or "Play/Stop". */
  actionLabel: string
  controllerMap: PadControllerMap | null
  midiMap: PadMidiMap | null
  learningController: boolean
  learningMidi: boolean
  onLearnController: () => void
  onClearController: () => void
  onLearnMidi: () => void
  onClearMidi: () => void
}

/** Click-to-arm-learn / right-click-to-clear badge pair for a single
 *  useControlAssignment binding — the same interaction pattern as
 *  PadGrid's per-pad controller/MIDI badges, but for a standalone action
 *  (e.g. Record, or a transport Play/Stop) rather than a pad index. */
export default function ControlAssignBadges({
  actionLabel,
  controllerMap,
  midiMap,
  learningController,
  learningMidi,
  onLearnController,
  onClearController,
  onLearnMidi,
  onClearMidi
}: ControlAssignBadgesProps): JSX.Element {
  return (
    <div className="control-assign-row">
      <button
        type="button"
        className={`control-badge${learningController ? ' control-badge-active' : ''}`}
        title={
          learningController
            ? 'Press a controller button…'
            : controllerMap
              ? `Mapped to controller button ${controllerMap.buttonIndex + 1} — click to relearn, right-click to clear`
              : `Click, then press a controller button to map it to ${actionLabel}`
        }
        onClick={onLearnController}
        onContextMenu={(e) => {
          e.preventDefault()
          if (controllerMap) onClearController()
        }}
      >
        {learningController
          ? 'Controller: …'
          : controllerMap
            ? `Controller: B${controllerMap.buttonIndex + 1}`
            : 'Controller: –'}
      </button>

      <button
        type="button"
        className={`control-badge${learningMidi ? ' control-badge-active' : ''}`}
        title={
          learningMidi
            ? 'Press a MIDI pad/key…'
            : midiMap
              ? `Mapped to MIDI note ${noteName(midiMap.note)} — click to relearn, right-click to clear`
              : `Click, then press a MIDI pad/key to map it to ${actionLabel}`
        }
        onClick={onLearnMidi}
        onContextMenu={(e) => {
          e.preventDefault()
          if (midiMap) onClearMidi()
        }}
      >
        {learningMidi ? 'MIDI: …' : midiMap ? `MIDI: ${noteName(midiMap.note)}` : 'MIDI: –'}
      </button>
    </div>
  )
}

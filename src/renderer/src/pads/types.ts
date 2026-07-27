/** Shared pad hardware-mapping types/helpers, used by both the Chop Editor
 *  and Playback pages — anything about "what does pad N contain" (a chopped
 *  region vs. an assigned file) stays with each page; anything about "what
 *  physical input fires pad N" lives here. */

/** Cycled per pad index so a pad's markers/button/badges share a color —
 *  8 hues in a warm-to-cool sweep, matched to the app's per-mode accent
 *  family so pad colors read as siblings of the chrome rather than clashing
 *  with it. Tuned to stay legible both on the light panel chrome and as
 *  tinted overlays on the dark waveform "screen". */
export const PAIR_COLORS = [
  '#dc9a2e',
  '#d97a3a',
  '#d94f3f',
  '#c9508a',
  '#8c5bc4',
  '#4472c4',
  '#2c9f92',
  '#6ba23a'
]

/** How a pad responds to a press, whether from mouse/touch, the 1-8 keyboard
 *  keys, or a mapped controller button. */
export type TriggerMode = 'toggle' | 'gate' | 'one-shot'

export const TRIGGER_MODES: TriggerMode[] = ['toggle', 'gate', 'one-shot']

export function nextTriggerMode(mode: TriggerMode): TriggerMode {
  const i = TRIGGER_MODES.indexOf(mode)
  return TRIGGER_MODES[(i + 1) % TRIGGER_MODES.length]
}

export function triggerModeAbbrev(mode: TriggerMode): string {
  switch (mode) {
    case 'gate':
      return 'GATE'
    case 'one-shot':
      return '1SH'
    default:
      return 'TGL'
  }
}

export function triggerModeLabel(mode: TriggerMode): string {
  switch (mode) {
    case 'gate':
      return 'Gate (hold to play)'
    case 'one-shot':
      return 'One-shot (retrigger)'
    default:
      return 'Toggle (press to start/stop)'
  }
}

/** Identifies a physical controller button mapped to a pad. Keyed by the
 *  Gamepad API's `id` string rather than its array index — the index is
 *  just connection order and reshuffles across browser sessions, while the
 *  id is stable for a given device. */
export interface PadControllerMap {
  gamepadId: string
  buttonIndex: number
}

/** Identifies a physical MIDI note mapped to a pad. Keyed by the Web MIDI
 *  API's `id` string for the input port, same rationale as PadControllerMap —
 *  connection order isn't stable, the port id is (for a given device/port). */
export interface PadMidiMap {
  inputId: string
  note: number
}

/** Identifies a physical MIDI CC (knob) mapped to a pad's gain trim. `value`
 *  (0-1) is the last-received trim level, persisted so relaunching the app
 *  doesn't snap a pad's volume back to unity. */
export interface PadKnobMap {
  inputId: string
  controller: number
  value: number
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Renders a MIDI note number as a name+octave, e.g. 36 -> "C1", for badges. */
export function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12]
  const octave = Math.floor(note / 12) - 1
  return `${name}${octave}`
}

interface MidiControllerProfile {
  match: (deviceName: string) => boolean
  /** Note numbers for pads 0-7, index-aligned to the pad grid. */
  padNotes: number[]
  /** CC numbers for knobs 0-7, index-aligned to the pad grid (knob N trims
   *  pad N's gain). Akai's default preset for the Mini MK4 — if a unit's
   *  firmware/preset differs, the per-pad knob-learn badge overrides it,
   *  same safety net as padNotes. */
  knobControllers: number[]
}

/** Known controllers that should "just work" with no manual MIDI learning.
 *  Akai MPK Mini MK4 ships its 8 drum pads sending notes 36-43 (C1-G1) on
 *  the default PAD bank — the standard Akai/GM drum convention — and its 8
 *  knobs sending CC 70-77 on the default preset. If a unit's firmware/preset
 *  differs, the per-pad learn badges override this. */
export const MIDI_CONTROLLER_PROFILES: MidiControllerProfile[] = [
  {
    match: (name) => /mpk mini mk4/i.test(name),
    padNotes: [36, 37, 38, 39, 40, 41, 42, 43],
    knobControllers: [70, 71, 72, 73, 74, 75, 76, 77]
  }
]

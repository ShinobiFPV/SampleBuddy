/** Max marked regions per file — 8 pairs covers letters A-P, matching the
 *  8-pad grid. Labels are always derived from array index, never stored, so
 *  deleting a region reflows every later letter automatically. */
export const MAX_REGIONS = 8

/** A region's `endSec` is null while only its start marker has been placed
 *  (the pair isn't complete yet, so its pad stays disabled). */
export interface ChopRegion {
  id: string
  startSec: number
  endSec: number | null
}

/** Cycled per region-pair index so each pair's markers/pad share a color —
 *  8 accent-adjacent hues, evenly spread and readable on the app's dark bg. */
export const PAIR_COLORS = [
  '#ffd633',
  '#ff9e3d',
  '#ff5c7a',
  '#e05cff',
  '#7c8bff',
  '#3dd1ff',
  '#3dffb0',
  '#a8ff3d'
]

export function labelForIndex(index: number): [string, string] {
  const startCode = 'A'.charCodeAt(0) + index * 2
  return [String.fromCharCode(startCode), String.fromCharCode(startCode + 1)]
}

export function formatPairLabel(index: number): string {
  const [start, end] = labelForIndex(index)
  return `${start}${end}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Renders a MIDI note number as a name+octave, e.g. 36 -> "C1", for badges. */
export function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12]
  const octave = Math.floor(note / 12) - 1
  return `${name}${octave}`
}

interface MidiControllerProfile {
  match: (deviceName: string) => boolean
  /** Note numbers for pads 0-7, index-aligned to the chop pad grid. */
  padNotes: number[]
}

/** Known controllers that should "just work" with no manual MIDI learning.
 *  Akai MPK Mini MK4 ships its 8 drum pads sending notes 36-43 (C1-G1) on
 *  the default PAD bank — the standard Akai/GM drum convention. If a unit's
 *  firmware/preset differs, the per-pad MIDI learn badge overrides this. */
export const MIDI_CONTROLLER_PROFILES: MidiControllerProfile[] = [
  {
    match: (name) => /mpk mini mk4/i.test(name),
    padNotes: [36, 37, 38, 39, 40, 41, 42, 43]
  }
]

export interface PadSettings {
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
  midiMap: (PadMidiMap | null)[]
}

const PAD_SETTINGS_KEY = 'sampleBuddy.chop.padSettings.v1'

function defaultPadSettings(): PadSettings {
  return {
    triggerModes: Array.from({ length: MAX_REGIONS }, () => 'toggle'),
    controllerMap: Array.from({ length: MAX_REGIONS }, () => null),
    midiMap: Array.from({ length: MAX_REGIONS }, () => null)
  }
}

/** Loads per-pad trigger mode / controller / MIDI mapping preferences saved
 *  by savePadSettings. Falls back to all-toggle/all-unmapped for anything
 *  missing or malformed, so old or hand-edited storage can't crash the app —
 *  this also covers blobs saved before midiMap existed. */
export function loadPadSettings(): PadSettings {
  const fallback = defaultPadSettings()
  try {
    const raw = localStorage.getItem(PAD_SETTINGS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PadSettings>
    return {
      triggerModes: Array.from({ length: MAX_REGIONS }, (_, i) => {
        const mode = parsed.triggerModes?.[i]
        return mode && (TRIGGER_MODES as string[]).includes(mode) ? mode : 'toggle'
      }),
      controllerMap: Array.from({ length: MAX_REGIONS }, (_, i) => parsed.controllerMap?.[i] ?? null),
      midiMap: Array.from({ length: MAX_REGIONS }, (_, i) => parsed.midiMap?.[i] ?? null)
    }
  } catch {
    return fallback
  }
}

export function savePadSettings(settings: PadSettings): void {
  try {
    localStorage.setItem(PAD_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable (e.g. quota, privacy mode) — settings just won't persist
  }
}

export interface WaveformPeaks {
  min: Float32Array
  max: Float32Array
}

/** Downsamples an AudioBuffer's first channel to one min/max pair per pixel
 *  column, for cheap canvas rendering regardless of source sample count. */
export function computePeaks(buffer: AudioBuffer, width: number): WaveformPeaks {
  const channel = buffer.getChannelData(0)
  const min = new Float32Array(width)
  const max = new Float32Array(width)
  const samplesPerPixel = channel.length / width

  for (let x = 0; x < width; x++) {
    const start = Math.floor(x * samplesPerPixel)
    const end = Math.max(start + 1, Math.floor((x + 1) * samplesPerPixel))
    let pixelMin = 1
    let pixelMax = -1
    for (let i = start; i < end && i < channel.length; i++) {
      const sample = channel[i]
      if (sample < pixelMin) pixelMin = sample
      if (sample > pixelMax) pixelMax = sample
    }
    min[x] = pixelMin
    max[x] = pixelMax
  }

  return { min, max }
}

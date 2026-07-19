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

export interface PadSettings {
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
}

const PAD_SETTINGS_KEY = 'sampleBuddy.chop.padSettings.v1'

function defaultPadSettings(): PadSettings {
  return {
    triggerModes: Array.from({ length: MAX_REGIONS }, () => 'toggle'),
    controllerMap: Array.from({ length: MAX_REGIONS }, () => null)
  }
}

/** Loads per-pad trigger mode / controller mapping preferences saved by
 *  savePadSettings. Falls back to all-toggle/all-unmapped for anything
 *  missing or malformed, so old or hand-edited storage can't crash the app. */
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
      controllerMap: Array.from({ length: MAX_REGIONS }, (_, i) => parsed.controllerMap?.[i] ?? null)
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

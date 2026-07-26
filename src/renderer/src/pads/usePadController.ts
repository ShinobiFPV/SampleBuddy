import { useEffect, useRef, useState } from 'react'
import {
  MIDI_CONTROLLER_PROFILES,
  TRIGGER_MODES,
  type PadControllerMap,
  type PadKnobMap,
  type PadMidiMap,
  type TriggerMode,
  nextTriggerMode
} from './types'

const KEYBOARD_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

interface PadSettings {
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
  midiMap: (PadMidiMap | null)[]
  knobMap: (PadKnobMap | null)[]
}

function defaultPadSettings(padCount: number): PadSettings {
  return {
    triggerModes: Array.from({ length: padCount }, () => 'toggle'),
    controllerMap: Array.from({ length: padCount }, () => null),
    midiMap: Array.from({ length: padCount }, () => null),
    knobMap: Array.from({ length: padCount }, () => null)
  }
}

/** Loads per-pad trigger mode / controller / MIDI / knob mapping preferences
 *  saved by savePadSettings. Falls back to all-toggle/all-unmapped for
 *  anything missing or malformed, so old or hand-edited storage can't crash
 *  the app — this also covers blobs saved before knobMap existed. */
function loadPadSettings(storageKey: string, padCount: number): PadSettings {
  const fallback = defaultPadSettings(padCount)
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PadSettings>
    return {
      triggerModes: Array.from({ length: padCount }, (_, i) => {
        const mode = parsed.triggerModes?.[i]
        return mode && (TRIGGER_MODES as string[]).includes(mode) ? mode : 'toggle'
      }),
      controllerMap: Array.from({ length: padCount }, (_, i) => parsed.controllerMap?.[i] ?? null),
      midiMap: Array.from({ length: padCount }, (_, i) => parsed.midiMap?.[i] ?? null),
      knobMap: Array.from({ length: padCount }, (_, i) => parsed.knobMap?.[i] ?? null)
    }
  } catch {
    return fallback
  }
}

function savePadSettings(storageKey: string, settings: PadSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    // storage unavailable (e.g. quota, privacy mode) — settings just won't persist
  }
}

interface UsePadControllerOptions {
  padCount: number
  /** localStorage key — keep distinct per page (Chop vs Playback) so their
   *  mappings persist independently. */
  storageKey: string
  /** Called when a pad should start, from any input source (mouse/touch via
   *  the caller's own PadGrid wiring, keyboard 1-N, mapped controller
   *  button, or mapped/default-profile MIDI note). */
  onPadDown: (index: number) => void
  /** Called when a pad should stop (only meaningful in gate mode). */
  onPadUp: (index: number) => void
}

/** Hardware pad-mapping for an 8-ish-pad grid: trigger modes, Gamepad button
 *  mapping, MIDI note mapping (with known-controller-profile defaults, e.g.
 *  an Akai MPK Mini MK4's pads/knobs), and MIDI CC-driven per-pad gain trim.
 *  Shared between the Chop and Playback pages — what a pad actually plays
 *  (a chopped region vs. an assigned file) stays with the caller; this hook
 *  only owns "what physical input fires/trims pad N". */
export function usePadController({ padCount, storageKey, onPadDown, onPadUp }: UsePadControllerOptions): {
  triggerModes: TriggerMode[]
  controllerMap: (PadControllerMap | null)[]
  midiMap: (PadMidiMap | null)[]
  knobMap: (PadKnobMap | null)[]
  padGains: number[]
  learningPad: number | null
  learningMidiPad: number | null
  learningKnobPad: number | null
  gamepadConnected: boolean
  midiSupported: boolean
  midiInputNames: Map<string, string>
  midiDefaults: (number | null)[]
  knobDefaults: (number | null)[]
  handleCycleTriggerMode: (index: number) => void
  handleLearnController: (index: number) => void
  handleClearController: (index: number) => void
  handleLearnMidi: (index: number) => void
  handleClearMidi: (index: number) => void
  handleLearnKnob: (index: number) => void
  handleClearKnob: (index: number) => void
} {
  const initialPadSettings = useRef(loadPadSettings(storageKey, padCount)).current
  const [triggerModes, setTriggerModes] = useState<TriggerMode[]>(initialPadSettings.triggerModes)
  const [controllerMap, setControllerMap] = useState<(PadControllerMap | null)[]>(
    initialPadSettings.controllerMap
  )
  const [midiMap, setMidiMap] = useState<(PadMidiMap | null)[]>(initialPadSettings.midiMap)
  const [knobMap, setKnobMap] = useState<(PadKnobMap | null)[]>(initialPadSettings.knobMap)
  const [padGains, setPadGains] = useState<number[]>(
    initialPadSettings.knobMap.map((m) => m?.value ?? 1)
  )
  const [learningPad, setLearningPad] = useState<number | null>(null)
  const [learningMidiPad, setLearningMidiPad] = useState<number | null>(null)
  const [learningKnobPad, setLearningKnobPad] = useState<number | null>(null)
  const [gamepadConnected, setGamepadConnected] = useState(false)
  const [midiSupported, setMidiSupported] = useState(false)
  const [midiInputNames, setMidiInputNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    savePadSettings(storageKey, { triggerModes, controllerMap, midiMap, knobMap })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerModes, controllerMap, midiMap, knobMap, storageKey])

  const onPadDownRef = useRef(onPadDown)
  onPadDownRef.current = onPadDown
  const onPadUpRef = useRef(onPadUp)
  onPadUpRef.current = onPadUp

  // Number keys 1-8 trigger pads AB-OP, like a hardware sampler's pad bank.
  // Kept as refs so the listeners can be attached once while still calling
  // the latest onPadDown/onPadUp.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target && KEYBOARD_INPUT_TAGS.has(target.tagName)) return
      const num = Number(e.key)
      if (Number.isInteger(num) && num >= 1 && num <= padCount) {
        e.preventDefault()
        onPadDownRef.current(num - 1)
      }
    }
    function handleKeyUp(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (target && KEYBOARD_INPUT_TAGS.has(target.tagName)) return
      const num = Number(e.key)
      if (Number.isInteger(num) && num >= 1 && num <= padCount) {
        onPadUpRef.current(num - 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [padCount])

  // Polls the Gamepad API every frame (it has no change-events of its own)
  // to edge-detect button presses/releases for both "learn" capture and
  // dispatching mapped pads — works uniformly for Xbox-style "standard"
  // mapped pads and raw/generic HID devices (8BitDo Zero 2 included) since
  // we only ever compare button indices, never rely on semantic layout.
  const controllerMapRef = useRef(controllerMap)
  controllerMapRef.current = controllerMap
  const learningPadRef = useRef(learningPad)
  learningPadRef.current = learningPad
  useEffect(() => {
    let rafId: number
    const wasPressed = new Map<string, boolean>()

    function poll(): void {
      const gamepads = navigator.getGamepads()
      let anyConnected = false
      for (const gp of gamepads) {
        if (!gp) continue
        anyConnected = true
        for (let buttonIndex = 0; buttonIndex < gp.buttons.length; buttonIndex++) {
          const key = `${gp.index}:${buttonIndex}`
          const pressed = gp.buttons[buttonIndex].pressed
          const was = wasPressed.get(key) ?? false
          wasPressed.set(key, pressed)
          if (pressed === was) continue

          if (pressed && learningPadRef.current !== null) {
            const index = learningPadRef.current
            setControllerMap((prev) => {
              const next = [...prev]
              next[index] = { gamepadId: gp.id, buttonIndex }
              return next
            })
            setLearningPad(null)
            continue
          }

          const padIndex = controllerMapRef.current.findIndex(
            (m) => m && m.gamepadId === gp.id && m.buttonIndex === buttonIndex
          )
          if (padIndex === -1) continue
          if (pressed) onPadDownRef.current(padIndex)
          else onPadUpRef.current(padIndex)
        }
      }
      setGamepadConnected(anyConnected)
      rafId = requestAnimationFrame(poll)
    }

    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // MIDI is event-driven (no Gamepad-style polling needed). A pad's note
  // mapping resolves in two tiers: an explicit learned {inputId, note}
  // always wins; otherwise, if the sending device matches a known
  // MIDI_CONTROLLER_PROFILES entry (e.g. an MPK Mini MK4) and that pad has
  // no explicit override, its default note fires the pad with zero setup.
  // Knob (CC) mapping works the same way, but drives a live gain value
  // instead of a discrete trigger.
  const midiMapRef = useRef(midiMap)
  midiMapRef.current = midiMap
  const knobMapRef = useRef(knobMap)
  knobMapRef.current = knobMap
  const learningMidiPadRef = useRef(learningMidiPad)
  learningMidiPadRef.current = learningMidiPad
  const learningKnobPadRef = useRef(learningKnobPad)
  learningKnobPadRef.current = learningKnobPad
  const midiInputNamesRef = useRef(midiInputNames)
  midiInputNamesRef.current = midiInputNames

  function resolvePadForNote(inputId: string, note: number): number | null {
    const explicit = midiMapRef.current.findIndex((m) => m && m.inputId === inputId && m.note === note)
    if (explicit !== -1) return explicit

    const deviceName = midiInputNamesRef.current.get(inputId)
    if (!deviceName) return null
    const profile = MIDI_CONTROLLER_PROFILES.find((p) => p.match(deviceName))
    if (!profile) return null
    const padIndex = profile.padNotes.indexOf(note)
    if (padIndex === -1) return null
    // An explicit mapping on that pad slot (even from a different device)
    // always takes precedence over the device's default profile note.
    if (midiMapRef.current[padIndex]) return null
    return padIndex
  }

  function resolvePadForController(inputId: string, controller: number): number | null {
    const explicit = knobMapRef.current.findIndex(
      (m) => m && m.inputId === inputId && m.controller === controller
    )
    if (explicit !== -1) return explicit

    const deviceName = midiInputNamesRef.current.get(inputId)
    if (!deviceName) return null
    const profile = MIDI_CONTROLLER_PROFILES.find((p) => p.match(deviceName))
    if (!profile) return null
    const padIndex = profile.knobControllers.indexOf(controller)
    if (padIndex === -1) return null
    if (knobMapRef.current[padIndex]) return null
    return padIndex
  }

  function handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data
    if (!data || data.length < 3) return
    const command = data[0] & 0xf0
    const inputId = (event.target as MIDIInput).id

    if (command === 0x90 || command === 0x80) {
      const note = data[1]
      const velocity = data[2]
      const isPress = command === 0x90 && velocity > 0

      if (isPress && learningMidiPadRef.current !== null) {
        const index = learningMidiPadRef.current
        setMidiMap((prev) => {
          const next = [...prev]
          next[index] = { inputId, note }
          return next
        })
        setLearningMidiPad(null)
        return
      }

      const padIndex = resolvePadForNote(inputId, note)
      if (padIndex === null) return
      if (isPress) onPadDownRef.current(padIndex)
      else onPadUpRef.current(padIndex)
      return
    }

    if (command === 0xb0) {
      const controller = data[1]
      const value = data[2] / 127

      if (learningKnobPadRef.current !== null) {
        const index = learningKnobPadRef.current
        setKnobMap((prev) => {
          const next = [...prev]
          next[index] = { inputId, controller, value }
          return next
        })
        setPadGains((prev) => {
          const next = [...prev]
          next[index] = value
          return next
        })
        setLearningKnobPad(null)
        return
      }

      const padIndex = resolvePadForController(inputId, controller)
      if (padIndex === null) return
      setPadGains((prev) => {
        const next = [...prev]
        next[padIndex] = value
        return next
      })
      // Only an explicit mapping's persisted value gets updated here — a
      // default-profile match (no knobMap entry) stays a live-only trim,
      // same as how MIDI note defaults never get written into midiMap.
      setKnobMap((prev) => {
        if (!prev[padIndex]) return prev
        const next = [...prev]
        next[padIndex] = { ...next[padIndex]!, value }
        return next
      })
    }
  }

  useEffect(() => {
    let cancelled = false
    let access: MIDIAccess | null = null

    function attachInputs(midiAccess: MIDIAccess): void {
      const names = new Map<string, string>()
      midiAccess.inputs.forEach((input) => {
        names.set(input.id, input.name ?? input.id)
        input.onmidimessage = handleMidiMessage
      })
      setMidiInputNames(names)
    }

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((midiAccess) => {
        if (cancelled) return
        access = midiAccess
        attachInputs(midiAccess)
        midiAccess.onstatechange = () => attachInputs(midiAccess)
        setMidiSupported(true)
      })
      .catch((e) => {
        console.error('MIDI access unavailable — MIDI pad mapping disabled', e)
        setMidiSupported(false)
      })

    return () => {
      cancelled = true
      if (access) {
        access.onstatechange = null
        access.inputs.forEach((input) => {
          input.onmidimessage = null
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCycleTriggerMode(index: number): void {
    setTriggerModes((prev) => {
      const next = [...prev]
      next[index] = nextTriggerMode(prev[index])
      return next
    })
  }

  function handleLearnController(index: number): void {
    setLearningPad((prev) => (prev === index ? null : index))
  }

  function handleClearController(index: number): void {
    setControllerMap((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  function handleLearnMidi(index: number): void {
    setLearningMidiPad((prev) => (prev === index ? null : index))
  }

  function handleClearMidi(index: number): void {
    setMidiMap((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  function handleLearnKnob(index: number): void {
    setLearningKnobPad((prev) => (prev === index ? null : index))
  }

  function handleClearKnob(index: number): void {
    setKnobMap((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setPadGains((prev) => {
      const next = [...prev]
      next[index] = 1
      return next
    })
  }

  // Per-pad default note/CC from a connected known-profile device (e.g. an
  // MPK Mini MK4), shown in the UI only where no explicit mapping already wins.
  const midiDefaults = Array.from({ length: padCount }, (_, index) => {
    if (midiMap[index]) return null
    for (const name of midiInputNames.values()) {
      const profile = MIDI_CONTROLLER_PROFILES.find((p) => p.match(name))
      if (profile) return profile.padNotes[index] ?? null
    }
    return null
  })

  const knobDefaults = Array.from({ length: padCount }, (_, index) => {
    if (knobMap[index]) return null
    for (const name of midiInputNames.values()) {
      const profile = MIDI_CONTROLLER_PROFILES.find((p) => p.match(name))
      if (profile) return profile.knobControllers[index] ?? null
    }
    return null
  })

  return {
    triggerModes,
    controllerMap,
    midiMap,
    knobMap,
    padGains,
    learningPad,
    learningMidiPad,
    learningKnobPad,
    gamepadConnected,
    midiSupported,
    midiInputNames,
    midiDefaults,
    knobDefaults,
    handleCycleTriggerMode,
    handleLearnController,
    handleClearController,
    handleLearnMidi,
    handleClearMidi,
    handleLearnKnob,
    handleClearKnob
  }
}

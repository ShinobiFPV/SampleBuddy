import { useEffect, useRef, useState } from 'react'
import type { PadControllerMap, PadMidiMap } from './types'

interface ControlSettings {
  controllerMap: PadControllerMap | null
  midiMap: PadMidiMap | null
}

function loadControlSettings(storageKey: string): ControlSettings {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { controllerMap: null, midiMap: null }
    const parsed = JSON.parse(raw) as Partial<ControlSettings>
    return {
      controllerMap: parsed.controllerMap ?? null,
      midiMap: parsed.midiMap ?? null
    }
  } catch {
    return { controllerMap: null, midiMap: null }
  }
}

function saveControlSettings(storageKey: string, settings: ControlSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    // storage unavailable (e.g. quota, privacy mode) — mapping just won't persist
  }
}

interface UseControlAssignmentOptions {
  /** localStorage key — keep distinct per assignable control. */
  storageKey: string
  /** Called on the leading edge of a mapped controller button press or a
   *  mapped MIDI note-on. */
  onTrigger: () => void
}

/** Hardware mapping for a single button-like action (e.g. the Record
 *  button): one Gamepad button and/or one MIDI note, either of which fires
 *  onTrigger. Same Gamepad-polling / Web MIDI mechanics as usePadController,
 *  but for a single control rather than an 8-pad array — kept separate
 *  since a lone button only ever needs one mapping of each kind, not a
 *  per-index map. */
export function useControlAssignment({ storageKey, onTrigger }: UseControlAssignmentOptions): {
  controllerMap: PadControllerMap | null
  midiMap: PadMidiMap | null
  learningController: boolean
  learningMidi: boolean
  midiSupported: boolean
  handleLearnController: () => void
  handleClearController: () => void
  handleLearnMidi: () => void
  handleClearMidi: () => void
} {
  const initial = useRef(loadControlSettings(storageKey)).current
  const [controllerMap, setControllerMap] = useState<PadControllerMap | null>(initial.controllerMap)
  const [midiMap, setMidiMap] = useState<PadMidiMap | null>(initial.midiMap)
  const [learningController, setLearningController] = useState(false)
  const [learningMidi, setLearningMidi] = useState(false)
  const [midiSupported, setMidiSupported] = useState(false)

  useEffect(() => {
    saveControlSettings(storageKey, { controllerMap, midiMap })
  }, [controllerMap, midiMap, storageKey])

  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  // Polls the Gamepad API every frame (it has no change-events of its own)
  // to edge-detect the mapped button's press, same approach as
  // usePadController's controller mapping.
  const controllerMapRef = useRef(controllerMap)
  controllerMapRef.current = controllerMap
  const learningControllerRef = useRef(learningController)
  learningControllerRef.current = learningController

  useEffect(() => {
    let rafId: number
    const wasPressed = new Map<string, boolean>()

    function poll(): void {
      const gamepads = navigator.getGamepads()
      for (const gp of gamepads) {
        if (!gp) continue
        for (let buttonIndex = 0; buttonIndex < gp.buttons.length; buttonIndex++) {
          const key = `${gp.index}:${buttonIndex}`
          const pressed = gp.buttons[buttonIndex].pressed
          const was = wasPressed.get(key) ?? false
          wasPressed.set(key, pressed)
          if (!pressed || pressed === was) continue

          if (learningControllerRef.current) {
            setControllerMap({ gamepadId: gp.id, buttonIndex })
            setLearningController(false)
            continue
          }

          const mapping = controllerMapRef.current
          if (mapping && mapping.gamepadId === gp.id && mapping.buttonIndex === buttonIndex) {
            onTriggerRef.current()
          }
        }
      }
      rafId = requestAnimationFrame(poll)
    }

    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const midiMapRef = useRef(midiMap)
  midiMapRef.current = midiMap
  const learningMidiRef = useRef(learningMidi)
  learningMidiRef.current = learningMidi

  function handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data
    if (!data || data.length < 3) return
    const command = data[0] & 0xf0
    if (command !== 0x90 && command !== 0x80) return

    const inputId = (event.target as MIDIInput).id
    const note = data[1]
    const velocity = data[2]
    const isPress = command === 0x90 && velocity > 0
    if (!isPress) return

    if (learningMidiRef.current) {
      setMidiMap({ inputId, note })
      setLearningMidi(false)
      return
    }

    const mapping = midiMapRef.current
    if (mapping && mapping.inputId === inputId && mapping.note === note) {
      onTriggerRef.current()
    }
  }

  useEffect(() => {
    let cancelled = false
    let access: MIDIAccess | null = null

    function attachInputs(midiAccess: MIDIAccess): void {
      midiAccess.inputs.forEach((input) => {
        input.onmidimessage = handleMidiMessage
      })
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
        console.error('MIDI access unavailable — control mapping disabled', e)
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

  function handleLearnController(): void {
    setLearningController((prev) => !prev)
  }

  function handleClearController(): void {
    setControllerMap(null)
  }

  function handleLearnMidi(): void {
    setLearningMidi((prev) => !prev)
  }

  function handleClearMidi(): void {
    setMidiMap(null)
  }

  return {
    controllerMap,
    midiMap,
    learningController,
    learningMidi,
    midiSupported,
    handleLearnController,
    handleClearController,
    handleLearnMidi,
    handleClearMidi
  }
}

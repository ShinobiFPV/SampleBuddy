import { useEffect, useRef, useState, type CSSProperties } from 'react'
import PadGrid from '../../pads/PadGrid'
import { usePadController } from '../../pads/usePadController'
import { PAIR_COLORS } from '../../pads/types'

const PAD_COUNT = 8
const PLAYBACK_FILES_KEY = 'sampleBuddy.playback.padFiles.v1'

function loadFilePaths(): (string | null)[] {
  try {
    const raw = localStorage.getItem(PLAYBACK_FILES_KEY)
    if (!raw) return Array.from({ length: PAD_COUNT }, () => null)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return Array.from({ length: PAD_COUNT }, () => null)
    return Array.from({ length: PAD_COUNT }, (_, i) => (typeof parsed[i] === 'string' ? parsed[i] : null))
  } catch {
    return Array.from({ length: PAD_COUNT }, () => null)
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export default function PlaybackEditor(): JSX.Element {
  const [filePaths, setFilePaths] = useState<(string | null)[]>(() => loadFilePaths())
  const [buffers, setBuffers] = useState<Map<number, AudioBuffer>>(new Map())
  const [padErrors, setPadErrors] = useState<Record<number, string>>({})
  const [activePads, setActivePads] = useState<Set<number>>(new Set())

  const audioContextRef = useRef<AudioContext | null>(null)
  const padSourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map())
  const padGainNodesRef = useRef<Map<number, GainNode>>(new Map())

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    return audioContextRef.current
  }

  function stopAllPads(): void {
    for (const source of padSourcesRef.current.values()) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // already stopped
      }
    }
    padSourcesRef.current.clear()
    for (const gain of padGainNodesRef.current.values()) gain.disconnect()
    padGainNodesRef.current.clear()
    setActivePads(new Set())
  }

  useEffect(() => {
    return () => {
      stopAllPads()
      audioContextRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PLAYBACK_FILES_KEY, JSON.stringify(filePaths))
    } catch {
      // storage unavailable (e.g. quota, privacy mode) — assignments just won't persist
    }
  }, [filePaths])

  async function decodeFile(path: string): Promise<AudioBuffer | null> {
    try {
      const bytes = await window.sampleBuddy.audio.readFileBuffer(path)
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const ctx = getAudioContext()
      return await ctx.decodeAudioData(arrayBuffer)
    } catch {
      return null
    }
  }

  // Re-decode whatever was assigned last session. Reads the lazily-loaded
  // initial filePaths state (not the live one) since this only needs to run
  // once, on mount.
  const initialFilePaths = useRef(filePaths).current
  useEffect(() => {
    initialFilePaths.forEach((path, index) => {
      if (!path) return
      decodeFile(path).then((buffer) => {
        if (buffer) {
          setBuffers((prev) => {
            const next = new Map(prev)
            next.set(index, buffer)
            return next
          })
        } else {
          setPadErrors((prev) => ({ ...prev, [index]: 'Missing or undecodable file — reassign it.' }))
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAssignClick(index: number): Promise<void> {
    const path = await window.sampleBuddy.dialog.selectSourceFile()
    if (!path) return
    setPadErrors((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
    const buffer = await decodeFile(path)
    if (!buffer) {
      setPadErrors((prev) => ({ ...prev, [index]: 'Could not decode this file — try a different format.' }))
      return
    }
    stopPad(index)
    setBuffers((prev) => {
      const next = new Map(prev)
      next.set(index, buffer)
      return next
    })
    setFilePaths((prev) => {
      const next = [...prev]
      next[index] = path
      return next
    })
  }

  function handleClearAssignment(index: number): void {
    stopPad(index)
    setBuffers((prev) => {
      const next = new Map(prev)
      next.delete(index)
      return next
    })
    setFilePaths((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setPadErrors((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  function stopPad(index: number): void {
    const existing = padSourcesRef.current.get(index)
    if (!existing) return
    existing.onended = null
    try {
      existing.stop()
    } catch {
      // already stopped
    }
    padSourcesRef.current.delete(index)
    padGainNodesRef.current.get(index)?.disconnect()
    padGainNodesRef.current.delete(index)
    setActivePads((prev) => {
      if (!prev.has(index)) return prev
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  function startPad(index: number): void {
    const buffer = buffers.get(index)
    if (!buffer) return

    stopPad(index)
    const ctx = getAudioContext()
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = padGains[index] ?? 1
    source.buffer = buffer
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(0)
    padSourcesRef.current.set(index, source)
    padGainNodesRef.current.set(index, gain)
    setActivePads((prev) => new Set(prev).add(index))
    source.onended = () => {
      padSourcesRef.current.delete(index)
      padGainNodesRef.current.delete(index)
      setActivePads((prev) => {
        if (!prev.has(index)) return prev
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  function handlePadDown(index: number): void {
    if (!buffers.has(index)) return

    const mode = triggerModes[index]
    if (mode === 'gate') {
      if (!padSourcesRef.current.has(index)) startPad(index)
    } else if (mode === 'one-shot') {
      startPad(index)
    } else {
      if (padSourcesRef.current.has(index)) stopPad(index)
      else startPad(index)
    }
  }

  function handlePadUp(index: number): void {
    if (triggerModes[index] === 'gate') stopPad(index)
  }

  const {
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
  } = usePadController({
    padCount: PAD_COUNT,
    storageKey: 'sampleBuddy.playback.padSettings.v1',
    onPadDown: handlePadDown,
    onPadUp: handlePadUp
  })

  // Live-update any currently-sustaining pad's gain the instant its mapped
  // knob moves, not just on the pad's next trigger.
  useEffect(() => {
    for (const [index, gain] of padGainNodesRef.current) {
      gain.gain.value = padGains[index] ?? 1
    }
  }, [padGains])

  const pads = Array.from({ length: PAD_COUNT }, (_, index) => ({
    label: `P${index + 1}`,
    ready: buffers.has(index)
  }))

  return (
    <section className="panel playback-panel">
      <div className="panel-header">
        <h2>Playback</h2>
      </div>

      <p className="panel-empty">
        Click a slot below to assign a sample file to that pad, then trigger it with the mouse, keys 1-8, or a mapped
        controller/MIDI pad — right-click a slot to clear its assignment.
      </p>

      <div className="playback-assign-grid">
        {Array.from({ length: PAD_COUNT }, (_, index) => {
          const path = filePaths[index]
          const error = padErrors[index]
          const color = PAIR_COLORS[index % PAIR_COLORS.length]
          return (
            <div
              className="playback-assign-wrap"
              key={index}
              style={{ '--pad-color': color } as CSSProperties}
            >
              <button
                type="button"
                className={`playback-assign-btn${path ? ' playback-assign-set' : ''}${error ? ' playback-assign-error' : ''}`}
                onClick={() => handleAssignClick(index)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (path) handleClearAssignment(index)
                }}
                title={
                  error
                    ? error
                    : path
                      ? `${path} — click to change, right-click to clear`
                      : 'Click to assign a sample file to this pad'
                }
              >
                {path ? basename(path) : 'Assign file…'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="chop-transport">
        <span className={`chop-controller-status${gamepadConnected ? ' chop-controller-connected' : ''}`}>
          {gamepadConnected ? 'Controller connected' : 'No controller connected'}
        </span>
        {midiSupported && (
          <span className={`chop-controller-status${midiInputNames.size > 0 ? ' chop-controller-connected' : ''}`}>
            {midiInputNames.size > 0 ? 'MIDI connected' : 'No MIDI device connected'}
          </span>
        )}
      </div>

      <PadGrid
        pads={pads}
        activePads={activePads}
        triggerModes={triggerModes}
        controllerMap={controllerMap}
        midiMap={midiMap}
        midiDefaults={midiDefaults}
        knobMap={knobMap}
        knobDefaults={knobDefaults}
        padGains={padGains}
        learningPad={learningPad}
        learningMidiPad={learningMidiPad}
        learningKnobPad={learningKnobPad}
        onPadDown={handlePadDown}
        onPadUp={handlePadUp}
        onCycleTriggerMode={handleCycleTriggerMode}
        onLearnController={handleLearnController}
        onClearController={handleClearController}
        onLearnMidi={handleLearnMidi}
        onClearMidi={handleClearMidi}
        onLearnKnob={handleLearnKnob}
        onClearKnob={handleClearKnob}
      />
    </section>
  )
}

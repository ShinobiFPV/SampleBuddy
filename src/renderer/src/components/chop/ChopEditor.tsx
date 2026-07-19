import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../../format'
import WaveformCanvas from './WaveformCanvas'
import PadGrid from './PadGrid'
import {
  MAX_REGIONS,
  type ChopRegion,
  type PadControllerMap,
  type TriggerMode,
  loadPadSettings,
  nextTriggerMode,
  savePadSettings
} from './waveform'

const KEYBOARD_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

interface ChopEditorProps {
  sourcePath: string | null
  onSourcePathChange: (path: string | null) => void
  regions: ChopRegion[]
  onRegionsChange: (regions: ChopRegion[]) => void
}

export default function ChopEditor({
  sourcePath,
  onSourcePathChange,
  regions,
  onRegionsChange
}: ChopEditorProps): JSX.Element {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playheadSec, setPlayheadSec] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [activePads, setActivePads] = useState<Set<number>>(new Set())

  const initialPadSettings = useRef(loadPadSettings()).current
  const [triggerModes, setTriggerModes] = useState<TriggerMode[]>(initialPadSettings.triggerModes)
  const [controllerMap, setControllerMap] = useState<(PadControllerMap | null)[]>(
    initialPadSettings.controllerMap
  )
  const [learningPad, setLearningPad] = useState<number | null>(null)
  const [gamepadConnected, setGamepadConnected] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const transportSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const padSourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map())
  const rafRef = useRef<number | null>(null)

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    return audioContextRef.current
  }

  function stopTransport(): void {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (transportSourceRef.current) {
      transportSourceRef.current.onended = null
      try {
        transportSourceRef.current.stop()
      } catch {
        // already stopped
      }
      transportSourceRef.current = null
    }
    setPlaying(false)
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
    setActivePads(new Set())
  }

  useEffect(() => {
    return () => {
      stopTransport()
      stopAllPads()
      audioContextRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    savePadSettings({ triggerModes, controllerMap })
  }, [triggerModes, controllerMap])

  // Number keys 1-8 trigger pads AB-OP, like a hardware sampler's pad bank.
  // Kept as refs so the listeners can be attached once (not re-added on
  // every regions/audioBuffer/mode change) while still calling the latest logic.
  const handlePadDownRef = useRef<(index: number) => void>(() => {})
  const handlePadUpRef = useRef<(index: number) => void>(() => {})
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target && KEYBOARD_INPUT_TAGS.has(target.tagName)) return
      const num = Number(e.key)
      if (Number.isInteger(num) && num >= 1 && num <= MAX_REGIONS) {
        e.preventDefault()
        handlePadDownRef.current(num - 1)
      }
    }
    function handleKeyUp(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (target && KEYBOARD_INPUT_TAGS.has(target.tagName)) return
      const num = Number(e.key)
      if (Number.isInteger(num) && num >= 1 && num <= MAX_REGIONS) {
        handlePadUpRef.current(num - 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

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
          if (pressed) handlePadDownRef.current(padIndex)
          else handlePadUpRef.current(padIndex)
        }
      }
      setGamepadConnected(anyConnected)
      rafId = requestAnimationFrame(poll)
    }

    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  async function handleOpenFile(): Promise<void> {
    const path = await window.sampleBuddy.dialog.selectSourceFile()
    if (!path) return

    setLoading(true)
    setError(null)
    try {
      const bytes = await window.sampleBuddy.audio.readFileBuffer(path)
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const ctx = getAudioContext()
      const decoded = await ctx.decodeAudioData(arrayBuffer)

      stopTransport()
      stopAllPads()
      setAudioBuffer(decoded)
      setPlayheadSec(0)
      onSourcePathChange(path)
      onRegionsChange([])
    } catch {
      setError('Could not decode this file — try a different format.')
      setAudioBuffer(null)
    } finally {
      setLoading(false)
    }
  }

  function handlePlay(): void {
    if (!audioBuffer) return
    const ctx = getAudioContext()
    stopTransport()

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    const startOffset = playheadSec >= audioBuffer.duration ? 0 : playheadSec
    source.start(0, startOffset)
    transportSourceRef.current = source
    setPlaying(true)

    const ctxStartTime = ctx.currentTime
    source.onended = () => {
      setPlaying(false)
      transportSourceRef.current = null
    }

    const tick = (): void => {
      const elapsed = ctx.currentTime - ctxStartTime
      const t = Math.min(audioBuffer.duration, startOffset + elapsed)
      setPlayheadSec(t)
      if (t < audioBuffer.duration) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleSeek(sec: number): void {
    stopTransport()
    setPlayheadSec(sec)
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
    setActivePads((prev) => {
      if (!prev.has(index)) return prev
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  function startPad(index: number): void {
    if (!audioBuffer) return
    const region = regions[index]
    if (!region || region.endSec === null) return

    stopPad(index)
    const ctx = getAudioContext()
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.start(0, region.startSec, region.endSec - region.startSec)
    padSourcesRef.current.set(index, source)
    setActivePads((prev) => new Set(prev).add(index))
    source.onended = () => {
      padSourcesRef.current.delete(index)
      setActivePads((prev) => {
        if (!prev.has(index)) return prev
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  function handlePadDown(index: number): void {
    if (!audioBuffer) return
    const region = regions[index]
    if (!region || region.endSec === null) return

    const mode = triggerModesRef.current[index]
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
    if (triggerModesRef.current[index] === 'gate') stopPad(index)
  }

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

  const triggerModesRef = useRef(triggerModes)
  triggerModesRef.current = triggerModes
  handlePadDownRef.current = handlePadDown
  handlePadUpRef.current = handlePadUp

  return (
    <section className="panel chop-panel">
      <div className="panel-header">
        <h2>Chop sample</h2>
        <button className="btn-secondary" onClick={handleOpenFile} disabled={loading}>
          {sourcePath ? 'Change file…' : 'Open file…'}
        </button>
      </div>

      {sourcePath && <p className="source-dir-path">{sourcePath}</p>}
      {loading && <p className="panel-empty">Decoding…</p>}
      {error && <p className="file-row-reasons">{error}</p>}
      {!loading && !audioBuffer && !error && (
        <p className="panel-empty">Open an audio file to start chopping — click the waveform to drop markers.</p>
      )}

      {audioBuffer && (
        <>
          <WaveformCanvas
            buffer={audioBuffer}
            regions={regions}
            onRegionsChange={onRegionsChange}
            playheadSec={playheadSec}
            onSeek={handleSeek}
            zoom={zoom}
          />

          <div className="chop-transport">
            <button className="btn-secondary" onClick={playing ? stopTransport : handlePlay}>
              {playing ? 'Stop' : 'Play'}
            </button>
            <span className="chop-time">
              {formatDuration(playheadSec)} / {formatDuration(audioBuffer.duration)}
            </span>
            <label className="chop-zoom">
              Zoom
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <span className={`chop-controller-status${gamepadConnected ? ' chop-controller-connected' : ''}`}>
              {gamepadConnected ? 'Controller connected' : 'No controller connected'}
            </span>
          </div>

          <PadGrid
            regions={regions}
            activePads={activePads}
            triggerModes={triggerModes}
            controllerMap={controllerMap}
            learningPad={learningPad}
            onPadDown={handlePadDown}
            onPadUp={handlePadUp}
            onCycleTriggerMode={handleCycleTriggerMode}
            onLearnController={handleLearnController}
            onClearController={handleClearController}
          />
        </>
      )}
    </section>
  )
}

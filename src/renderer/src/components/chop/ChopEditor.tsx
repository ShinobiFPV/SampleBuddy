import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../../format'
import WaveformCanvas from './WaveformCanvas'
import PadGrid from '../../pads/PadGrid'
import { usePadController } from '../../pads/usePadController'
import { useControlAssignment } from '../../pads/useControlAssignment'
import ControlAssignBadges from '../../pads/ControlAssignBadges'
import { MAX_REGIONS, type ChopRegion, formatPairLabel } from './waveform'

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

  const audioContextRef = useRef<AudioContext | null>(null)
  const transportSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const padSourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map())
  const padGainNodesRef = useRef<Map<number, GainNode>>(new Map())
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
    for (const gain of padGainNodesRef.current.values()) gain.disconnect()
    padGainNodesRef.current.clear()
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

  async function loadFile(path: string): Promise<void> {
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

  async function handleOpenFile(): Promise<void> {
    const path = await window.sampleBuddy.dialog.selectSourceFile()
    if (!path) return
    await loadFile(path)
  }

  // Handles both a fresh mount landing on an already-set sourcePath (e.g.
  // handed off from Record mode) and returning to Chop mode after having
  // switched away — audioBuffer is local state and doesn't survive a
  // remount, so it needs reloading from the still-known path either way.
  useEffect(() => {
    if (sourcePath) loadFile(sourcePath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (!audioBuffer) return
    const region = regions[index]
    if (!region || region.endSec === null) return

    stopPad(index)
    const ctx = getAudioContext()
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = padGains[index] ?? 1
    source.buffer = audioBuffer
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(0, region.startSec, region.endSec - region.startSec)
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
    if (!audioBuffer) return
    const region = regions[index]
    if (!region || region.endSec === null) return

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
    padCount: MAX_REGIONS,
    storageKey: 'sampleBuddy.chop.padSettings.v1',
    onPadDown: handlePadDown,
    onPadUp: handlePadUp
  })

  const transportControl = useControlAssignment({
    storageKey: 'sampleBuddy.chop.transportControlMap.v1',
    onTrigger: () => (playing ? stopTransport() : handlePlay())
  })

  // Live-update any currently-sustaining pad's gain the instant its mapped
  // knob moves, not just on the pad's next trigger.
  useEffect(() => {
    for (const [index, gain] of padGainNodesRef.current) {
      gain.gain.value = padGains[index] ?? 1
    }
  }, [padGains])

  const pads = Array.from({ length: MAX_REGIONS }, (_, index) => {
    const region = regions[index]
    return { label: formatPairLabel(index), ready: !!region && region.endSec !== null }
  })

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
            <ControlAssignBadges
              actionLabel="Play/Stop"
              controllerMap={transportControl.controllerMap}
              midiMap={transportControl.midiMap}
              learningController={transportControl.learningController}
              learningMidi={transportControl.learningMidi}
              onLearnController={transportControl.handleLearnController}
              onClearController={transportControl.handleClearController}
              onLearnMidi={transportControl.handleLearnMidi}
              onClearMidi={transportControl.handleClearMidi}
            />
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
        </>
      )}
    </section>
  )
}

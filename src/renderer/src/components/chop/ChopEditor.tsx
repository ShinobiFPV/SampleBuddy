import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../../format'
import WaveformCanvas from './WaveformCanvas'
import PadGrid from './PadGrid'
import type { ChopRegion } from './waveform'

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

  function handlePadToggle(index: number): void {
    if (!audioBuffer) return
    const region = regions[index]
    if (!region || region.endSec === null) return

    const existing = padSourcesRef.current.get(index)
    if (existing) {
      existing.onended = null
      try {
        existing.stop()
      } catch {
        // already stopped
      }
      padSourcesRef.current.delete(index)
      setActivePads((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
      return
    }

    const ctx = getAudioContext()
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    const endSec = region.endSec
    source.start(0, region.startSec, endSec - region.startSec)
    padSourcesRef.current.set(index, source)
    setActivePads((prev) => new Set(prev).add(index))
    source.onended = () => {
      padSourcesRef.current.delete(index)
      setActivePads((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

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
          </div>

          <PadGrid regions={regions} activePads={activePads} onToggle={handlePadToggle} />
        </>
      )}
    </section>
  )
}

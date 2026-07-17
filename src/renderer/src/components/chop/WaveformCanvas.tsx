import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { type ChopRegion, MAX_REGIONS, PAIR_COLORS, clamp, computePeaks, labelForIndex } from './waveform'

interface WaveformCanvasProps {
  buffer: AudioBuffer
  regions: ChopRegion[]
  onRegionsChange: (regions: ChopRegion[]) => void
  playheadSec: number
  onSeek: (sec: number) => void
  zoom: number
}

const CANVAS_HEIGHT = 180
const HANDLE_HIT_RADIUS = 8

interface HandleRef {
  regionIndex: number
  which: 'start' | 'end'
}

function findHandleNear(regions: ChopRegion[], x: number, pxPerSec: number): HandleRef | null {
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const startX = region.startSec * pxPerSec
    if (Math.abs(startX - x) <= HANDLE_HIT_RADIUS) return { regionIndex: i, which: 'start' }
    if (region.endSec !== null) {
      const endX = region.endSec * pxPerSec
      if (Math.abs(endX - x) <= HANDLE_HIT_RADIUS) return { regionIndex: i, which: 'end' }
    }
  }
  return null
}

export default function WaveformCanvas({
  buffer,
  regions,
  onRegionsChange,
  playheadSec,
  onSeek,
  zoom
}: WaveformCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<HandleRef | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const canvasWidth = Math.max(1, Math.round(containerWidth * zoom))
  const durationSec = buffer.duration
  const pxPerSec = canvasWidth / durationSec

  const peaks = useMemo(() => computePeaks(buffer, canvasWidth), [buffer, canvasWidth])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${CANVAS_HEIGHT}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT)
    ctx.fillStyle = '#0f0f0f'
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT)

    // Region tints, drawn before the waveform so the waveform stays legible on top.
    regions.forEach((region, index) => {
      const color = PAIR_COLORS[index % PAIR_COLORS.length]
      const startX = region.startSec * pxPerSec
      const endX = (region.endSec ?? region.startSec) * pxPerSec
      ctx.fillStyle = `${color}26`
      ctx.fillRect(Math.min(startX, endX), 0, Math.max(1, Math.abs(endX - startX)), CANVAS_HEIGHT)
    })

    // Waveform peaks.
    const mid = CANVAS_HEIGHT / 2
    ctx.strokeStyle = '#ffd633'
    ctx.beginPath()
    for (let x = 0; x < canvasWidth; x++) {
      const yMin = mid + peaks.min[x] * mid
      const yMax = mid + peaks.max[x] * mid
      ctx.moveTo(x + 0.5, yMin)
      ctx.lineTo(x + 0.5, yMax)
    }
    ctx.stroke()

    // Marker handles + letter labels.
    regions.forEach((region, index) => {
      const color = PAIR_COLORS[index % PAIR_COLORS.length]
      const [startLabel, endLabel] = labelForIndex(index)

      const startX = region.startSec * pxPerSec
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(startX, 0)
      ctx.lineTo(startX, CANVAS_HEIGHT)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.font = 'bold 11px Segoe UI, system-ui, sans-serif'
      ctx.fillText(startLabel, startX + 3, 12)

      if (region.endSec !== null) {
        const endX = region.endSec * pxPerSec
        ctx.beginPath()
        ctx.moveTo(endX, 0)
        ctx.lineTo(endX, CANVAS_HEIGHT)
        ctx.stroke()
        ctx.fillText(endLabel, endX + 3, 12)
      }
    })

    // Playhead.
    const playheadX = playheadSec * pxPerSec
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, CANVAS_HEIGHT)
    ctx.stroke()
  }, [regions, peaks, canvasWidth, pxPerSec, playheadSec])

  function timeFromEvent(e: PointerEvent<HTMLCanvasElement>): number {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    return clamp(x / pxPerSec, 0, durationSec)
  }

  function xFromEvent(e: PointerEvent<HTMLCanvasElement>): number {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX - rect.left
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>): void {
    const x = xFromEvent(e)
    const hit = findHandleNear(regions, x, pxPerSec)
    if (hit) {
      dragRef.current = hit
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    const time = timeFromEvent(e)
    const next = [...regions]
    const last = next[next.length - 1]
    if (!last || last.endSec !== null) {
      if (next.length >= MAX_REGIONS) return
      next.push({ id: `${Date.now()}-${next.length}`, startSec: time, endSec: null })
    } else {
      const endSec = time < last.startSec ? last.startSec : time
      const startSec = time < last.startSec ? time : last.startSec
      next[next.length - 1] = { ...last, startSec, endSec }
    }
    onRegionsChange(next)
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current
    if (!drag) return
    const time = timeFromEvent(e)
    const next = [...regions]
    const region = next[drag.regionIndex]
    if (!region) return
    if (drag.which === 'start') {
      const maxBound = region.endSec ?? durationSec
      next[drag.regionIndex] = { ...region, startSec: clamp(time, 0, maxBound) }
    } else {
      next[drag.regionIndex] = { ...region, endSec: clamp(time, region.startSec, durationSec) }
    }
    onRegionsChange(next)
  }

  function handlePointerUp(): void {
    dragRef.current = null
  }

  function handleDoubleClick(e: MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const hit = findHandleNear(regions, x, pxPerSec)
    if (!hit) return
    onRegionsChange(regions.filter((_, i) => i !== hit.regionIndex))
  }

  function handleRulerPointerDown(e: PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    onSeek(clamp(x / pxPerSec, 0, durationSec))
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleRulerPointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (e.buttons !== 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    onSeek(clamp(x / pxPerSec, 0, durationSec))
  }

  return (
    <div className="waveform-scroll" ref={containerRef}>
      <div
        className="waveform-ruler"
        style={{ width: canvasWidth }}
        onPointerDown={handleRulerPointerDown}
        onPointerMove={handleRulerPointerMove}
      />
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  )
}

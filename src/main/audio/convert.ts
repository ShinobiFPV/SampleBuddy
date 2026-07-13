import { spawn } from 'child_process'
import { getFfmpegPath } from './ffmpegPaths'
import type { DeviceProfile } from '../profiles/types'

const PCM_CODEC_BY_BIT_DEPTH: Record<number, string> = {
  16: 'pcm_s16le',
  24: 'pcm_s24le'
}

/** Parses ffmpeg's `time=00:01:23.45` progress lines out of its stderr
 *  stream (ffmpeg has no machine-readable progress option that's simpler
 *  than this for a single-file, non-streaming conversion). */
function parseTimeSeconds(line: string): number | null {
  const match = line.match(/time=(\d+):(\d{2}):(\d{2})\.(\d+)/)
  if (!match) return null
  const [, hh, mm, ss] = match
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss)
}

export interface ConvertOptions {
  inputPath: string
  outputPath: string
  /** The source file's probed duration — used as the progress denominator
   *  (or, if truncating, whichever is shorter). */
  sourceDurationSec: number
  profile: DeviceProfile
  truncateToSec?: number
  onProgress?: (fractionComplete: number) => void
}

export function convertFile(opts: ConvertOptions): Promise<void> {
  const { inputPath, outputPath, sourceDurationSec, profile, truncateToSec, onProgress } = opts

  const args = ['-y', '-i', inputPath]
  if (truncateToSec) args.push('-t', String(truncateToSec))

  args.push('-ar', String(profile.audio.sampleRate))
  args.push('-acodec', PCM_CODEC_BY_BIT_DEPTH[profile.audio.bitDepth] ?? 'pcm_s16le')
  if (profile.audio.channels === 'mono') args.push('-ac', '1')
  else if (profile.audio.channels === 'stereo') args.push('-ac', '2')

  args.push(outputPath)

  const totalDurationSec =
    truncateToSec && sourceDurationSec ? Math.min(truncateToSec, sourceDurationSec) : sourceDurationSec || Infinity

  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args)
    let stderr = ''

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      if (onProgress && Number.isFinite(totalDurationSec)) {
        const elapsed = parseTimeSeconds(text)
        if (elapsed !== null) onProgress(Math.min(1, elapsed / totalDurationSec))
      }
    })

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.(1)
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code} converting ${inputPath}:\n${stderr.slice(-2000)}`))
      }
    })
  })
}

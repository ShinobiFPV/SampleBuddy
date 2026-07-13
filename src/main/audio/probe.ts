import { execFile } from 'child_process'
import { basename } from 'path'
import { promisify } from 'util'
import { getFfprobePath } from './ffmpegPaths'
import type { ProbedAudioFile } from '../../shared/ipc'

const execFileAsync = promisify(execFile)

interface FfprobeStream {
  codec_type: string
  codec_name?: string
  sample_rate?: string
  channels?: number
  bits_per_raw_sample?: string
  bits_per_sample?: number
  duration?: string
}

interface FfprobeFormat {
  format_name?: string
  duration?: string
  size?: string
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

/** PCM sample formats ffprobe reports for uncompressed WAV/AIFF streams —
 *  used to recover a bit depth when neither bits_per_raw_sample nor
 *  bits_per_sample is present in the stream metadata. */
const PCM_CODEC_BIT_DEPTH: Record<string, number> = {
  pcm_s16le: 16,
  pcm_s16be: 16,
  pcm_u8: 8,
  pcm_s24le: 24,
  pcm_s24be: 24,
  pcm_s32le: 32,
  pcm_s32be: 32,
  pcm_f32le: 32
}

function shortFormatName(formatName: string | undefined): string {
  // ffprobe's format_name for a WAV file is "wav", for MP3 it's often
  // "mp3", but some containers report a comma-separated alias list (e.g.
  // AIFF as "aiff,rf64") — the first entry is the one that matters here.
  return (formatName ?? 'unknown').split(',')[0]
}

export async function probeFile(path: string): Promise<ProbedAudioFile> {
  const { stdout } = await execFileAsync(getFfprobePath(), [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    path
  ])

  const parsed: FfprobeOutput = JSON.parse(stdout)
  const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio')

  const bitDepth =
    (audioStream?.bits_per_raw_sample ? Number(audioStream.bits_per_raw_sample) : null) ??
    audioStream?.bits_per_sample ??
    (audioStream?.codec_name ? PCM_CODEC_BIT_DEPTH[audioStream.codec_name] ?? null : null)

  const durationSec = Number(audioStream?.duration ?? parsed.format?.duration ?? 0)

  return {
    path,
    filename: basename(path),
    format: shortFormatName(parsed.format?.format_name),
    bitDepth: bitDepth || null,
    sampleRate: Number(audioStream?.sample_rate ?? 0),
    channels: audioStream?.channels ?? 0,
    durationSec,
    sizeBytes: Number(parsed.format?.size ?? 0)
  }
}

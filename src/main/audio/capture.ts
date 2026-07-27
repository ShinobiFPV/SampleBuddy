import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { RtAudio, RtAudioApi, RtAudioFormat } from 'audify'
import { getFfmpegPath } from './ffmpegPaths'
import { getAsioControlPanelPath } from './asioControlPanelPath'
import { probeFile } from './probe'
import { ensureRecordingsDir } from './workspace'
import type { RecordDeviceInfo, RecordLevelEvent, RecordStartRequest, RecordStartResult, RecordStopResult } from '../../shared/ipc'

const LEVEL_SEND_INTERVAL_MS = 33 // ~30Hz — the input callback fires far more often than this

// audify's openStream requires an actual number for `flags` — passing
// `undefined` to fill the slot before the trailing errorCallback throws "A
// number was expected" at runtime, and RtAudioStreamFlags isn't exported
// from its type declarations despite appearing in this public signature, so
// the "no flags" value is extracted from the method's own parameter types.
const NO_STREAM_FLAGS = 0 as Parameters<RtAudio['openStream']>[8]

interface Session {
  rtAudio: RtAudio
  ffmpeg: ChildProcessWithoutNullStreams
  outputPath: string
  levelTimer: ReturnType<typeof setInterval>
  latestLevel: RecordLevelEvent
}

let session: Session | null = null

export function listInputDevices(): RecordDeviceInfo[] {
  const rtAudio = new RtAudio(RtAudioApi.WINDOWS_ASIO)
  return rtAudio
    .getDevices()
    .filter((d) => d.inputChannels > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      inputChannels: d.inputChannels,
      isDefaultInput: Boolean(d.isDefaultInput),
      preferredSampleRate: d.preferredSampleRate
    }))
}

function timestampedFilename(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-')
  return `recording-${iso}.wav`
}

/** Peak/RMS over one interleaved 16-bit PCM buffer, both normalized 0-1. */
function computeLevel(pcm: Buffer): RecordLevelEvent {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2)
  let peak = 0
  let sumSquares = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > peak) peak = abs
    sumSquares += samples[i] * samples[i]
  }
  const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0
  return { peak: peak / 32768, rms: rms / 32768 }
}

export async function startRecording(
  request: RecordStartRequest,
  onLevel: (level: RecordLevelEvent) => void
): Promise<RecordStartResult> {
  if (session) return { ok: false, error: 'A recording is already in progress' }

  const device = listInputDevices().find((d) => d.id === request.deviceId)
  if (!device) return { ok: false, error: 'Selected input device is no longer available' }

  const channels = Math.min(2, device.inputChannels)
  const sampleRate = device.preferredSampleRate
  const recordingsDir = await ensureRecordingsDir()
  const outputPath = join(recordingsDir, timestampedFilename())

  const ffmpeg = spawn(getFfmpegPath(), [
    '-y',
    '-f',
    's16le',
    '-ar',
    String(sampleRate),
    '-ac',
    String(channels),
    '-i',
    'pipe:0',
    outputPath
  ]) as ChildProcessWithoutNullStreams

  const rtAudio = new RtAudio(RtAudioApi.WINDOWS_ASIO)

  const newSession: Session = {
    rtAudio,
    ffmpeg,
    outputPath,
    latestLevel: { peak: 0, rms: 0 },
    levelTimer: setInterval(() => onLevel(newSession.latestLevel), LEVEL_SEND_INTERVAL_MS)
  }

  try {
    rtAudio.openStream(
      null,
      { deviceId: device.id, nChannels: channels },
      RtAudioFormat.RTAUDIO_SINT16,
      sampleRate,
      0,
      'samplebuddy-record',
      (pcm: Buffer) => {
        if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.write(pcm)
        newSession.latestLevel = computeLevel(pcm)
      },
      null,
      NO_STREAM_FLAGS,
      (_type, msg) => console.error('ASIO stream error:', msg)
    )
    rtAudio.start()
  } catch (e) {
    clearInterval(newSession.levelTimer)
    ffmpeg.kill()
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  session = newSession
  return { ok: true }
}

export async function stopRecording(): Promise<RecordStopResult> {
  if (!session) throw new Error('No recording in progress')
  const { rtAudio, ffmpeg, outputPath, levelTimer } = session
  session = null

  clearInterval(levelTimer)
  rtAudio.stop()
  rtAudio.closeStream()

  await new Promise<void>((resolve, reject) => {
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))))
    ffmpeg.stdin.end()
  })

  const probed = await probeFile(outputPath)
  return { filePath: outputPath, durationSec: probed.durationSec }
}

/** Launches the native ASIO control-panel helper (see
 *  native/asio-control-panel/README.md) for the given driver name and
 *  leaves it running detached — it opens the driver's own settings window
 *  (e.g. ASIO4ALL's) and stays up until the user closes it, independent of
 *  SampleBuddy. ASIO drivers only allow one exclusive host at a time, so
 *  this can't run alongside an active recording (which already holds the
 *  driver open via `session.rtAudio`). */
export async function openAsioControlPanel(driverName: string): Promise<RecordStartResult> {
  if (session) return { ok: false, error: 'Stop the current recording before opening ASIO settings' }

  return new Promise((resolve) => {
    const child = spawn(getAsioControlPanelPath(), [driverName], {
      windowsHide: true
    }) as ChildProcessWithoutNullStreams
    let settled = false
    let stderr = ''

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (e) => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: e.message })
      }
    })
    // The helper only exits this early if it hit a startup error (bad
    // driver name, or init() failing because something else has the
    // driver open) — once its settings window is up it runs until the
    // user closes it, which we don't wait for.
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        settled = true
        resolve({ ok: false, error: stderr.trim() || `ASIO control panel exited with code ${code}` })
      }
    })
    setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ ok: true })
      }
    }, 1500)
  })
}

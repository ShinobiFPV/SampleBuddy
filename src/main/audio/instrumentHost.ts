import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { getVstHostPath } from './instrumentPaths'
import { probeFile } from './probe'
import { ensureRecordingsDir } from './workspace'
import type {
  InstrumentDeviceInfo,
  InstrumentStartRequest,
  InstrumentStartResult,
  RecordStopResult
} from '../../shared/ipc'

interface Session {
  child: ChildProcessWithoutNullStreams
  /** Resolves the in-flight stopCapture() promise once the host's
   *  "CAPTURE_DONE <path>" line arrives — null when no capture is stopping. */
  pendingCaptureStop: ((path: string) => void) | null
}

let session: Session | null = null

function timestampedFilename(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-')
  return `instrument-${iso}.wav`
}

/** Spawns the host briefly with --list-devices to enumerate ASIO output
 *  devices, without loading a plugin or opening a session. */
export async function listOutputDevices(): Promise<InstrumentDeviceInfo[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(getVstHostPath(), ['--list-devices']) as ChildProcessWithoutNullStreams
    let buffer = ''

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', () => {
      const devices: InstrumentDeviceInfo[] = []
      for (const line of buffer.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed: unknown = JSON.parse(trimmed)
          if (parsed && typeof parsed === 'object' && typeof (parsed as { name?: unknown }).name === 'string') {
            devices.push({ name: (parsed as { name: string }).name })
          }
        } catch {
          // ignore non-JSON stdout noise (e.g. JUCE resource warnings)
        }
      }
      resolve(devices)
    })
  })
}

/** Handles one line of the host's stdout that isn't part of the
 *  start/READY handshake (that's inlined in startInstrument). */
function handleHostLine(line: string, activeSession: Session): void {
  if (line.startsWith('CAPTURE_DONE ')) {
    const path = line.slice('CAPTURE_DONE '.length).trim()
    activeSession.pendingCaptureStop?.(path)
    activeSession.pendingCaptureStop = null
  }
}

export async function startInstrument(request: InstrumentStartRequest): Promise<InstrumentStartResult> {
  if (session) return { ok: false, error: 'An instrument is already loaded' }

  return new Promise((resolve) => {
    const child = spawn(getVstHostPath(), [
      '--plugin',
      request.pluginPath,
      '--device',
      request.deviceName
    ]) as ChildProcessWithoutNullStreams

    const newSession: Session = { child, pendingCaptureStop: null }
    let settled = false
    let buffer = ''

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) continue

        if (!settled && line === 'READY') {
          settled = true
          session = newSession
          resolve({ ok: true })
        } else if (!settled && line.startsWith('ERROR')) {
          settled = true
          resolve({ ok: false, error: line.replace(/^ERROR\s*/, '') })
        } else {
          handleHostLine(line, newSession)
        }
      }
    })

    child.stderr.on('data', () => {
      // Kontakt/JUCE resource-lookup warnings land here — harmless, not surfaced.
    })

    child.on('exit', () => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'Host process exited unexpectedly before it finished loading' })
      }
      if (session?.child === child) session = null
    })

    child.on('error', (e) => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: e.message })
      }
    })
  })
}

/** Fire-and-forget by design — matches the renderer's fire-and-forget IPC
 *  channel for note events (see shared/ipc.ts). No-ops if nothing is loaded. */
export function sendMidiNote(note: number, velocity: number, isOn: boolean): void {
  session?.child.stdin.write(`midi ${note} ${velocity} ${isOn ? 'on' : 'off'}\n`)
}

export async function startCapture(): Promise<void> {
  if (!session) throw new Error('No instrument loaded')
  const recordingsDir = await ensureRecordingsDir()
  const outputPath = join(recordingsDir, timestampedFilename())
  session.child.stdin.write(`capture start ${outputPath}\n`)
}

export async function stopCapture(): Promise<RecordStopResult> {
  if (!session) throw new Error('No instrument loaded')
  const activeSession = session

  const filePath = await new Promise<string>((resolve) => {
    activeSession.pendingCaptureStop = resolve
    activeSession.child.stdin.write('capture stop\n')
  })

  // The host's WAV writer flushes and closes on a background thread — by
  // the time CAPTURE_DONE reaches here the file is fully written, but the OS
  // (or a real-time antivirus scan of the freshly-created file) can hold the
  // handle just long enough that ffprobe's very next open sees a transient
  // sharing violation. A short retry clears this up rather than the whole
  // capture silently failing to hand off a result.
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const probed = await probeFile(filePath)
      return { filePath, durationSec: probed.durationSec }
    } catch (e) {
      lastError = e
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not read the captured file')
}

export async function stopInstrument(): Promise<void> {
  if (!session) return
  const { child } = session
  session = null

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill()
      resolve()
    }, 3000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.stdin.write('panic\nquit\n')
  })
}

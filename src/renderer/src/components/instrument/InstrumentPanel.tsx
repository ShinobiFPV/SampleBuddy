import { useEffect, useRef, useState } from 'react'
import type { InstrumentDeviceInfo } from '../../../../shared/ipc'

interface InstrumentPanelProps {
  onSendToChop: (filePath: string) => void
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

const PLUGIN_PATH_KEY = 'sampleBuddy.instrument.pluginPath.v1'
const DEFAULT_PLUGIN_PATH = 'C:\\Program Files\\Common Files\\VST3\\Kontakt 7.vst3'

function loadPluginPath(): string {
  try {
    return localStorage.getItem(PLUGIN_PATH_KEY) ?? DEFAULT_PLUGIN_PATH
  } catch {
    return DEFAULT_PLUGIN_PATH
  }
}

export default function InstrumentPanel({ onSendToChop }: InstrumentPanelProps): JSX.Element {
  const [pluginPath, setPluginPath] = useState(() => loadPluginPath())
  const [devices, setDevices] = useState<InstrumentDeviceInfo[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [selectedDeviceName, setSelectedDeviceName] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [capturedFile, setCapturedFile] = useState<{ filePath: string; durationSec: number } | null>(null)
  const [midiSupported, setMidiSupported] = useState(false)
  const [midiInputNames, setMidiInputNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    try {
      localStorage.setItem(PLUGIN_PATH_KEY, pluginPath)
    } catch {
      // storage unavailable (e.g. quota, privacy mode) — path just won't persist
    }
  }, [pluginPath])

  useEffect(() => {
    window.sampleBuddy.instrument
      .listDevices()
      .then((list) => {
        setDevices(list)
        if (list.length > 0) setSelectedDeviceName((prev) => prev ?? list[0].name)
      })
      .finally(() => setLoadingDevices(false))
  }, [])

  // Raw MIDI pass-through — every note from any connected input goes
  // straight to the loaded plugin (unlike the pad-mapped system on the Chop
  // and Playback pages), since this page is for playing an instrument.
  const statusRef = useRef(status)
  statusRef.current = status
  useEffect(() => {
    let cancelled = false
    let access: MIDIAccess | null = null

    function handleMidiMessage(event: MIDIMessageEvent): void {
      if (statusRef.current !== 'ready') return
      const data = event.data
      if (!data || data.length < 3) return
      const command = data[0] & 0xf0
      if (command !== 0x90 && command !== 0x80) return

      const note = data[1]
      const velocity = data[2]
      window.sampleBuddy.instrument.sendMidiEvent({ note, velocity, on: command === 0x90 && velocity > 0 })
    }

    function attachInputs(midiAccess: MIDIAccess): void {
      const names = new Map<string, string>()
      midiAccess.inputs.forEach((input) => {
        names.set(input.id, input.name ?? input.id)
        input.onmidimessage = handleMidiMessage
      })
      setMidiInputNames(names)
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
        console.error('MIDI access unavailable — Instrument page needs it to play', e)
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
  }, [])

  // Leaving the page (or closing the app) always tears down the session —
  // stopInstrument() on the main side sends panic+quit to the host so no
  // notes stay stuck and no vst-host.exe is left running.
  useEffect(() => {
    return () => {
      if (statusRef.current === 'ready' || statusRef.current === 'loading') {
        window.sampleBuddy.instrument.stop()
      }
    }
  }, [])

  async function handleChoosePlugin(): Promise<void> {
    const path = await window.sampleBuddy.dialog.selectVst3File()
    if (path) setPluginPath(path)
  }

  async function handleLoad(): Promise<void> {
    if (!selectedDeviceName || !pluginPath) return
    setStatus('loading')
    setError(null)
    const result = await window.sampleBuddy.instrument.start({ pluginPath, deviceName: selectedDeviceName })
    if (result.ok) {
      setStatus('ready')
    } else {
      setStatus('error')
      setError(result.error)
    }
  }

  async function handleUnload(): Promise<void> {
    await window.sampleBuddy.instrument.stop()
    setStatus('idle')
    setCapturing(false)
    setCapturedFile(null)
  }

  async function handleStartCapture(): Promise<void> {
    setCapturedFile(null)
    setError(null)
    try {
      await window.sampleBuddy.instrument.captureStart()
      setCapturing(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start capture.')
    }
  }

  async function handleStopCapture(): Promise<void> {
    setCapturing(false)
    try {
      const result = await window.sampleBuddy.instrument.captureStop()
      setCapturedFile(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop capture.')
    }
  }

  return (
    <section className="panel instrument-panel">
      <div className="panel-header">
        <h2>Instrument</h2>
      </div>

      <p className="panel-empty">
        Load a VST3 instrument, play it live from any connected MIDI device (the MPK's full keybed, not just its
        pads), and capture the performance as a sample.
      </p>

      <label className="record-device-field">
        Plugin
        <div className="instrument-plugin-row">
          <span className="source-dir-path">{pluginPath || 'No plugin selected'}</span>
          <button className="btn-secondary" onClick={handleChoosePlugin} disabled={status === 'loading'}>
            Choose plugin…
          </button>
        </div>
      </label>

      {loadingDevices && <p className="panel-empty">Looking for ASIO output devices…</p>}
      {!loadingDevices && devices.length === 0 && (
        <p className="panel-empty">No ASIO output devices found — check your audio interface's ASIO driver.</p>
      )}

      {!loadingDevices && devices.length > 0 && (
        <label className="record-device-field">
          Output device
          <select
            className="profile-picker"
            value={selectedDeviceName ?? ''}
            disabled={status === 'ready' || status === 'loading'}
            onChange={(e) => setSelectedDeviceName(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="chop-transport">
        {status === 'idle' && (
          <button
            className="btn-secondary"
            onClick={handleLoad}
            disabled={!selectedDeviceName || !pluginPath}
          >
            Load
          </button>
        )}
        {status === 'loading' && <span className="chop-controller-status">Loading…</span>}
        {status === 'ready' && (
          <button className="btn-secondary" onClick={handleUnload}>
            Unload
          </button>
        )}
        {status === 'error' && (
          <button className="btn-secondary" onClick={handleLoad}>
            Retry
          </button>
        )}

        <span className={`chop-controller-status${status === 'ready' ? ' chop-controller-connected' : ''}`}>
          {status === 'ready' ? 'Instrument ready' : status === 'error' ? 'Failed to load' : 'Not loaded'}
        </span>

        {midiSupported && (
          <span className={`chop-controller-status${midiInputNames.size > 0 ? ' chop-controller-connected' : ''}`}>
            {midiInputNames.size > 0 ? 'MIDI connected' : 'No MIDI device connected'}
          </span>
        )}
      </div>

      {error && <p className="file-row-reasons">{error}</p>}

      {status === 'ready' && (
        <div className="record-result">
          <button className={`btn-record${capturing ? ' btn-record-active' : ''}`} onClick={capturing ? handleStopCapture : handleStartCapture}>
            {capturing ? 'Stop Capture' : 'Start Capture'}
          </button>

          {capturedFile && !capturing && (
            <div className="record-result">
              <p className="source-dir-path">{capturedFile.filePath}</p>
              <button className="btn-secondary" onClick={() => onSendToChop(capturedFile.filePath)}>
                Send to Chop Editor
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

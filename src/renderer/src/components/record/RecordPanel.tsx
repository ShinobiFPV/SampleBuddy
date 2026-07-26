import { useEffect, useRef, useState } from 'react'
import type { RecordDeviceInfo } from '../../../../shared/ipc'

interface RecordPanelProps {
  onSendToChop: (filePath: string) => void
}

export default function RecordPanel({ onSendToChop }: RecordPanelProps): JSX.Element {
  const [devices, setDevices] = useState<RecordDeviceInfo[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState({ peak: 0, rms: 0 })
  const [recordedFile, setRecordedFile] = useState<{ filePath: string; durationSec: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.sampleBuddy.record
      .listInputDevices()
      .then((list) => {
        setDevices(list)
        const preferred = list.find((d) => d.isDefaultInput) ?? list[0]
        if (preferred) setSelectedDeviceId(preferred.id)
      })
      .finally(() => setLoadingDevices(false))
  }, [])

  const unsubscribeLevelRef = useRef<(() => void) | null>(null)

  async function handleToggleRecord(): Promise<void> {
    if (recording) {
      unsubscribeLevelRef.current?.()
      unsubscribeLevelRef.current = null
      setRecording(false)
      try {
        const result = await window.sampleBuddy.record.stop()
        setRecordedFile(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Recording failed to finalize.')
      }
      return
    }

    if (selectedDeviceId === null) return
    setError(null)
    setRecordedFile(null)
    const result = await window.sampleBuddy.record.start({ deviceId: selectedDeviceId })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setLevel({ peak: 0, rms: 0 })
    unsubscribeLevelRef.current = window.sampleBuddy.record.onLevel(setLevel)
    setRecording(true)
  }

  useEffect(() => {
    return () => unsubscribeLevelRef.current?.()
  }, [])

  return (
    <section className="panel record-panel">
      <div className="panel-header">
        <h2>Record</h2>
      </div>

      {loadingDevices && <p className="panel-empty">Looking for ASIO input devices…</p>}
      {!loadingDevices && devices.length === 0 && (
        <p className="panel-empty">No ASIO input devices found — check your audio interface's ASIO driver.</p>
      )}

      {!loadingDevices && devices.length > 0 && (
        <>
          <label className="record-device-field">
            Input device
            <select
              className="profile-picker"
              value={selectedDeviceId ?? ''}
              disabled={recording}
              onChange={(e) => setSelectedDeviceId(Number(e.target.value))}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.inputChannels}ch, {d.preferredSampleRate}Hz)
                </option>
              ))}
            </select>
          </label>

          <div className="record-meter">
            <div className="record-meter-fill" style={{ width: `${Math.min(1, level.peak) * 100}%` }} />
          </div>

          <button className={`btn-record${recording ? ' btn-record-active' : ''}`} onClick={handleToggleRecord}>
            {recording ? 'Stop' : 'Record'}
          </button>

          {error && <p className="file-row-reasons">{error}</p>}

          {recordedFile && !recording && (
            <div className="record-result">
              <p className="source-dir-path">{recordedFile.filePath}</p>
              <button className="btn-secondary" onClick={() => onSendToChop(recordedFile.filePath)}>
                Send to Chop Editor
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

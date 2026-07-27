import { useEffect, useRef, useState } from 'react'
import type { RecordDeviceInfo } from '../../../../shared/ipc'
import { useControlAssignment } from '../../pads/useControlAssignment'
import ControlAssignBadges from '../../pads/ControlAssignBadges'

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

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null

  async function handleOpenAsioSettings(): Promise<void> {
    if (!selectedDevice) return
    setError(null)
    const result = await window.sampleBuddy.record.openAsioControlPanel(selectedDevice.name)
    if (!result.ok) setError(result.error)
  }

  useEffect(() => {
    return () => unsubscribeLevelRef.current?.()
  }, [])

  const control = useControlAssignment({
    storageKey: 'sampleBuddy.record.controlMap.v1',
    onTrigger: handleToggleRecord
  })

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
            <div className="record-device-row">
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
              <button
                type="button"
                className="btn-secondary"
                disabled={recording || !selectedDevice}
                onClick={handleOpenAsioSettings}
                title="Open this ASIO driver's own settings panel (e.g. ASIO4ALL's input configuration)"
              >
                ASIO Settings…
              </button>
            </div>
          </label>

          <div className="record-meter">
            <div className="record-meter-fill" style={{ width: `${Math.min(1, level.peak) * 100}%` }} />
          </div>

          <button className={`btn-record${recording ? ' btn-record-active' : ''}`} onClick={handleToggleRecord}>
            {recording ? 'Stop' : 'Record'}
          </button>

          <ControlAssignBadges
            actionLabel="Record"
            controllerMap={control.controllerMap}
            midiMap={control.midiMap}
            learningController={control.learningController}
            learningMidi={control.learningMidi}
            onLearnController={control.handleLearnController}
            onClearController={control.handleClearController}
            onLearnMidi={control.handleLearnMidi}
            onClearMidi={control.handleClearMidi}
          />

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

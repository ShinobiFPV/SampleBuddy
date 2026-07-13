import type { DeviceProfile, DriveComplianceResult, DriveInfo, DriveUploadProgressEvent } from '../../../shared/ipc'
import { formatBytes } from '../format'

interface DrivePanelProps {
  profile: DeviceProfile | undefined
  outputDir: string | null
  checkedCount: number
  onOpenStagingFolder: () => void
  drives: DriveInfo[]
  loadingDrives: boolean
  onRefreshDrives: () => void
  selectedDriveLetter: string | null
  onSelectDrive: (driveLetter: string) => void
  compliance: DriveComplianceResult | null
  checkingCompliance: boolean
  uploading: boolean
  uploadProgress: DriveUploadProgressEvent | null
  uploadedFilenames: string[] | null
  onUploadClick: () => void
  group: string
  onGroupChange: (group: string) => void
  ejectingDriveLetter: string | null
  ejectMessage: { driveLetter: string; message: string } | null
  onEjectClick: (driveLetter: string) => void
}

export default function DrivePanel({
  profile,
  outputDir,
  checkedCount,
  onOpenStagingFolder,
  drives,
  loadingDrives,
  onRefreshDrives,
  selectedDriveLetter,
  onSelectDrive,
  compliance,
  checkingCompliance,
  uploading,
  uploadProgress,
  uploadedFilenames,
  onUploadClick,
  group,
  onGroupChange,
  ejectingDriveLetter,
  ejectMessage,
  onEjectClick
}: DrivePanelProps): JSX.Element {
  const isStagingFolder = profile?.transferMethod === 'staging-folder'

  if (isStagingFolder) {
    return (
      <section className="panel drive-panel">
        <h2>Drive upload</h2>
        <div className="drive-staging">
          <p className="drive-staging-note">
            {profile?.displayName} imports from a staging folder rather than a removable drive.
          </p>
          <button className="btn-secondary" disabled={!outputDir} onClick={onOpenStagingFolder}>
            Open staging folder
          </button>
        </div>
      </section>
    )
  }

  const canUpload = Boolean(compliance?.compliant) && checkedCount > 0 && !uploading && !checkingCompliance

  return (
    <section className="panel drive-panel">
      <div className="panel-header">
        <h2>Drive upload</h2>
        <button className="btn-secondary" onClick={onRefreshDrives} disabled={loadingDrives}>
          {loadingDrives ? 'Scanning…' : 'Refresh drives'}
        </button>
      </div>

      {profile?.drive && (
        <p className="drive-requirement">
          Requires {profile.drive.filesystem}
          {profile.drive.maxCapacityGB ? `, ${profile.drive.maxCapacityGB}GB or smaller` : ''}
          {profile.layout.rootFolder ? `, files in a "${profile.layout.rootFolder}" folder` : ''}.
        </p>
      )}

      {profile?.layout.folderTemplate && (
        <label className="drive-group-field">
          Subfolder in {profile.layout.rootFolder} (optional)
          <input
            type="text"
            value={group}
            onChange={(e) => onGroupChange(e.target.value)}
            placeholder="e.g. 808 Pack"
          />
        </label>
      )}

      {drives.length === 0 && !loadingDrives && (
        <p className="panel-empty">No removable drives detected. Plug one in and refresh.</p>
      )}

      {drives.length > 0 && (
        <div className="drive-list">
          {drives.map((drive) => (
            <div key={drive.driveLetter} className="drive-row">
              <label className="drive-row-select">
                <input
                  type="radio"
                  name="drive-select"
                  checked={selectedDriveLetter === drive.driveLetter}
                  onChange={() => onSelectDrive(drive.driveLetter)}
                />
                <div className="drive-row-body">
                  <span className="drive-row-title">
                    {drive.driveLetter}: {drive.label || '(no label)'}
                  </span>
                  <span className="drive-row-specs">
                    {drive.filesystem} · {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
                  </span>
                </div>
              </label>
              <button
                className="btn-eject"
                disabled={ejectingDriveLetter === drive.driveLetter}
                onClick={() => onEjectClick(drive.driveLetter)}
              >
                {ejectingDriveLetter === drive.driveLetter ? 'Ejecting…' : 'Eject'}
              </button>
            </div>
          ))}
        </div>
      )}

      {ejectMessage && <p className="drive-eject-message">{ejectMessage.message}</p>}

      {selectedDriveLetter && checkingCompliance && <p className="panel-empty">Checking drive…</p>}

      {selectedDriveLetter && compliance && !checkingCompliance && (
        <div className={compliance.compliant ? 'drive-compliance ok' : 'drive-compliance error'}>
          <span className="badge" data-compliant={compliance.compliant}>
            {compliance.compliant ? 'Ready' : 'Not compliant'}
          </span>
          {compliance.compliant ? (
            <span className="drive-destination">Files will go to {compliance.destinationPath}</span>
          ) : (
            <ul className="drive-compliance-reasons">
              {compliance.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button className="btn-upload" disabled={!canUpload} onClick={onUploadClick}>
        {uploading ? 'Uploading…' : `Upload ${checkedCount || ''} file${checkedCount === 1 ? '' : 's'} to drive`}
      </button>

      {uploading && uploadProgress && (
        <div className="format-progress">
          <div className="format-progress-bar">
            <div className="format-progress-fill" style={{ width: `${uploadProgress.overallPercent}%` }} />
          </div>
          <span className="format-progress-label">
            {uploadProgress.filename
              ? `${uploadProgress.fileIndex + 1}/${uploadProgress.totalFiles} — ${uploadProgress.filename}`
              : 'Done'}{' '}
            ({uploadProgress.overallPercent}%)
          </span>
        </div>
      )}

      {uploadedFilenames && (
        <p className="drive-upload-result">
          Uploaded {uploadedFilenames.length} file{uploadedFilenames.length === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  )
}

import type { DriveInfo } from '../../../shared/ipc'
import { formatBytes } from '../format'

interface ConfirmUploadDialogProps {
  drive: DriveInfo
  destinationPath: string
  fileCount: number
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmUploadDialog({
  drive,
  destinationPath,
  fileCount,
  onConfirm,
  onCancel
}: ConfirmUploadDialogProps): JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="confirm-upload-dialog">
        <h2>Confirm upload</h2>
        <p>
          This will copy <strong>{fileCount}</strong> file{fileCount === 1 ? '' : 's'} to:
        </p>
        <p className="confirm-upload-drive">
          <strong>
            {drive.driveLetter}: {drive.label || '(no label)'}
          </strong>
          <br />
          {drive.filesystem} · {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
        </p>
        <p className="confirm-upload-destination">{destinationPath}</p>
        <p className="confirm-upload-warning">Double-check this is the right drive before continuing.</p>
        <div className="confirm-upload-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-upload" onClick={onConfirm}>
            Upload
          </button>
        </div>
      </div>
    </div>
  )
}

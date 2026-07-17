import type { FormatProgressEvent } from '../../../shared/ipc'

interface FormatButtonProps {
  disabled: boolean
  formatting: boolean
  progress: FormatProgressEvent | null
  onClick: () => void
  label?: string
  busyLabel?: string
}

export default function FormatButton({
  disabled,
  formatting,
  progress,
  onClick,
  label = 'FORMAT NOW',
  busyLabel = 'Formatting…'
}: FormatButtonProps): JSX.Element {
  return (
    <div className="format-now">
      <button className="btn-format-now" disabled={disabled || formatting} onClick={onClick}>
        {formatting ? busyLabel : label}
      </button>
      {formatting && progress && (
        <div className="format-progress">
          <div className="format-progress-bar">
            <div className="format-progress-fill" style={{ width: `${progress.overallPercent}%` }} />
          </div>
          <span className="format-progress-label">
            {progress.filename
              ? `${progress.fileIndex + 1}/${progress.totalFiles} — ${progress.filename}`
              : 'Done'}{' '}
            ({progress.overallPercent}%)
          </span>
        </div>
      )}
    </div>
  )
}

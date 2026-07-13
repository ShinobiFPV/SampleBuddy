import type { FormattedFile } from '../../../shared/ipc'
import { formatBytes, formatDuration } from '../format'

interface OutputPanelProps {
  outputDir: string | null
  files: FormattedFile[]
  checked: Record<string, boolean>
  onToggle: (filename: string) => void
}

export default function OutputPanel({ outputDir, files, checked, onToggle }: OutputPanelProps): JSX.Element {
  return (
    <section className="panel output-panel">
      <div className="panel-header">
        <h2>Formatted output</h2>
      </div>
      {outputDir && <p className="source-dir-path">{outputDir}</p>}
      {files.length === 0 ? (
        <p className="panel-empty">Run FORMAT NOW to populate this list.</p>
      ) : (
        <div className="file-list">
          {files.map((file) => (
            <label key={file.path} className="file-row output-row">
              <input
                type="checkbox"
                checked={checked[file.filename] ?? true}
                onChange={() => onToggle(file.filename)}
              />
              <div className="output-row-body">
                <span className="file-name">{file.filename}</span>
                <span className="file-row-specs">
                  <span>{formatDuration(file.durationSec)}</span>
                  <span>{formatBytes(file.sizeBytes)}</span>
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

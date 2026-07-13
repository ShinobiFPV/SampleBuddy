import type { FileAction, ScannedFile } from '../../../shared/ipc'
import { formatBytes, formatDuration } from '../format'

interface SourcePanelProps {
  sourceDir: string | null
  scannedFiles: ScannedFile[]
  loading: boolean
  decisions: Record<string, FileAction>
  onSelectFolder: () => void
  onDecisionChange: (path: string, action: FileAction) => void
}

function badgeClass(status: ScannedFile['compliance']['status']): string {
  if (status === 'ok') return 'badge badge-ok'
  if (status === 'needs-conversion') return 'badge badge-warn'
  return 'badge badge-error'
}

function badgeLabel(status: ScannedFile['compliance']['status']): string {
  if (status === 'ok') return 'OK'
  if (status === 'needs-conversion') return 'Needs conversion'
  return 'Cannot comply'
}

export default function SourcePanel({
  sourceDir,
  scannedFiles,
  loading,
  decisions,
  onSelectFolder,
  onDecisionChange
}: SourcePanelProps): JSX.Element {
  return (
    <section className="panel source-panel">
      <div className="panel-header">
        <h2>Source files</h2>
        <button className="btn-secondary" onClick={onSelectFolder}>
          {sourceDir ? 'Change folder…' : 'Select source folder…'}
        </button>
      </div>

      {sourceDir && <p className="source-dir-path">{sourceDir}</p>}

      {loading && <p className="panel-empty">Scanning…</p>}

      {!loading && sourceDir && scannedFiles.length === 0 && (
        <p className="panel-empty">No supported audio files found (wav, aiff, mp3, flac, ogg).</p>
      )}

      {!loading && scannedFiles.length > 0 && (
        <div className="file-list">
          {scannedFiles.map(({ probe, compliance }) => (
            <div key={probe.path} className="file-row">
              <div className="file-row-main">
                <span className="file-name" title={probe.path}>
                  {probe.filename}
                </span>
                <span className={badgeClass(compliance.status)}>{badgeLabel(compliance.status)}</span>
              </div>
              <div className="file-row-specs">
                <span>{probe.format.toUpperCase()}</span>
                <span>{probe.bitDepth ? `${probe.bitDepth}-bit` : 'unknown depth'}</span>
                <span>{probe.sampleRate ? `${probe.sampleRate}Hz` : '—'}</span>
                <span>{probe.channels === 1 ? 'mono' : probe.channels === 2 ? 'stereo' : `${probe.channels}ch`}</span>
                <span>{formatDuration(probe.durationSec)}</span>
                <span>{formatBytes(probe.sizeBytes)}</span>
              </div>
              {compliance.reasons.length > 0 && (
                <p className="file-row-reasons">{compliance.reasons.join('; ')}</p>
              )}
              {compliance.status === 'cannot-comply' && compliance.canTruncate && (
                <div className="file-row-decision">
                  <label>
                    <input
                      type="radio"
                      name={`decision-${probe.path}`}
                      checked={(decisions[probe.path] ?? 'truncate') === 'truncate'}
                      onChange={() => onDecisionChange(probe.path, 'truncate')}
                    />
                    Truncate to fit
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`decision-${probe.path}`}
                      checked={decisions[probe.path] === 'skip'}
                      onChange={() => onDecisionChange(probe.path, 'skip')}
                    />
                    Skip
                  </label>
                </div>
              )}
              {compliance.status === 'cannot-comply' && !compliance.canTruncate && (
                <p className="file-row-decision file-row-skip-only">Will be skipped — no automatic fix.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

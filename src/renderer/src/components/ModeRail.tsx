import type { CSSProperties } from 'react'
import type { AppMode } from './Header'

interface ModeRailProps {
  mode: AppMode
  onSelectMode: (mode: AppMode) => void
}

const MODES: { id: AppMode; lines: string[]; accentVar: string }[] = [
  { id: 'batch', lines: ['Batch', 'Format'], accentVar: '--mode-batch' },
  { id: 'chop', lines: ['Chop', 'Sample'], accentVar: '--mode-chop' },
  { id: 'record', lines: ['Record'], accentVar: '--mode-record' },
  { id: 'playback', lines: ['Playback'], accentVar: '--mode-playback' },
  { id: 'instrument', lines: ['Instrument'], accentVar: '--mode-instrument' }
]

export default function ModeRail({ mode, onSelectMode }: ModeRailProps): JSX.Element {
  return (
    <nav className="mode-rail">
      <div className="mode-rail-brand">
        <div className="mode-rail-mark" />
        <span className="mode-rail-brand-label">ShinTech</span>
      </div>

      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`mode-rail-btn${mode === m.id ? ' mode-rail-btn-active' : ''}`}
          style={{ '--btn-accent': `var(${m.accentVar})` } as CSSProperties}
          onClick={() => onSelectMode(m.id)}
        >
          <span className="mode-rail-dot" />
          <span className="mode-rail-label">
            {m.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        </button>
      ))}
    </nav>
  )
}

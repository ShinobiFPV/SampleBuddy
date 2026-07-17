import type { DeviceProfile } from '../../../shared/ipc'

export type AppMode = 'batch' | 'chop'

interface HeaderProps {
  profiles: DeviceProfile[]
  selectedProfileId: string
  onSelectProfile: (id: string) => void
  mode: AppMode
  onSelectMode: (mode: AppMode) => void
}

export default function Header({
  profiles,
  selectedProfileId,
  onSelectProfile,
  mode,
  onSelectMode
}: HeaderProps): JSX.Element {
  const selected = profiles.find((p) => p.id === selectedProfileId)

  return (
    <header className="app-header">
      <div className="wordmark-row">
        <h1 className="wordmark">
          Sample<span className="wordmark-accent">Buddy</span>
        </h1>
        <span className="byline">ShinTech Electronics</span>
      </div>

      <div className="mode-toggle-row">
        <button
          className={`mode-toggle-btn${mode === 'batch' ? ' mode-toggle-active' : ''}`}
          onClick={() => onSelectMode('batch')}
        >
          Batch Format
        </button>
        <button
          className={`mode-toggle-btn${mode === 'chop' ? ' mode-toggle-active' : ''}`}
          onClick={() => onSelectMode('chop')}
        >
          Chop Sample
        </button>
      </div>

      <div className="profile-picker-row">
        <label className="profile-picker-label" htmlFor="profile-select">
          Hardware profile
        </label>
        <select
          id="profile-select"
          className="profile-picker"
          value={selectedProfileId}
          onChange={(e) => onSelectProfile(e.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>
      </div>

      {selected && <p className="profile-notes">{selected.userNotes}</p>}
    </header>
  )
}

import type { DeviceProfile, NamingOptions as NamingOptionsValue, NumberingScheme } from '../../../shared/ipc'

interface NamingOptionsProps {
  profile: DeviceProfile | undefined
  value: NamingOptionsValue
  onChange: (value: NamingOptionsValue) => void
}

export default function NamingOptions({ profile, value, onChange }: NamingOptionsProps): JSX.Element {
  return (
    <section className="panel naming-panel">
      <h2>Naming</h2>
      <div className="naming-fields">
        <label className="naming-field">
          Prefix
          <input
            type="text"
            value={value.prefix}
            onChange={(e) => onChange({ ...value, prefix: e.target.value })}
            placeholder="e.g. kick_"
          />
        </label>
        <label className="naming-field">
          Numbering
          <select
            value={value.numbering}
            onChange={(e) => onChange({ ...value, numbering: e.target.value as NumberingScheme })}
          >
            <option value="none">None</option>
            <option value="sequential">Sequential (001, 002, …)</option>
          </select>
        </label>
        {value.numbering === 'sequential' && (
          <label className="naming-field">
            Start at
            <input
              type="number"
              min={0}
              value={value.startNumber}
              onChange={(e) => onChange({ ...value, startNumber: Number(e.target.value) || 0 })}
            />
          </label>
        )}
      </div>
      {profile && (
        <p className="naming-hint">
          {profile.displayName} allows up to {profile.naming.maxLength} characters
          {profile.naming.asciiOnly ? ', ASCII only' : ''}. Disallowed characters are replaced with underscores.
        </p>
      )}
    </section>
  )
}

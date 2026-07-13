import type { DeviceProfile } from '../../../shared/ipc'

interface DrivePanelProps {
  profile: DeviceProfile | undefined
  outputDir: string | null
  onOpenStagingFolder: () => void
}

export default function DrivePanel({ profile, outputDir, onOpenStagingFolder }: DrivePanelProps): JSX.Element {
  const isStagingFolder = profile?.transferMethod === 'staging-folder'

  return (
    <section className="panel drive-panel">
      <h2>Drive upload</h2>
      {isStagingFolder ? (
        <div className="drive-staging">
          <p className="drive-staging-note">
            {profile?.displayName} imports from a staging folder rather than a removable drive.
          </p>
          <button className="btn-secondary" disabled={!outputDir} onClick={onOpenStagingFolder}>
            Open staging folder
          </button>
        </div>
      ) : (
        <div className="drive-stub">
          <p>Drive management coming in Phase 2.</p>
          {profile?.drive && (
            <p className="drive-stub-req">
              Requires {profile.drive.filesystem}
              {profile.drive.maxCapacityGB ? `, ${profile.drive.maxCapacityGB}GB or smaller` : ''}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

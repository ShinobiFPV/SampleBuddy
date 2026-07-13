import { stat } from 'fs/promises'
import { join } from 'path'
import { getProfile } from '../profiles'
import { listRemovableDrives } from './detect'
import type { DeviceProfile } from '../profiles/types'
import type { DriveComplianceResult, DriveInfo } from '../../shared/ipc'

const BYTES_PER_GB = 1_000_000_000

export function destinationPathFor(driveLetter: string, profile: DeviceProfile): string {
  const root = `${driveLetter}:\\`
  return profile.layout.rootFolder ? join(root, profile.layout.rootFolder) : root
}

export async function checkDriveCompliance(
  drive: DriveInfo,
  profile: DeviceProfile
): Promise<DriveComplianceResult> {
  const destinationPath = destinationPathFor(drive.driveLetter, profile)
  const reasons: string[] = []

  if (!profile.drive) {
    // Shouldn't be reachable — the renderer only shows drive UI for
    // usb-drive profiles, all of which define `drive` requirements.
    return { compliant: true, reasons: [], destinationPath }
  }

  if (drive.filesystem.toUpperCase() !== profile.drive.filesystem) {
    reasons.push(`Drive is ${drive.filesystem || 'an unknown filesystem'}, needs ${profile.drive.filesystem}`)
  }

  if (profile.drive.maxCapacityGB && drive.totalBytes / BYTES_PER_GB > profile.drive.maxCapacityGB) {
    reasons.push(
      `Drive is ${(drive.totalBytes / BYTES_PER_GB).toFixed(0)}GB, exceeds the ${profile.drive.maxCapacityGB}GB max`
    )
  }

  if (profile.layout.rootFolder) {
    const folderExists = await stat(destinationPath)
      .then((s) => s.isDirectory())
      .catch(() => false)
    if (!folderExists) {
      reasons.push(
        `No "${profile.layout.rootFolder}" folder found — has this drive been formatted by the ${profile.displayName} itself?`
      )
    }
  }

  return { compliant: reasons.length === 0, reasons, destinationPath }
}

export async function checkDriveComplianceById(
  driveLetter: string,
  profileId: string
): Promise<DriveComplianceResult> {
  const profile = getProfile(profileId)
  if (!profile) throw new Error(`Unknown device profile: ${profileId}`)

  const drives = await listRemovableDrives()
  const drive = drives.find((d) => d.driveLetter === driveLetter)
  if (!drive) throw new Error(`Drive ${driveLetter}: is no longer connected`)

  return checkDriveCompliance(drive, profile)
}

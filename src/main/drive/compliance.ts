import { stat } from 'fs/promises'
import { join } from 'path'
import { getProfile } from '../profiles'
import { sanitizeFolderName } from '../audio/naming'
import { listRemovableDrives } from './detect'
import type { DeviceProfile } from '../profiles/types'
import type { DriveComplianceResult, DriveInfo } from '../../shared/ipc'

const BYTES_PER_GB = 1_000_000_000

/** The folder that must already exist on the drive (e.g. "F:\IMPORT") —
 *  formatted by the device itself, never created by SampleBuddy. */
export function rootFolderPathFor(driveLetter: string, profile: DeviceProfile): string {
  const root = `${driveLetter}:\\`
  return profile.layout.rootFolder ? join(root, profile.layout.rootFolder) : root
}

/** The actual write destination: the root folder, plus an optional
 *  user-named "group" subfolder (Phase 3 — e.g. "F:\IMPORT\808 Pack") for
 *  profiles whose layout.folderTemplate opts into that. Unlike the root
 *  folder, this one is fine for SampleBuddy to create — it's the user's
 *  own organizational choice, not something the device must have
 *  pre-formatted. */
export function destinationPathFor(driveLetter: string, profile: DeviceProfile, group?: string): string {
  const rootFolderPath = rootFolderPathFor(driveLetter, profile)
  const sanitizedGroup = profile.layout.folderTemplate && group ? sanitizeFolderName(group, profile) : ''
  return sanitizedGroup ? join(rootFolderPath, sanitizedGroup) : rootFolderPath
}

export async function checkDriveCompliance(
  drive: DriveInfo,
  profile: DeviceProfile,
  group?: string
): Promise<DriveComplianceResult> {
  const destinationPath = destinationPathFor(drive.driveLetter, profile, group)
  const reasons: string[] = []

  if (!profile.drive) {
    // Shouldn't be reachable — the renderer only shows drive UI for
    // usb-drive profiles, all of which define `drive` requirements.
    return { compliant: true, reasons: [], destinationPath }
  }

  if (drive.filesystem.toUpperCase() !== profile.drive.filesystem.toUpperCase()) {
    reasons.push(`Drive is ${drive.filesystem || 'an unknown filesystem'}, needs ${profile.drive.filesystem}`)
  }

  if (profile.drive.maxCapacityGB && drive.totalBytes / BYTES_PER_GB > profile.drive.maxCapacityGB) {
    reasons.push(
      `Drive is ${(drive.totalBytes / BYTES_PER_GB).toFixed(0)}GB, exceeds the ${profile.drive.maxCapacityGB}GB max`
    )
  }

  if (profile.layout.rootFolder) {
    // Only the root folder's existence is checked — a "group" subfolder
    // underneath it is user-chosen organization, not a device-formatted
    // requirement, so upload.ts creates that one itself.
    const rootFolderPath = rootFolderPathFor(drive.driveLetter, profile)
    const folderExists = await stat(rootFolderPath)
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
  profileId: string,
  group?: string
): Promise<DriveComplianceResult> {
  const profile = getProfile(profileId)
  if (!profile) throw new Error(`Unknown device profile: ${profileId}`)

  const drives = await listRemovableDrives()
  const drive = drives.find((d) => d.driveLetter === driveLetter)
  if (!drive) throw new Error(`Drive ${driveLetter}: is no longer connected`)

  return checkDriveCompliance(drive, profile, group)
}

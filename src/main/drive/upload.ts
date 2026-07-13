import { copyFile, mkdir, readdir } from 'fs/promises'
import { join } from 'path'
import { getProfile } from '../profiles'
import { getWorkspaceDir } from '../audio/workspace'
import { dedupeFilename } from '../audio/naming'
import { listRemovableDrives } from './detect'
import { checkDriveCompliance, destinationPathFor } from './compliance'
import type { DriveUploadProgressEvent, DriveUploadRequest, DriveUploadResult } from '../../shared/ipc'

async function existingNames(dir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(dir)
    return new Set(entries.map((e) => e.toLowerCase()))
  } catch {
    return new Set()
  }
}

export async function uploadToDrive(
  request: DriveUploadRequest,
  onProgress: (event: DriveUploadProgressEvent) => void
): Promise<DriveUploadResult> {
  const profile = getProfile(request.profileId)
  if (!profile) throw new Error(`Unknown device profile: ${request.profileId}`)

  // Re-validate right before writing — the confirmation dialog and this
  // call aren't atomic, and a drive can be swapped in between.
  const drives = await listRemovableDrives()
  const drive = drives.find((d) => d.driveLetter === request.driveLetter)
  if (!drive) throw new Error(`Drive ${request.driveLetter}: is no longer connected`)

  const compliance = await checkDriveCompliance(drive, profile, request.group)
  if (!compliance.compliant) {
    throw new Error(`Drive is no longer compliant: ${compliance.reasons.join('; ')}`)
  }

  const destinationPath = destinationPathFor(request.driveLetter, profile, request.group)
  // The root folder (e.g. IMPORT) must already exist — verified above and
  // never created here. A "group" subfolder underneath it is the user's
  // own organizational choice, so it's fine to create on demand.
  await mkdir(destinationPath, { recursive: true })

  const workspaceDir = getWorkspaceDir(profile.id)
  const claimed = await existingNames(destinationPath)

  const uploaded: string[] = []
  const renamed: Record<string, string> = {}

  for (let i = 0; i < request.filenames.length; i++) {
    const filename = request.filenames[i]
    onProgress({
      totalFiles: request.filenames.length,
      fileIndex: i,
      filename,
      overallPercent: Math.round((i / request.filenames.length) * 100)
    })

    const finalName = dedupeFilename(filename, profile, claimed)
    await copyFile(join(workspaceDir, filename), join(destinationPath, finalName))

    uploaded.push(finalName)
    if (finalName !== filename) renamed[filename] = finalName
  }

  onProgress({
    totalFiles: request.filenames.length,
    fileIndex: request.filenames.length,
    filename: '',
    overallPercent: 100
  })

  return { destinationPath, uploaded, renamed }
}

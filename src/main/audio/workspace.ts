import { app } from 'electron'
import { mkdir, readdir } from 'fs/promises'
import { join } from 'path'

/** %APPDATA%/ShinTech/SampleBuddy/workspace/<profileId>/ — deliberately not
 *  app.getPath('userData') (that would be %APPDATA%/SampleBuddy) since this
 *  lives under the shared ShinTech company folder alongside other product
 *  workspaces. */
export function getWorkspaceDir(profileId: string): string {
  return join(app.getPath('appData'), 'ShinTech', 'SampleBuddy', 'workspace', profileId)
}

export async function ensureWorkspaceDir(profileId: string): Promise<string> {
  const dir = getWorkspaceDir(profileId)
  await mkdir(dir, { recursive: true })
  return dir
}

/** Existing output filenames (lowercased) already claimed in a profile's
 *  workspace from a prior run — folded into the dedupe set so a fresh run
 *  never overwrites earlier output. */
export async function existingOutputNames(profileId: string): Promise<Set<string>> {
  const dir = getWorkspaceDir(profileId)
  try {
    const entries = await readdir(dir)
    return new Set(entries.map((e) => e.toLowerCase()))
  } catch {
    return new Set()
  }
}

/** %APPDATA%/ShinTech/SampleBuddy/recordings/ — live-captured audio isn't
 *  tied to a hardware profile the way exported files are (that choice comes
 *  later, once a recording is handed off to the batch/chop pipeline), so
 *  this is a sibling of the profile-scoped workspace dirs, not one of them. */
export function getRecordingsDir(): string {
  return join(app.getPath('appData'), 'ShinTech', 'SampleBuddy', 'recordings')
}

export async function ensureRecordingsDir(): Promise<string> {
  const dir = getRecordingsDir()
  await mkdir(dir, { recursive: true })
  return dir
}

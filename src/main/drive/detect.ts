import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DriveInfo } from '../../shared/ipc'

const execFileAsync = promisify(execFile)

interface RawVolume {
  DriveLetter: string | null
  FileSystemLabel: string | null
  FileSystem: string | null
  Size: number | null
  SizeRemaining: number | null
}

// Get-Volume (not WMI's legacy Win32_LogicalDisk) since its DriveType values
// ("Removable", "Fixed", ...) are unambiguous strings rather than numeric
// codes, and it reports empty card-reader slots with DriveLetter: null,
// which are filtered out below.
//
// $_.FileSystem is also required: a drive that's been ejected (Shell
// "Eject" verb — see eject.ts) but not yet physically unplugged still
// shows up here with its DriveLetter and DriveType intact, just an empty
// FileSystem/Size/Label ("no medium found" — the same state an empty CD
// drive reports). Without this check, an ejected-but-still-plugged-in
// drive would keep appearing as a normal, selectable, uploadable target.
const SCRIPT =
  '$vols = @(Get-Volume | Where-Object { $_.DriveType -eq \'Removable\' -and $_.FileSystem } | ' +
  'Select-Object DriveLetter, FileSystemLabel, FileSystem, Size, SizeRemaining); ' +
  'ConvertTo-Json -InputObject $vols'

export async function listRemovableDrives(): Promise<DriveInfo[]> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', SCRIPT])
  const trimmed = stdout.trim()
  if (!trimmed) return []

  const parsed: RawVolume | RawVolume[] = JSON.parse(trimmed)
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  return rows
    .filter((row): row is RawVolume & { DriveLetter: string } => Boolean(row.DriveLetter) && Boolean(row.FileSystem))
    .map((row) => ({
      driveLetter: row.DriveLetter,
      label: row.FileSystemLabel ?? '',
      filesystem: row.FileSystem ?? 'unknown',
      totalBytes: row.Size ?? 0,
      freeBytes: row.SizeRemaining ?? 0
    }))
}

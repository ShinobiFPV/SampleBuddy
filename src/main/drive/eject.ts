import { execFile } from 'child_process'
import { promisify } from 'util'
import { listRemovableDrives } from './detect'
import type { DriveEjectResult } from '../../shared/ipc'

const execFileAsync = promisify(execFile)

// Shell.Application's "Eject" verb — the same code path Explorer's own
// right-click "Eject" uses. Deliberately NOT mountvol /P: that command
// forcibly closes *other processes'* open handles before dismounting,
// which is the opposite of safe if something else is reading from the
// drive. InvokeVerb defers to Windows' own busy/in-use protection instead.
function ejectScript(driveLetter: string): string {
  return `(New-Object -ComObject Shell.Application).Namespace(17).ParseName('${driveLetter}:').InvokeVerb('Eject')`
}

const DRIVE_LETTER_PATTERN = /^[A-Za-z]$/

export async function ejectDrive(driveLetter: string): Promise<DriveEjectResult> {
  if (!DRIVE_LETTER_PATTERN.test(driveLetter)) {
    throw new Error(`Invalid drive letter: ${driveLetter}`)
  }

  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ejectScript(driveLetter)])

  // InvokeVerb is fire-and-forget with no success/failure signal of its
  // own — confirm by re-listing drives after giving Windows a moment to
  // actually finish the dismount.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const stillPresent = (await listRemovableDrives()).some((d) => d.driveLetter === driveLetter)

  if (stillPresent) {
    return {
      ejected: false,
      message: `Windows didn't eject ${driveLetter}: — close any open files or Explorer windows on it and try again.`
    }
  }
  return { ejected: true }
}

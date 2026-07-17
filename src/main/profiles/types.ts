// Device profile system — one profile per supported hardware sampler. A
// profile is the single source of truth for what "compliant" means for that
// device: target audio spec, filename rules, on-device folder layout, and
// (when applicable) the removable drive's required filesystem.

export type TransferMethod = 'usb-drive' | 'staging-folder'

export type ChannelPolicy = 'keep' | 'mono' | 'stereo'

export interface AudioTargetSpec {
  container: 'wav'
  bitDepth: 16 | 24
  sampleRate: 44100 | 48000
  channels: ChannelPolicy
  /** Files longer than this cannot comply as-is — the user is offered a
   *  truncate-to-fit or skip choice (see compliance.ts). */
  maxDurationSec?: number
  /** Files shorter than this cannot comply — there's no reasonable
   *  auto-fix, so these are always flagged for skip. */
  minDurationMs?: number
  maxFileSizeMB?: number
}

export interface NamingRules {
  maxLength: number
  /** A `^[...]+$`-shaped character class describing the device's allowed
   *  filename characters. Sanitization (see naming.ts) derives a per-char
   *  test from the class inside the brackets. */
  allowedCharsRegex: string
  asciiOnly: boolean
}

export interface DeviceLayout {
  /** Required top-level folder name on the drive/card (e.g. SP-404 MKII's
   *  "IMPORT"). Absent means files land at the drive root. */
  rootFolder?: string
  filesInRootOnly: boolean
  folderTemplate?: string
}

export interface DriveRequirements {
  filesystem: 'FAT32' | 'exFAT'
  maxCapacityGB?: number
}

export interface DeviceProfile {
  id: string
  displayName: string
  manufacturer: string
  transferMethod: TransferMethod
  audio: AudioTargetSpec
  naming: NamingRules
  layout: DeviceLayout
  drive?: DriveRequirements
  /** Shown in the UI beneath the profile picker — device-specific caveats
   *  that don't fit anywhere else (e.g. "must be formatted by the device
   *  itself"). */
  userNotes: string
}

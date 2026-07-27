// Shared IPC channel names + payload types, imported by both main and
// renderer (via preload) so the two sides can't drift out of sync on shape.

export type { DeviceProfile } from '../main/profiles/types'

export const IPC = {
  profilesList: 'profiles:list',
  dialogSelectSourceFolder: 'dialog:selectSourceFolder',
  dialogOpenPath: 'dialog:openPath',
  audioScanFolder: 'audio:scanFolder',
  audioFormatNow: 'audio:formatNow',
  audioFormatProgress: 'audio:formatProgress',
  driveList: 'drive:list',
  driveCheckCompliance: 'drive:checkCompliance',
  driveUpload: 'drive:upload',
  driveUploadProgress: 'drive:uploadProgress',
  driveEject: 'drive:eject',
  dialogSelectSourceFile: 'dialog:selectSourceFile',
  audioReadFileBuffer: 'audio:readFileBuffer',
  audioChopAndFormat: 'audio:chopAndFormat',
  audioChopProgress: 'audio:chopProgress',
  audioListInputDevices: 'audio:listInputDevices',
  audioRecordStart: 'audio:recordStart',
  audioRecordStop: 'audio:recordStop',
  audioRecordLevel: 'audio:recordLevel',
  audioOpenAsioControlPanel: 'audio:openAsioControlPanel',
  dialogSelectVst3File: 'dialog:selectVst3File',
  instrumentListDevices: 'instrument:listDevices',
  instrumentStart: 'instrument:start',
  instrumentStop: 'instrument:stop',
  instrumentMidiEvent: 'instrument:midiEvent',
  instrumentCaptureStart: 'instrument:captureStart',
  instrumentCaptureStop: 'instrument:captureStop'
} as const

export type ComplianceStatus = 'ok' | 'needs-conversion' | 'cannot-comply'

export interface ProbedAudioFile {
  path: string
  filename: string
  /** Container/codec as reported by ffprobe, e.g. "wav", "mp3", "aiff". */
  format: string
  bitDepth: number | null
  sampleRate: number
  channels: number
  durationSec: number
  sizeBytes: number
}

export interface ComplianceResult {
  status: ComplianceStatus
  reasons: string[]
  /** True when the only way to comply is cutting the file short — the
   *  renderer offers a truncate-or-skip choice for these. */
  canTruncate: boolean
}

export interface ScannedFile {
  probe: ProbedAudioFile
  compliance: ComplianceResult
}

export type FileAction = 'convert' | 'truncate' | 'skip'

export interface FormatFileRequest {
  path: string
  action: FileAction
}

export type NumberingScheme = 'none' | 'sequential'

export interface NamingOptions {
  prefix: string
  numbering: NumberingScheme
  startNumber: number
}

export interface FormatNowRequest {
  profileId: string
  files: FormatFileRequest[]
  naming: NamingOptions
}

export interface FormattedFile {
  path: string
  filename: string
  sizeBytes: number
  durationSec: number
}

export interface FormatProgressEvent {
  totalFiles: number
  fileIndex: number
  filename: string
  filePercent: number
  overallPercent: number
}

export interface FormatNowResult {
  outputDir: string
  files: FormattedFile[]
  skipped: string[]
}

export interface DriveInfo {
  /** Single letter, no colon (e.g. "F"). */
  driveLetter: string
  label: string
  filesystem: string
  totalBytes: number
  freeBytes: number
}

export interface DriveComplianceResult {
  compliant: boolean
  reasons: string[]
  /** Where files will actually be written for this profile, e.g. "F:\IMPORT". */
  destinationPath: string
}

export interface DriveUploadRequest {
  profileId: string
  driveLetter: string
  /** Filenames (not full paths) of files already sitting in the profile's
   *  workspace dir — i.e. the checked rows in the formatted-output panel. */
  filenames: string[]
  /** User-typed subfolder name (Phase 3) — only meaningful when the
   *  profile's layout.folderTemplate is set (e.g. SP-404 MKII's optional
   *  grouping folder inside IMPORT). Ignored otherwise. */
  group?: string
}

export interface DriveUploadProgressEvent {
  totalFiles: number
  fileIndex: number
  filename: string
  overallPercent: number
}

export interface DriveUploadResult {
  destinationPath: string
  uploaded: string[]
  renamed: Record<string, string>
}

export interface DriveEjectResult {
  ejected: boolean
  message?: string
}

/** One marked region to cut out of a single source file — `label` is the
 *  derived pad label (e.g. "AB"), used to build the output filename. */
export interface ChopRegionRequest {
  label: string
  startSec: number
  endSec: number
}

export interface ChopRequest {
  sourcePath: string
  profileId: string
  naming: NamingOptions
  regions: ChopRegionRequest[]
}

/** An ASIO-capable input device, as reported by RtAudio (via `audify`). */
export interface RecordDeviceInfo {
  id: number
  name: string
  inputChannels: number
  isDefaultInput: boolean
  preferredSampleRate: number
}

export interface RecordStartRequest {
  deviceId: number
}

export type RecordStartResult = { ok: true } | { ok: false; error: string }

/** Peak/RMS amplitude for the live level meter, both normalized 0-1.
 *  Throttled in the main process — not sent on every audio callback. */
export interface RecordLevelEvent {
  peak: number
  rms: number
}

export interface RecordStopResult {
  filePath: string
  durationSec: number
}

/** An ASIO output device, as reported by the native VST host (via JUCE). */
export interface InstrumentDeviceInfo {
  name: string
}

export interface InstrumentStartRequest {
  pluginPath: string
  deviceName: string
}

export type InstrumentStartResult = { ok: true } | { ok: false; error: string }

/** One note event, forwarded verbatim from a connected MIDI input to the
 *  loaded plugin — sent fire-and-forget (see preload's instrumentMidiEvent)
 *  since it can fire dozens of times a second while playing. */
export interface InstrumentMidiEvent {
  note: number
  velocity: number
  on: boolean
}

import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type ChopRequest,
  type DeviceProfile,
  type DriveComplianceResult,
  type DriveEjectResult,
  type DriveInfo,
  type DriveUploadProgressEvent,
  type DriveUploadRequest,
  type DriveUploadResult,
  type FormatNowRequest,
  type FormatNowResult,
  type FormatProgressEvent,
  type InstrumentDeviceInfo,
  type InstrumentMidiEvent,
  type InstrumentStartRequest,
  type InstrumentStartResult,
  type RecordDeviceInfo,
  type RecordLevelEvent,
  type RecordStartRequest,
  type RecordStartResult,
  type RecordStopResult,
  type ScannedFile
} from '../shared/ipc'

const api = {
  profiles: {
    list: (): Promise<DeviceProfile[]> => ipcRenderer.invoke(IPC.profilesList)
  },
  dialog: {
    selectSourceFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogSelectSourceFolder),
    selectSourceFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogSelectSourceFile),
    selectVst3File: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogSelectVst3File),
    openPath: (path: string): Promise<string> => ipcRenderer.invoke(IPC.dialogOpenPath, path)
  },
  audio: {
    scanFolder: (sourceDir: string, profileId: string): Promise<ScannedFile[]> =>
      ipcRenderer.invoke(IPC.audioScanFolder, sourceDir, profileId),
    formatNow: (request: FormatNowRequest): Promise<FormatNowResult> =>
      ipcRenderer.invoke(IPC.audioFormatNow, request),
    onFormatProgress: (cb: (e: FormatProgressEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: FormatProgressEvent): void => cb(payload)
      ipcRenderer.on(IPC.audioFormatProgress, listener)
      return () => ipcRenderer.removeListener(IPC.audioFormatProgress, listener)
    },
    readFileBuffer: (path: string): Promise<Uint8Array> => ipcRenderer.invoke(IPC.audioReadFileBuffer, path),
    chopAndFormat: (request: ChopRequest): Promise<FormatNowResult> =>
      ipcRenderer.invoke(IPC.audioChopAndFormat, request),
    onChopProgress: (cb: (e: FormatProgressEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: FormatProgressEvent): void => cb(payload)
      ipcRenderer.on(IPC.audioChopProgress, listener)
      return () => ipcRenderer.removeListener(IPC.audioChopProgress, listener)
    }
  },
  record: {
    listInputDevices: (): Promise<RecordDeviceInfo[]> => ipcRenderer.invoke(IPC.audioListInputDevices),
    start: (request: RecordStartRequest): Promise<RecordStartResult> => ipcRenderer.invoke(IPC.audioRecordStart, request),
    stop: (): Promise<RecordStopResult> => ipcRenderer.invoke(IPC.audioRecordStop),
    onLevel: (cb: (e: RecordLevelEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: RecordLevelEvent): void => cb(payload)
      ipcRenderer.on(IPC.audioRecordLevel, listener)
      return () => ipcRenderer.removeListener(IPC.audioRecordLevel, listener)
    }
  },
  instrument: {
    listDevices: (): Promise<InstrumentDeviceInfo[]> => ipcRenderer.invoke(IPC.instrumentListDevices),
    start: (request: InstrumentStartRequest): Promise<InstrumentStartResult> =>
      ipcRenderer.invoke(IPC.instrumentStart, request),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.instrumentStop),
    // Fire-and-forget — can fire dozens of times a second while playing, a
    // response per note buys nothing (the only ipcRenderer.send in this app).
    sendMidiEvent: (event: InstrumentMidiEvent): void => ipcRenderer.send(IPC.instrumentMidiEvent, event),
    captureStart: (): Promise<void> => ipcRenderer.invoke(IPC.instrumentCaptureStart),
    captureStop: (): Promise<RecordStopResult> => ipcRenderer.invoke(IPC.instrumentCaptureStop)
  },
  drive: {
    list: (): Promise<DriveInfo[]> => ipcRenderer.invoke(IPC.driveList),
    checkCompliance: (driveLetter: string, profileId: string, group?: string): Promise<DriveComplianceResult> =>
      ipcRenderer.invoke(IPC.driveCheckCompliance, driveLetter, profileId, group),
    upload: (request: DriveUploadRequest): Promise<DriveUploadResult> =>
      ipcRenderer.invoke(IPC.driveUpload, request),
    onUploadProgress: (cb: (e: DriveUploadProgressEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DriveUploadProgressEvent): void => cb(payload)
      ipcRenderer.on(IPC.driveUploadProgress, listener)
      return () => ipcRenderer.removeListener(IPC.driveUploadProgress, listener)
    },
    eject: (driveLetter: string): Promise<DriveEjectResult> => ipcRenderer.invoke(IPC.driveEject, driveLetter)
  }
}

contextBridge.exposeInMainWorld('sampleBuddy', api)

export type SampleBuddyApi = typeof api

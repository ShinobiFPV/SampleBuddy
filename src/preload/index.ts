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
  type ScannedFile
} from '../shared/ipc'

const api = {
  profiles: {
    list: (): Promise<DeviceProfile[]> => ipcRenderer.invoke(IPC.profilesList)
  },
  dialog: {
    selectSourceFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogSelectSourceFolder),
    selectSourceFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogSelectSourceFile),
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

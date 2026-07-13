import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type DeviceProfile,
  type DriveComplianceResult,
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
    }
  }
}

contextBridge.exposeInMainWorld('sampleBuddy', api)

export type SampleBuddyApi = typeof api

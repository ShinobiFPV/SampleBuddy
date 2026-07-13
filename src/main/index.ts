import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { IPC, type FormatNowRequest, type DriveUploadRequest } from '../shared/ipc'
import { listProfiles } from './profiles'
import { scanFolderForProfile, formatNow } from './audio/pipeline'
import { listRemovableDrives } from './drive/detect'
import { checkDriveComplianceById } from './drive/compliance'
import { uploadToDrive } from './drive/upload'
import { createMainWindow } from './windows'

app.setName('SampleBuddy')

function registerIpc(): void {
  ipcMain.handle(IPC.profilesList, () => listProfiles())

  ipcMain.handle(IPC.dialogSelectSourceFolder, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Select Source Folder'
    }
    const result = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialogOpenPath, (_event, path: string) => shell.openPath(path))

  ipcMain.handle(IPC.audioScanFolder, (_event, sourceDir: string, profileId: string) =>
    scanFolderForProfile(sourceDir, profileId)
  )

  ipcMain.handle(IPC.audioFormatNow, (event, request: FormatNowRequest) =>
    formatNow(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.audioFormatProgress, progress)
    })
  )

  ipcMain.handle(IPC.driveList, () => listRemovableDrives())

  ipcMain.handle(IPC.driveCheckCompliance, (_event, driveLetter: string, profileId: string, group?: string) =>
    checkDriveComplianceById(driveLetter, profileId, group)
  )

  ipcMain.handle(IPC.driveUpload, (event, request: DriveUploadRequest) =>
    uploadToDrive(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.driveUploadProgress, progress)
    })
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } else {
      createMainWindow()
    }
  })

  app.whenReady().then(() => {
    registerIpc()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

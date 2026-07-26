import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import {
  IPC,
  type ChopRequest,
  type FormatNowRequest,
  type DriveUploadRequest,
  type InstrumentMidiEvent,
  type InstrumentStartRequest,
  type RecordStartRequest
} from '../shared/ipc'
import { listProfiles } from './profiles'
import { scanFolderForProfile, formatNow } from './audio/pipeline'
import { chopAndFormat } from './audio/chop'
import { listInputDevices, startRecording, stopRecording } from './audio/capture'
import {
  listOutputDevices,
  sendMidiNote,
  startCapture,
  startInstrument,
  stopCapture,
  stopInstrument
} from './audio/instrumentHost'
import { listRemovableDrives } from './drive/detect'
import { checkDriveComplianceById } from './drive/compliance'
import { uploadToDrive } from './drive/upload'
import { ejectDrive } from './drive/eject'
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

  ipcMain.handle(IPC.driveEject, (_event, driveLetter: string) => ejectDrive(driveLetter))

  ipcMain.handle(IPC.dialogSelectSourceFile, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      title: 'Select Audio File',
      filters: [{ name: 'Audio', extensions: ['wav', 'aiff', 'aif', 'mp3', 'flac', 'ogg'] }]
    }
    const result = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.audioReadFileBuffer, (_event, path: string) => readFile(path))

  ipcMain.handle(IPC.audioChopAndFormat, (event, request: ChopRequest) =>
    chopAndFormat(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.audioChopProgress, progress)
    })
  )

  ipcMain.handle(IPC.audioListInputDevices, () => listInputDevices())

  ipcMain.handle(IPC.audioRecordStart, (event, request: RecordStartRequest) =>
    startRecording(request, (level) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.audioRecordLevel, level)
    })
  )

  ipcMain.handle(IPC.audioRecordStop, () => stopRecording())

  ipcMain.handle(IPC.dialogSelectVst3File, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const defaultVst3Dir = 'C:\\Program Files\\Common Files\\VST3'
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      title: 'Select VST3 Plugin',
      filters: [{ name: 'VST3 Plugin', extensions: ['vst3'] }],
      defaultPath: existsSync(defaultVst3Dir) ? defaultVst3Dir : undefined
    }
    const result = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.instrumentListDevices, () => listOutputDevices())

  ipcMain.handle(IPC.instrumentStart, (_event, request: InstrumentStartRequest) => startInstrument(request))

  ipcMain.handle(IPC.instrumentStop, () => stopInstrument())

  ipcMain.on(IPC.instrumentMidiEvent, (_event, midiEvent: InstrumentMidiEvent) =>
    sendMidiNote(midiEvent.note, midiEvent.velocity, midiEvent.on)
  )

  ipcMain.handle(IPC.instrumentCaptureStart, () => startCapture())

  ipcMain.handle(IPC.instrumentCaptureStop, () => stopCapture())
}

// Ensures no vst-host.exe survives closing SampleBuddy — child_process.spawn
// doesn't kill children automatically on the parent's exit on Windows.
app.on('before-quit', () => {
  stopInstrument()
})

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
    // Electron denies all permission requests by default — the Chop Editor's
    // MIDI controller mapping needs navigator.requestMIDIAccess() to resolve.
    // Electron's Chromium build routes navigator.requestMIDIAccess() through
    // the 'midiSysex' permission even when called with { sysex: false } — the
    // renderer still only requests the non-sysex API, this just unblocks it.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'midi' || permission === 'midiSysex')
    })
    session.defaultSession.setPermissionCheckHandler(
      (_wc, permission) => permission === 'midi' || permission === 'midiSysex'
    )

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

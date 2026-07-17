import { useEffect, useMemo, useState } from 'react'
import type {
  ChopRegionRequest,
  DeviceProfile,
  DriveComplianceResult,
  DriveInfo,
  DriveUploadProgressEvent,
  FileAction,
  FormatNowResult,
  FormatProgressEvent,
  NamingOptions as NamingOptionsValue,
  ScannedFile
} from '../../shared/ipc'
import Header, { type AppMode } from './components/Header'
import SourcePanel from './components/SourcePanel'
import NamingOptions from './components/NamingOptions'
import FormatButton from './components/FormatButton'
import OutputPanel from './components/OutputPanel'
import DrivePanel from './components/DrivePanel'
import ConfirmUploadDialog from './components/ConfirmUploadDialog'
import ChopEditor from './components/chop/ChopEditor'
import { formatPairLabel, type ChopRegion } from './components/chop/waveform'

function defaultActionFor(scanned: ScannedFile, existing?: FileAction): FileAction {
  if (existing) return existing
  if (scanned.compliance.status !== 'cannot-comply') return 'convert'
  return scanned.compliance.canTruncate ? 'truncate' : 'skip'
}

export default function App(): JSX.Element {
  const [mode, setMode] = useState<AppMode>('batch')
  const [profiles, setProfiles] = useState<DeviceProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [sourceDir, setSourceDir] = useState<string | null>(null)
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([])
  const [scanning, setScanning] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, FileAction>>({})
  const [naming, setNaming] = useState<NamingOptionsValue>({ prefix: '', numbering: 'none', startNumber: 1 })
  const [formatting, setFormatting] = useState(false)
  const [progress, setProgress] = useState<FormatProgressEvent | null>(null)
  const [formatResult, setFormatResult] = useState<FormatNowResult | null>(null)
  const [outputChecked, setOutputChecked] = useState<Record<string, boolean>>({})

  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [loadingDrives, setLoadingDrives] = useState(false)
  const [selectedDriveLetter, setSelectedDriveLetter] = useState<string | null>(null)
  const [compliance, setCompliance] = useState<DriveComplianceResult | null>(null)
  const [checkingCompliance, setCheckingCompliance] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<DriveUploadProgressEvent | null>(null)
  const [uploadedFilenames, setUploadedFilenames] = useState<string[] | null>(null)
  const [group, setGroup] = useState('')
  const [ejectingDriveLetter, setEjectingDriveLetter] = useState<string | null>(null)
  const [ejectMessage, setEjectMessage] = useState<{ driveLetter: string; message: string } | null>(null)

  const [chopSourcePath, setChopSourcePath] = useState<string | null>(null)
  const [chopRegions, setChopRegions] = useState<ChopRegion[]>([])
  const [chopExporting, setChopExporting] = useState(false)
  const [chopProgress, setChopProgress] = useState<FormatProgressEvent | null>(null)

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId),
    [profiles, selectedProfileId]
  )

  const checkedFilenames = useMemo(
    () => (formatResult?.files ?? []).filter((f) => outputChecked[f.filename] ?? true).map((f) => f.filename),
    [formatResult, outputChecked]
  )

  const selectedDrive = useMemo(
    () => drives.find((d) => d.driveLetter === selectedDriveLetter) ?? null,
    [drives, selectedDriveLetter]
  )

  useEffect(() => {
    window.sampleBuddy.profiles.list().then((list) => {
      setProfiles(list)
      if (list.length > 0) setSelectedProfileId(list[0].id)
    })
  }, [])

  async function rescan(dir: string, profileId: string): Promise<void> {
    if (!dir || !profileId) return
    setScanning(true)
    try {
      const results = await window.sampleBuddy.audio.scanFolder(dir, profileId)
      setScannedFiles(results)
      setDecisions((prev) => {
        const next: Record<string, FileAction> = {}
        for (const result of results) next[result.probe.path] = defaultActionFor(result, prev[result.probe.path])
        return next
      })
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    if (sourceDir && selectedProfileId) rescan(sourceDir, selectedProfileId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId])

  async function refreshDrives(): Promise<void> {
    setLoadingDrives(true)
    try {
      const list = await window.sampleBuddy.drive.list()
      setDrives(list)
      if (selectedDriveLetter && !list.some((d) => d.driveLetter === selectedDriveLetter)) {
        setSelectedDriveLetter(null)
        setCompliance(null)
      }
    } finally {
      setLoadingDrives(false)
    }
  }

  useEffect(() => {
    setSelectedDriveLetter(null)
    setCompliance(null)
    setUploadedFilenames(null)
    setGroup('')
    if (selectedProfile?.transferMethod === 'usb-drive') refreshDrives()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId])

  useEffect(() => {
    if (!selectedDriveLetter || !selectedProfileId) {
      setCompliance(null)
      setCheckingCompliance(false)
      return
    }
    // checkingCompliance flips true immediately (not just once the debounce
    // fires) so the Upload button — and the confirm dialog it gates — can
    // never act on a compliance/destinationPath snapshot that's stale
    // relative to a group name the user just typed.
    setCheckingCompliance(true)
    // clearTimeout only stops a check that hasn't fired yet — it can't
    // cancel one already in flight. Without this guard, an older request
    // (e.g. from the drive being selected) can resolve *after* a newer one
    // (from a group name typed right after) and silently clobber it with a
    // stale destinationPath, exactly the kind of mismatch the confirm
    // dialog exists to prevent.
    let cancelled = false
    const timer = setTimeout(() => {
      window.sampleBuddy.drive
        .checkCompliance(selectedDriveLetter, selectedProfileId, group)
        .then((result) => {
          if (!cancelled) setCompliance(result)
        })
        .finally(() => {
          if (!cancelled) setCheckingCompliance(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selectedDriveLetter, selectedProfileId, group])

  async function handleSelectFolder(): Promise<void> {
    const dir = await window.sampleBuddy.dialog.selectSourceFolder()
    if (!dir) return
    setSourceDir(dir)
    setFormatResult(null)
    await rescan(dir, selectedProfileId)
  }

  function handleDecisionChange(path: string, action: FileAction): void {
    setDecisions((prev) => ({ ...prev, [path]: action }))
  }

  async function handleFormatNow(): Promise<void> {
    if (!selectedProfileId || scannedFiles.length === 0) return
    setFormatting(true)
    setProgress(null)
    const unsubscribe = window.sampleBuddy.audio.onFormatProgress(setProgress)
    try {
      const files = scannedFiles.map((s) => ({
        path: s.probe.path,
        action: defaultActionFor(s, decisions[s.probe.path])
      }))
      const result = await window.sampleBuddy.audio.formatNow({ profileId: selectedProfileId, files, naming })
      setFormatResult(result)
      setOutputChecked(Object.fromEntries(result.files.map((f) => [f.filename, true])))
    } finally {
      unsubscribe()
      setFormatting(false)
    }
  }

  async function handleExportChops(): Promise<void> {
    const completeRegions = chopRegions.filter((r): r is ChopRegion & { endSec: number } => r.endSec !== null)
    if (!selectedProfileId || !chopSourcePath || completeRegions.length === 0) return

    setChopExporting(true)
    setChopProgress(null)
    const unsubscribe = window.sampleBuddy.audio.onChopProgress(setChopProgress)
    try {
      const regions: ChopRegionRequest[] = completeRegions.map((region) => {
        const index = chopRegions.indexOf(region)
        return { label: formatPairLabel(index), startSec: region.startSec, endSec: region.endSec }
      })
      const result = await window.sampleBuddy.audio.chopAndFormat({
        sourcePath: chopSourcePath,
        profileId: selectedProfileId,
        naming,
        regions
      })
      setFormatResult(result)
      setOutputChecked(Object.fromEntries(result.files.map((f) => [f.filename, true])))
    } finally {
      unsubscribe()
      setChopExporting(false)
    }
  }

  function handleToggleOutput(filename: string): void {
    setOutputChecked((prev) => ({ ...prev, [filename]: !(prev[filename] ?? true) }))
  }

  async function handleOpenStagingFolder(): Promise<void> {
    if (formatResult?.outputDir) await window.sampleBuddy.dialog.openPath(formatResult.outputDir)
  }

  function handleSelectDrive(driveLetter: string): void {
    setSelectedDriveLetter(driveLetter)
    setUploadedFilenames(null)
  }

  async function handleEjectDrive(driveLetter: string): Promise<void> {
    setEjectingDriveLetter(driveLetter)
    setEjectMessage(null)
    try {
      const result = await window.sampleBuddy.drive.eject(driveLetter)
      if (result.ejected) {
        await refreshDrives()
      } else {
        setEjectMessage({ driveLetter, message: result.message ?? `Couldn't eject ${driveLetter}:.` })
      }
    } finally {
      setEjectingDriveLetter(null)
    }
  }

  function handleUploadClick(): void {
    if (compliance?.compliant && checkedFilenames.length > 0 && !checkingCompliance) setConfirmOpen(true)
  }

  async function handleConfirmUpload(): Promise<void> {
    if (!selectedDriveLetter || !selectedProfileId) return
    setConfirmOpen(false)
    setUploading(true)
    setUploadProgress(null)
    const unsubscribe = window.sampleBuddy.drive.onUploadProgress(setUploadProgress)
    try {
      const result = await window.sampleBuddy.drive.upload({
        profileId: selectedProfileId,
        driveLetter: selectedDriveLetter,
        filenames: checkedFilenames,
        group
      })
      setUploadedFilenames(result.uploaded)
    } finally {
      unsubscribe()
      setUploading(false)
    }
  }

  return (
    <div className="app">
      <Header
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfile={setSelectedProfileId}
        mode={mode}
        onSelectMode={setMode}
      />

      <main className="main-content">
        <div className="main-columns">
          {mode === 'batch' ? (
            <SourcePanel
              sourceDir={sourceDir}
              scannedFiles={scannedFiles}
              loading={scanning}
              decisions={decisions}
              onSelectFolder={handleSelectFolder}
              onDecisionChange={handleDecisionChange}
            />
          ) : (
            <ChopEditor
              sourcePath={chopSourcePath}
              onSourcePathChange={setChopSourcePath}
              regions={chopRegions}
              onRegionsChange={setChopRegions}
            />
          )}
          <OutputPanel
            outputDir={formatResult?.outputDir ?? null}
            files={formatResult?.files ?? []}
            checked={outputChecked}
            onToggle={handleToggleOutput}
          />
        </div>

        <div className="main-columns">
          <NamingOptions profile={selectedProfile} value={naming} onChange={setNaming} />
          <DrivePanel
            profile={selectedProfile}
            outputDir={formatResult?.outputDir ?? null}
            checkedCount={checkedFilenames.length}
            onOpenStagingFolder={handleOpenStagingFolder}
            drives={drives}
            loadingDrives={loadingDrives}
            onRefreshDrives={refreshDrives}
            selectedDriveLetter={selectedDriveLetter}
            onSelectDrive={handleSelectDrive}
            compliance={compliance}
            checkingCompliance={checkingCompliance}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadedFilenames={uploadedFilenames}
            onUploadClick={handleUploadClick}
            group={group}
            onGroupChange={setGroup}
            ejectingDriveLetter={ejectingDriveLetter}
            ejectMessage={ejectMessage}
            onEjectClick={handleEjectDrive}
          />
        </div>

        {mode === 'batch' ? (
          <FormatButton
            disabled={scannedFiles.length === 0}
            formatting={formatting}
            progress={progress}
            onClick={handleFormatNow}
          />
        ) : (
          <FormatButton
            disabled={!chopSourcePath || chopRegions.every((r) => r.endSec === null)}
            formatting={chopExporting}
            progress={chopProgress}
            onClick={handleExportChops}
            label="EXPORT CHOPS"
            busyLabel="Exporting…"
          />
        )}
      </main>

      {confirmOpen && selectedDrive && compliance && (
        <ConfirmUploadDialog
          drive={selectedDrive}
          destinationPath={compliance.destinationPath}
          fileCount={checkedFilenames.length}
          onConfirm={handleConfirmUpload}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  )
}

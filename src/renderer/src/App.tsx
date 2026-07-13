import { useEffect, useMemo, useState } from 'react'
import type {
  DeviceProfile,
  FileAction,
  FormatNowResult,
  FormatProgressEvent,
  NamingOptions as NamingOptionsValue,
  ScannedFile
} from '../../shared/ipc'
import Header from './components/Header'
import SourcePanel from './components/SourcePanel'
import NamingOptions from './components/NamingOptions'
import FormatButton from './components/FormatButton'
import OutputPanel from './components/OutputPanel'
import DrivePanel from './components/DrivePanel'

function defaultActionFor(scanned: ScannedFile, existing?: FileAction): FileAction {
  if (existing) return existing
  if (scanned.compliance.status !== 'cannot-comply') return 'convert'
  return scanned.compliance.canTruncate ? 'truncate' : 'skip'
}

export default function App(): JSX.Element {
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

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId),
    [profiles, selectedProfileId]
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

  function handleToggleOutput(filename: string): void {
    setOutputChecked((prev) => ({ ...prev, [filename]: !(prev[filename] ?? true) }))
  }

  async function handleOpenStagingFolder(): Promise<void> {
    if (formatResult?.outputDir) await window.sampleBuddy.dialog.openPath(formatResult.outputDir)
  }

  return (
    <div className="app">
      <Header profiles={profiles} selectedProfileId={selectedProfileId} onSelectProfile={setSelectedProfileId} />

      <main className="main-content">
        <div className="main-columns">
          <SourcePanel
            sourceDir={sourceDir}
            scannedFiles={scannedFiles}
            loading={scanning}
            decisions={decisions}
            onSelectFolder={handleSelectFolder}
            onDecisionChange={handleDecisionChange}
          />
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
            onOpenStagingFolder={handleOpenStagingFolder}
          />
        </div>

        <FormatButton
          disabled={scannedFiles.length === 0}
          formatting={formatting}
          progress={progress}
          onClick={handleFormatNow}
        />
      </main>
    </div>
  )
}

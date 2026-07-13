import { stat } from 'fs/promises'
import { join } from 'path'
import { getProfile } from '../profiles'
import { scanSourceFolder } from './scan'
import { checkCompliance } from './compliance'
import { convertFile } from './convert'
import { buildOutputFilename } from './naming'
import { ensureWorkspaceDir, existingOutputNames } from './workspace'
import { probeFile } from './probe'
import type {
  FormatNowRequest,
  FormatNowResult,
  FormatProgressEvent,
  FormattedFile,
  ScannedFile
} from '../../shared/ipc'

export async function scanFolderForProfile(sourceDir: string, profileId: string): Promise<ScannedFile[]> {
  const profile = getProfile(profileId)
  if (!profile) throw new Error(`Unknown device profile: ${profileId}`)

  const probed = await scanSourceFolder(sourceDir)
  return probed.map((probe) => ({ probe, compliance: checkCompliance(probe, profile) }))
}

export async function formatNow(
  request: FormatNowRequest,
  onProgress: (event: FormatProgressEvent) => void
): Promise<FormatNowResult> {
  const profile = getProfile(request.profileId)
  if (!profile) throw new Error(`Unknown device profile: ${request.profileId}`)

  const outputDir = await ensureWorkspaceDir(profile.id)
  const claimed = await existingOutputNames(profile.id)

  const toProcess = request.files.filter((f) => f.action !== 'skip')
  const skipped = request.files.filter((f) => f.action === 'skip').map((f) => f.path)
  const files: FormattedFile[] = []

  for (let i = 0; i < toProcess.length; i++) {
    const fileRequest = toProcess[i]
    const sourceProbe = await probeFile(fileRequest.path)
    const outputFilename = buildOutputFilename(sourceProbe.filename, i, profile, request.naming, claimed)
    const outputPath = join(outputDir, outputFilename)

    onProgress({
      totalFiles: toProcess.length,
      fileIndex: i,
      filename: outputFilename,
      filePercent: 0,
      overallPercent: Math.round((i / toProcess.length) * 100)
    })

    await convertFile({
      inputPath: fileRequest.path,
      outputPath,
      sourceDurationSec: sourceProbe.durationSec,
      profile,
      truncateToSec: fileRequest.action === 'truncate' ? profile.audio.maxDurationSec : undefined,
      onProgress: (fraction) => {
        onProgress({
          totalFiles: toProcess.length,
          fileIndex: i,
          filename: outputFilename,
          filePercent: Math.round(fraction * 100),
          overallPercent: Math.round(((i + fraction) / toProcess.length) * 100)
        })
      }
    })

    const outputStat = await stat(outputPath)
    const outputProbe = await probeFile(outputPath)
    files.push({
      path: outputPath,
      filename: outputFilename,
      sizeBytes: outputStat.size,
      durationSec: outputProbe.durationSec
    })
  }

  onProgress({
    totalFiles: toProcess.length,
    fileIndex: toProcess.length,
    filename: '',
    filePercent: 100,
    overallPercent: 100
  })

  return { outputDir, files, skipped }
}

import { stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import { getProfile } from '../profiles'
import { convertFile } from './convert'
import { buildOutputFilename } from './naming'
import { ensureWorkspaceDir, existingOutputNames } from './workspace'
import { probeFile } from './probe'
import type { ChopRequest, FormatNowResult, FormatProgressEvent, FormattedFile } from '../../shared/ipc'

/** Cuts each marked region out of a single source file and runs it through
 *  the same per-device conversion/naming/workspace pipeline `formatNow` uses
 *  for whole files (see pipeline.ts) — chopped regions land in the same
 *  profile workspace dir, so the existing Output/Drive panels and upload
 *  flow work on them unchanged. */
export async function chopAndFormat(
  request: ChopRequest,
  onProgress: (event: FormatProgressEvent) => void
): Promise<FormatNowResult> {
  const profile = getProfile(request.profileId)
  if (!profile) throw new Error(`Unknown device profile: ${request.profileId}`)

  const outputDir = await ensureWorkspaceDir(profile.id)
  const claimed = await existingOutputNames(profile.id)

  const sourceExt = extname(request.sourcePath)
  const sourceBaseNoExt = basename(request.sourcePath, sourceExt)

  const files: FormattedFile[] = []
  const regions = request.regions

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const regionDurationSec = region.endSec - region.startSec
    const syntheticSourceName = `${sourceBaseNoExt}_${region.label}`
    const outputFilename = buildOutputFilename(syntheticSourceName, i, profile, request.naming, claimed)
    const outputPath = join(outputDir, outputFilename)

    onProgress({
      totalFiles: regions.length,
      fileIndex: i,
      filename: outputFilename,
      filePercent: 0,
      overallPercent: Math.round((i / regions.length) * 100)
    })

    await convertFile({
      inputPath: request.sourcePath,
      outputPath,
      sourceDurationSec: regionDurationSec,
      profile,
      trimStartSec: region.startSec,
      truncateToSec: regionDurationSec,
      onProgress: (fraction) => {
        onProgress({
          totalFiles: regions.length,
          fileIndex: i,
          filename: outputFilename,
          filePercent: Math.round(fraction * 100),
          overallPercent: Math.round(((i + fraction) / regions.length) * 100)
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
    totalFiles: regions.length,
    fileIndex: regions.length,
    filename: '',
    filePercent: 100,
    overallPercent: 100
  })

  return { outputDir, files, skipped: [] }
}

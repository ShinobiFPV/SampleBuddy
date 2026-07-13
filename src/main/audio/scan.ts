import { readdir } from 'fs/promises'
import { extname, join } from 'path'
import { probeFile } from './probe'
import type { ProbedAudioFile } from '../../shared/ipc'

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.mp3', '.flac', '.ogg'])

async function listAudioFiles(sourceDir: string): Promise<string[]> {
  const entries = await readdir(sourceDir, { withFileTypes: true, recursive: true })
  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue
    // `recursive: true` gives each entry a `parentPath` (Node 20+) relative
    // to sourceDir's own absolute path, not a bare filename.
    const parentPath = (entry as { parentPath?: string; path?: string }).parentPath ?? entry.path ?? sourceDir
    paths.push(join(parentPath, entry.name))
  }
  return paths
}

export async function scanSourceFolder(sourceDir: string): Promise<ProbedAudioFile[]> {
  const paths = await listAudioFiles(sourceDir)
  const results: ProbedAudioFile[] = []
  for (const path of paths) {
    try {
      results.push(await probeFile(path))
    } catch (err) {
      console.warn(`[SampleBuddy] failed to probe ${path}:`, err)
    }
  }
  return results
}

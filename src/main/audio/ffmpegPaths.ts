import { app } from 'electron'
import ffmpegStaticPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/** Packaged builds unpack these two binaries out of app.asar (see
 *  package.json's build.asarUnpack) since a binary can't execute from
 *  inside the archive — the static packages still report the in-asar path,
 *  so it has to be rewritten here. */
function unpackAsarPath(p: string): string {
  return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p
}

export function getFfmpegPath(): string {
  return unpackAsarPath(ffmpegStaticPath)
}

export function getFfprobePath(): string {
  return unpackAsarPath(ffprobeStatic.path)
}

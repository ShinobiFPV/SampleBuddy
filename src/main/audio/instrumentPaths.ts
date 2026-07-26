import { app } from 'electron'
import { join } from 'path'

/** Dev builds run the native VST host straight out of its CMake build
 *  directory (native/vst-host/build/, gitignored — see native/vst-host/README.md
 *  to build it). Packaged builds ship the compiled exe as an extraResource
 *  (see package.json's build.extraResources) rather than inside app.asar,
 *  since it's a standalone native executable (and a separately-licensed
 *  GPLv3 component, kept out-of-process on purpose — see
 *  native/vst-host/README.md), not a Node addon. */
export function getVstHostPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'vst-host', 'SampleBuddy VST Host.exe')
  }
  return join(
    app.getAppPath(),
    'native',
    'vst-host',
    'build',
    'VstHost_artefacts',
    'Release',
    'SampleBuddy VST Host.exe'
  )
}

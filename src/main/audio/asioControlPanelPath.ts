import { app } from 'electron'
import { join } from 'path'

/** Dev builds run the native ASIO control-panel helper straight out of its
 *  CMake build directory (native/asio-control-panel/build/, gitignored —
 *  see native/asio-control-panel/README.md to build it). Packaged builds
 *  ship the compiled exe as an extraResource (see package.json's
 *  build.extraResources) rather than inside app.asar, since it's a
 *  standalone native executable (and a separately-licensed GPLv3
 *  component, kept out-of-process on purpose — see
 *  native/asio-control-panel/README.md), not a Node addon. */
export function getAsioControlPanelPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'asio-control-panel', 'SampleBuddy ASIO Control Panel.exe')
  }
  return join(
    app.getAppPath(),
    'native',
    'asio-control-panel',
    'build',
    'Release',
    'SampleBuddy ASIO Control Panel.exe'
  )
}

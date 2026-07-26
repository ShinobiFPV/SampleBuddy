// Throwaway spike script — not part of the app. Spawns the built host exe,
// waits for its "READY" line, sweeps a range of notes (drum kits map
// different drums across the keyboard, so one sweep is more likely to hit
// something audible than a single fixed note), then stays open relaying
// anything typed on this script's own stdin straight to the host — so we
// can keep trying notes live without rebuilding. Run with:
//   node scripts/spawn-test.mjs "<path-to-vst3>"
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const exePath = path.join(
  __dirname,
  '..',
  'build',
  'VstHostSpike_artefacts',
  'Release',
  'SampleBuddy VST Host Spike.exe'
)
const pluginPath = process.argv[2] ?? 'C:\\Program Files\\Common Files\\VST3\\Kontakt 7.vst3'

console.log('spawning:', exePath)
console.log('plugin:', pluginPath)

const child = spawn(exePath, ['--plugin', pluginPath], { stdio: ['pipe', 'pipe', 'pipe'] })

child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sweep() {
  // Wide range, max velocity, generous 400ms note length — covers most drum
  // kit key-mapping conventions (kick/snare/hats usually sit low, C1-C3ish).
  for (let note = 24; note <= 84; note += 4) {
    child.stdin.write(`midi ${note} 127 on\n`)
    await sleep(150)
    child.stdin.write(`midi ${note} 0 off\n`)
    await sleep(250)
  }
  console.log('sweep done. Type "midi <note> <vel> <on|off>" or "quit" here and press Enter to keep testing.')
}

child.stdout.on('data', (chunk) => {
  process.stdout.write(`[host stdout] ${chunk}`)
  if (chunk.includes('READY')) sweep()
})

child.stderr.on('data', (chunk) => process.stderr.write(`[host stderr] ${chunk}`))
child.on('exit', (code) => {
  console.log('host exited with code', code)
  process.exit(0)
})

process.stdin.setEncoding('utf8')
process.stdin.on('data', (line) => child.stdin.write(line))

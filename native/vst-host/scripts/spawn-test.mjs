// Throwaway test script — not part of the app. Spawns the built host exe
// against a chosen ASIO device. If a 3rd arg (capture path) is given, wraps
// the note sweep in capture start/stop; otherwise just plays notes with no
// capture, to isolate whether a crash is capture-specific. Run with:
//   node scripts/spawn-test.mjs "<path-to-vst3>" "<asio-device-name>" ["<capture-out-path>"]
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const exePath = path.join(__dirname, '..', 'build', 'VstHost_artefacts', 'Release', 'SampleBuddy VST Host.exe')
const pluginPath = process.argv[2] ?? 'C:\\Program Files\\Common Files\\VST3\\Kontakt 7.vst3'
const deviceName = process.argv[3] ?? 'ASIO4ALL v2'
const capturePath = process.argv[4] // undefined => no capture

console.log('spawning:', exePath)
console.log('plugin:', pluginPath, '| device:', deviceName, '| capture:', capturePath ?? '(none)')

const child = spawn(exePath, ['--plugin', pluginPath, '--device', deviceName], { stdio: ['pipe', 'pipe', 'pipe'] })
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeWrite(line) {
  if (child.stdin.destroyed || !child.stdin.writable) {
    console.log('(skip write, stdin closed):', line.trim())
    return
  }
  child.stdin.write(line)
}

async function run() {
  if (capturePath) {
    safeWrite(`capture start ${capturePath}\n`)
    await sleep(300)
  }
  for (let note = 36; note <= 60; note += 4) {
    safeWrite(`midi ${note} 127 on\n`)
    await sleep(150)
    safeWrite(`midi ${note} 0 off\n`)
    await sleep(150)
  }
  await sleep(300)
  if (capturePath) {
    safeWrite('capture stop\n')
    await sleep(500)
  }
  safeWrite('quit\n')
}

child.stdout.on('data', (chunk) => {
  process.stdout.write(`[host stdout] ${chunk}`)
  if (chunk.includes('READY')) run()
})
child.stderr.on('data', (chunk) => process.stderr.write(`[host stderr] ${chunk}`))
child.stdin.on('error', (e) => console.log('stdin error (host probably exited):', e.code))
child.on('exit', (code, signal) => {
  console.log('host exited with code', code, 'signal', signal)
  process.exit(0)
})

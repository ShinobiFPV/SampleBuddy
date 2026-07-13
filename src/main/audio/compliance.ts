import type { DeviceProfile } from '../profiles/types'
import type { ComplianceResult, ProbedAudioFile } from '../../shared/ipc'
import { isNameCompliant } from './naming'

export function checkCompliance(probe: ProbedAudioFile, profile: DeviceProfile): ComplianceResult {
  const reasons: string[] = []
  let canTruncate = false

  if (probe.format !== 'wav') {
    reasons.push(`container is ${probe.format}, needs WAV`)
  }
  if (probe.bitDepth !== profile.audio.bitDepth) {
    reasons.push(`${probe.bitDepth ?? 'unknown'}-bit, needs ${profile.audio.bitDepth}-bit`)
  }
  if (probe.sampleRate !== profile.audio.sampleRate) {
    reasons.push(`${probe.sampleRate}Hz, needs ${profile.audio.sampleRate}Hz`)
  }
  if (profile.audio.channels === 'mono' && probe.channels !== 1) {
    reasons.push('needs to be mono')
  } else if (profile.audio.channels === 'stereo' && probe.channels !== 2) {
    reasons.push('needs to be stereo')
  }
  if (!isNameCompliant(probe.filename, profile)) {
    reasons.push('filename needs sanitizing')
  }

  let tooLong = false
  if (profile.audio.maxDurationSec && probe.durationSec > profile.audio.maxDurationSec) {
    tooLong = true
    canTruncate = true
    reasons.push(
      `${probe.durationSec.toFixed(1)}s exceeds the ${profile.audio.maxDurationSec}s max — truncate or skip`
    )
  }

  let tooShort = false
  if (profile.audio.minDurationMs && probe.durationSec * 1000 < profile.audio.minDurationMs) {
    tooShort = true
    reasons.push(`${(probe.durationSec * 1000).toFixed(0)}ms is under the ${profile.audio.minDurationMs}ms minimum`)
  }

  if (tooShort) {
    return { status: 'cannot-comply', reasons, canTruncate: false }
  }
  if (tooLong) {
    return { status: 'cannot-comply', reasons, canTruncate: true }
  }
  if (reasons.length > 0) {
    return { status: 'needs-conversion', reasons, canTruncate: false }
  }
  return { status: 'ok', reasons: [], canTruncate: false }
}

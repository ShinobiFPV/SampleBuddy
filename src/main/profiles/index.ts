import type { DeviceProfile } from './types'
import seqtrak from './seqtrak.json'
import strikeMultipad from './strike-multipad.json'
import sp404mk2 from './sp404-mk2.json'
import mpcSample from './mpc-sample.json'

export type { DeviceProfile } from './types'
export * from './types'

const PROFILES: DeviceProfile[] = [
  seqtrak as DeviceProfile,
  strikeMultipad as DeviceProfile,
  sp404mk2 as DeviceProfile,
  mpcSample as DeviceProfile
]

export function listProfiles(): DeviceProfile[] {
  return PROFILES
}

export function getProfile(id: string): DeviceProfile | undefined {
  return PROFILES.find((p) => p.id === id)
}

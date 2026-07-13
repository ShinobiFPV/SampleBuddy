import type { SampleBuddyApi } from './index'

declare global {
  interface Window {
    sampleBuddy: SampleBuddyApi
  }
}

export {}

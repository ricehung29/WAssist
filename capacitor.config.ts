import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // appId stays `com.launchpad.morning` so an already-installed build keeps its
  // data; only the display name follows the WAssist rebrand.
  appId: 'com.launchpad.morning',
  appName: 'WAssist',
  webDir: 'dist',
}

export default config

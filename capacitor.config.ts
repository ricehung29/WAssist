import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // appId stays `com.launchpad.morning` so an already-installed build keeps its
  // data; only the display name follows the WAssist rebrand.
  appId: 'com.launchpad.morning',
  appName: 'WAssist',
  webDir: 'dist',
  // Paint the WebView the same amber as the page top so overscroll / resize
  // flashes blend in instead of showing white (web) or black (old default).
  backgroundColor: '#FFFBEB',
}

export default config

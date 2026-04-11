import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'fs';

/**
 * Read CAP_SERVER_URL from .env.local (git-ignored).
 * When set, Capacitor loads the WebView from that URL instead of
 * bundled dist/ files — enables live reload during development.
 *
 * Emulator:        CAP_SERVER_URL=http://10.0.2.2:3000
 * Physical device: CAP_SERVER_URL=http://192.168.3.95:3000
 */
function readEnvLocal(): Record<string, string> {
  if (!existsSync('.env.local')) return {};
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const eq = l.indexOf('=');
        return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
      })
  );
}

const env = readEnvLocal();
const devServerUrl = env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'za.co.bowlstracker',
  appName: 'BowlsTracker',
  webDir: 'dist',
  android: {
    minWebViewVersion: 96,
  },
  // Dev server — only active when CAP_SERVER_URL is set in .env.local
  ...(devServerUrl && {
    server: {
      url: devServerUrl,
      cleartext: true,   // allow HTTP for local dev
    },
  }),
};

export default config;

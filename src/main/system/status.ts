import { execFile } from 'child_process'
import { networkInterfaces, type NetworkInterfaceInfo } from 'os'
import type { BatteryStatus, SystemStatus, WifiStatus } from '../../shared/types'

/**
 * Wi-Fi connecté d'après la sortie de `netsh wlan show interfaces`, ou null.
 * La ligne « BSSID » ne doit pas être prise pour le SSID.
 */
export function parseWifi(output: string): WifiStatus | null {
  const signal = /^\s*Signal\s*:\s*(\d{1,3})\s*%/m.exec(output)
  if (!signal) return null
  const ssid = /^\s*SSID\s*:\s*(.+?)\s*$/m.exec(output)
  return { ssid: ssid?.[1] ?? null, signal: Math.min(100, Number(signal[1])) }
}

/**
 * Traduit les champs de SYSTEM_POWER_STATUS (Win32).
 * `flag` 128 = pas de batterie, 255 = inconnu ; `percent` 255 = inconnu ; `acLine` 1 = sur secteur.
 */
export function decodeBattery(acLine: number, flag: number, percent: number): BatteryStatus | null {
  if (flag === 255 || (flag & 128) !== 0 || percent > 100) return null
  return { percent, charging: acLine === 1 }
}

/**
 * Repli quand `netsh` refuse de répondre (Windows 11 exige l'accès à la localisation pour le SSID et
 * le signal) : une carte dont le nom évoque le Wi-Fi et qui a une adresse IPv4 est connectée.
 */
export function hasWifiAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): boolean {
  return Object.entries(interfaces).some(
    ([name, addrs]) =>
      /wi-?fi|wlan|wireless|sans fil/i.test(name) && (addrs ?? []).some((a) => a.family === 'IPv4' && !a.internal)
  )
}

type PowerReader = () => BatteryStatus | null
let powerReader: PowerReader | null = null

/** Charge kernel32 une seule fois ; si l'appel natif est indisponible, on se comporte comme un PC fixe. */
function getPowerReader(): PowerReader {
  if (powerReader) return powerReader
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const kernel32 = koffi.load('kernel32.dll')
    koffi.struct('SYSTEM_POWER_STATUS', {
      ACLineStatus: 'uint8',
      BatteryFlag: 'uint8',
      BatteryLifePercent: 'uint8',
      SystemStatusFlag: 'uint8',
      BatteryLifeTime: 'uint32',
      BatteryFullLifeTime: 'uint32'
    })
    const getStatus = kernel32.func('bool GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *status)')
    powerReader = () => {
      const s: { ACLineStatus?: number; BatteryFlag?: number; BatteryLifePercent?: number } = {}
      if (!getStatus(s)) return null
      return decodeBattery(s.ACLineStatus ?? 0, s.BatteryFlag ?? 255, s.BatteryLifePercent ?? 255)
    }
  } catch {
    powerReader = () => null
  }
  return powerReader
}

function readWifi(): Promise<WifiStatus | null> {
  return new Promise((resolve) => {
    execFile('netsh.exe', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 5000 }, (err, stdout) =>
      resolve(err ? null : parseWifi(String(stdout)))
    )
  })
}

export async function readSystemStatus(): Promise<SystemStatus> {
  if (process.platform !== 'win32') return { wifi: null, battery: null }
  const wifi = (await readWifi()) ?? (hasWifiAddress(networkInterfaces()) ? { ssid: null, signal: null } : null)
  return { wifi, battery: getPowerReader()() }
}

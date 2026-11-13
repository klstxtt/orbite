import { describe, expect, it } from 'vitest'
import type { NetworkInterfaceInfo } from 'os'
import { decodeBattery, hasWifiAddress, parseWifi } from '../src/main/system/status'

const CONNECTED = `
Il existe 1 interface sur le système :

    Nom                    : Wi-Fi
    État                   : connecté
    SSID                   : Ma Box 5G
    BSSID                  : aa:bb:cc:dd:ee:ff
    Type de réseau         : Infrastructure
    Signal                 : 87%
`

describe('parseWifi', () => {
  it('lit le SSID (pas le BSSID) et le signal', () => {
    expect(parseWifi(CONNECTED)).toEqual({ ssid: 'Ma Box 5G', signal: 87 })
  })

  it('renvoie null sans connexion Wi-Fi', () => {
    expect(parseWifi('    Nom : Wi-Fi\n    État : déconnecté\n')).toBeNull()
    expect(parseWifi('')).toBeNull()
  })

  it('plafonne le signal à 100', () => {
    expect(parseWifi('    Signal : 120%')?.signal).toBe(100)
  })
})

describe('hasWifiAddress', () => {
  const v4 = (internal = false): NetworkInterfaceInfo =>
    ({ address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal, cidr: null }) as NetworkInterfaceInfo

  it('reconnaît une carte Wi-Fi qui a une adresse IPv4', () => {
    expect(hasWifiAddress({ 'Wi-Fi': [v4()] })).toBe(true)
    expect(hasWifiAddress({ 'Réseau sans fil': [v4()] })).toBe(true)
  })

  it('ignore le câble, la boucle locale et une carte Wi-Fi sans adresse', () => {
    expect(hasWifiAddress({ Ethernet: [v4()] })).toBe(false)
    expect(hasWifiAddress({ 'Wi-Fi': [v4(true)] })).toBe(false)
    expect(hasWifiAddress({ 'Wi-Fi': [] })).toBe(false)
  })
})

describe('decodeBattery', () => {
  it('renvoie null sur un PC fixe (drapeau 128) ou un état inconnu', () => {
    expect(decodeBattery(1, 128, 255)).toBeNull()
    expect(decodeBattery(1, 255, 255)).toBeNull()
    expect(decodeBattery(0, 0, 255)).toBeNull()
  })

  it('lit le pourcentage et la charge', () => {
    expect(decodeBattery(1, 8, 64)).toEqual({ percent: 64, charging: true })
    expect(decodeBattery(0, 1, 91)).toEqual({ percent: 91, charging: false })
  })
})

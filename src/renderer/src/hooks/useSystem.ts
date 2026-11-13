import { useEffect, useState } from 'react'
import type { SystemStatus } from '../../../shared/types'
import { api } from '../api'

const formatTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Heure « HH:MM », mise à jour pile au changement de minute. */
export function useClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()))
  useEffect(() => {
    let timer = 0
    const schedule = (): void => {
      const now = new Date()
      setTime(formatTime(now))
      timer = window.setTimeout(schedule, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])
  return time
}

const STATUS_POLL_MS = 30_000

/** Wi-Fi et batterie réels (null tant que la première lecture n'est pas revenue). */
export function useSystemStatus(): SystemStatus | null {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  useEffect(() => {
    let alive = true
    const read = (): void => {
      api
        .systemStatus()
        .then((s) => {
          if (alive) setStatus(s)
        })
        .catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, STATUS_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])
  return status
}

/** Vrai si au moins une manette est branchée. */
export function useGamepadConnected(): boolean {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    const check = (): void => setConnected(navigator.getGamepads().some((p) => p !== null))
    check()
    window.addEventListener('gamepadconnected', check)
    window.addEventListener('gamepaddisconnected', check)
    return () => {
      window.removeEventListener('gamepadconnected', check)
      window.removeEventListener('gamepaddisconnected', check)
    }
  }, [])
  return connected
}

import { memo, type ReactElement } from 'react'
import type { ProfileView } from '../demo/library'
import { useClock, useSystemStatus } from '../hooks/useSystem'
import { EthernetIcon, WifiIcon } from './icons'
import s from './home.module.css'

interface Props {
  profiles: readonly ProfileView[]
  activeProfile: number
  /** Index du profil sous le curseur, ou -1 si la zone des profils n'a pas le focus. */
  focusedProfile: number
  title: string
}

const StatusCluster = memo(function StatusCluster(): ReactElement {
  const time = useClock()
  const status = useSystemStatus()
  const wifi = status?.wifi ?? null
  const battery = status?.battery ?? null
  return (
    <div className={s.status}>
      <span className={s.clock}>{time}</span>
      {status && (
        <span className={s.statusIcon} title={wifi ? (wifi.ssid ?? 'Wi-Fi') : 'Réseau filaire'}>
          {wifi ? <WifiIcon level={wifi.signal === null || wifi.signal >= 67 ? 3 : wifi.signal >= 34 ? 2 : 1} /> : <EthernetIcon />}
        </span>
      )}
      {battery && (
        <span className={s.battery} data-low={battery.percent <= 15 && !battery.charging}>
          <span className={s.batteryBody}>
            <span className={s.batteryFill} style={{ transform: `scaleX(${battery.percent / 100})` }} />
            {battery.charging && (
              <svg className={s.batteryBolt} viewBox="0 0 10 12" aria-hidden="true">
                <path d="M6 0L1 7h3l-1 5 6-7.500H5.500z" fill="currentColor" />
              </svg>
            )}
          </span>
          <span className={s.batteryCap} />
        </span>
      )}
    </div>
  )
})

export function TopBar({ profiles, activeProfile, focusedProfile, title }: Props): ReactElement {
  return (
    <>
      <div className={s.profiles}>
        {profiles.map((p, i) => (
          <div
            key={p.id}
            className={s.avatar}
            data-active={i === activeProfile}
            data-focused={i === focusedProfile}
            style={{ background: `linear-gradient(140deg, ${p.color}, color-mix(in srgb, ${p.color} 55%, #000))` }}
            title={p.name}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>
      {/* `key` relance l'animation d'apparition à chaque changement de titre. */}
      <h1 key={title} className={s.title}>
        {title}
      </h1>
      <StatusCluster />
    </>
  )
}

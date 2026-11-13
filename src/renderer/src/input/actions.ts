/**
 * Actions de navigation, communes au clavier et à la manette.
 * `options` : bouton Y / Suppr (options du jeu). `menu` : bouton + / Tab.
 */
export type Action = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back' | 'options' | 'menu' | 'prevTab' | 'nextTab'

export const DIRECTIONS: ReadonlySet<Action> = new Set<Action>(['left', 'right', 'up', 'down'])

export type ActionHandler = (action: Action) => void

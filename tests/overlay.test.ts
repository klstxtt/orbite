import { readFileSync, writeFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, screen: {} }))

import { overlayPage } from '../src/main/launch/overlay'

const PIXEL = 'data:image/png;base64,iVBORw0KGgo='

describe('overlayPage', () => {
  it('met le jeu en fond, sa jaquette et une barre de chargement', () => {
    const html = overlayPage('Mon <jeu>', { backdrop: PIXEL, blur: false, icon: PIXEL })
    expect(html).toContain(`background-image:url(${PIXEL})`)
    expect(html).toContain(`<img id="icon" src="${PIXEL}"`)
    expect(html).toContain('<div id="b" class="ind">')
    expect(html).toContain('Mon &#60;jeu&#62;')
    expect(html).not.toContain('<jeu>')
  })

  it('sans image : fond noir, pas de jaquette', () => {
    const html = overlayPage('Jeu', { backdrop: null, blur: false, icon: null })
    expect(html).not.toContain('background-image')
    expect(html).not.toContain('<img')
  })

  it('refuse une adresse qui n’est pas une image data:', () => {
    const html = overlayPage('Jeu', { backdrop: 'https://exemple.test/a.png', blur: true, icon: 'data:text/html;base64,AAAA' })
    expect(html).not.toContain('exemple.test')
    expect(html).not.toContain('data:text/html')
  })

  // Aperçu à l'œil : CL_OVERLAY_OUT=<fichier html> CL_OVERLAY_IMG=<jpeg>.
  it.runIf(process.env.CL_OVERLAY_OUT)('écrit un aperçu', () => {
    const img = `data:image/jpeg;base64,${readFileSync(process.env.CL_OVERLAY_IMG ?? '').toString('base64')}`
    writeFileSync(process.env.CL_OVERLAY_OUT ?? '', overlayPage('Pokémon Pokopia', { backdrop: img, blur: false, icon: img }))
  })
})

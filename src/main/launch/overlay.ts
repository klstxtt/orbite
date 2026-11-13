import { BrowserWindow, screen } from 'electron'

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const page = (title: string): string => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100%;background:#000;color:#fff;overflow:hidden;cursor:none;
    font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;-webkit-user-select:none}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.2vh}
  h1{margin:0;font-size:4.4vh;font-weight:600}
  #s{font-size:2.4vh;color:rgba(255,255,255,.72);min-height:3vh}
  #b{width:46vh;height:.7vh;border-radius:1vh;background:rgba(255,255,255,.14);overflow:hidden;opacity:0;transition:opacity .3s}
  #f{width:100%;height:100%;background:linear-gradient(90deg,#35d0ff,#a55cff);transform-origin:left;transform:scaleX(0);transition:transform .4s}
  #h{position:fixed;bottom:4vh;font-size:2vh;color:rgba(255,255,255,.4)}
</style></head><body>
<h1>${escapeHtml(title)}</h1><div id="s">Chargement…</div><div id="b"><div id="f"></div></div>
<div id="h">Maintenir B : afficher le jeu maintenant · Ctrl+Alt+Q ou Back+Start (2 s) : quitter le jeu</div>
<script>
  function setProgress(text, ratio) {
    document.getElementById('s').textContent = text;
    document.getElementById('b').style.opacity = ratio === null ? 0 : 1;
    if (ratio !== null) document.getElementById('f').style.transform = 'scaleX(' + ratio + ')';
  }
</script></body></html>`

/**
 * Écran noir affiché par-dessus tout pendant le chargement d'un jeu : il cache la fenêtre de
 * l'émulateur et ses écrans de préparation. Il ne prend pas le focus, pour que le jeu le garde.
 */
export class LoadingOverlay {
  private win: BrowserWindow | null = null

  /** `near` : fenêtre du lanceur, pour couvrir le même écran. */
  show(title: string, near: BrowserWindow | null): void {
    this.hide()
    const display = near ? screen.getDisplayMatching(near.getBounds()) : screen.getPrimaryDisplay()
    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#000000',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    this.win = win
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setBounds(display.bounds)
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page(title))}`)
    win.showInactive()
  }

  /** Texte sous le titre, et barre d'avancement (ratio de 0 à 1, ou null pour la cacher). */
  setProgress(text: string, ratio: number | null): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    const value = ratio === null ? 'null' : String(Math.max(0, Math.min(1, ratio)))
    void win.webContents.executeJavaScript(`setProgress(${JSON.stringify(text)}, ${value})`).catch(() => undefined)
  }

  hide(): void {
    const win = this.win
    this.win = null
    if (win && !win.isDestroyed()) win.destroy()
  }
}

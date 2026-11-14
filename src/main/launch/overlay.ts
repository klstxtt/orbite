import { BrowserWindow, screen } from 'electron'

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Images de l'écran de chargement, en adresses `data:` (la page n'a accès à rien d'autre). */
export interface OverlayArt {
  /** Image de fond du jeu, ou null : fond noir. */
  backdrop: string | null
  /** Le fond est une jaquette carrée étirée : on la floute. */
  blur: boolean
  /** Jaquette carrée affichée à côté du titre, ou null. */
  icon: string | null
}

const dataImage = (url: string | null): string => (url && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) ? url : '')

/** Page de l'écran de chargement : le jeu en fond, son titre, une barre d'avancement. */
export function overlayPage(title: string, art: OverlayArt): string {
  const backdrop = dataImage(art.backdrop)
  const icon = dataImage(art.icon)
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html,body{margin:0;height:100%;background:#000;color:#fff;overflow:hidden;cursor:none;
    font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;-webkit-user-select:none}
  #bg{position:fixed;inset:${art.blur ? '-6vh' : '0'};background:center/cover no-repeat;opacity:0;
    ${art.blur ? 'filter:blur(4vh) saturate(1.2);' : ''}animation:in 1.1s ease-out .1s forwards,zoom 40s linear forwards}
  #shade{position:fixed;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,.1) 40%,rgba(0,0,0,.88) 100%)}
  #box{position:fixed;left:7vh;right:7vh;bottom:11vh;display:flex;align-items:flex-end;gap:3.2vh;
    opacity:0;animation:up .6s ease-out .35s forwards}
  #icon{width:15vh;height:15vh;border-radius:2.4vh;box-shadow:0 1.2vh 4vh rgba(0,0,0,.6);flex:none}
  #txt{flex:1;min-width:0}
  h1{margin:0 0 .8vh;font-size:5vh;font-weight:650;text-shadow:0 .3vh 1.6vh rgba(0,0,0,.7);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #s{font-size:2.4vh;color:rgba(255,255,255,.8);min-height:3.2vh;text-shadow:0 .2vh 1vh rgba(0,0,0,.7)}
  #b{margin-top:1.6vh;width:100%;height:.9vh;border-radius:1vh;background:rgba(255,255,255,.2);overflow:hidden}
  #f{width:100%;height:100%;border-radius:1vh;background:linear-gradient(90deg,#35d0ff,#a55cff);
    transform-origin:left;transform:scaleX(0);transition:transform .4s}
  #b.ind #f{width:28%;transform:none;transition:none;animation:slide 1.5s ease-in-out infinite}
  #h{position:fixed;left:7vh;bottom:4vh;font-size:1.9vh;color:rgba(255,255,255,.5)}
  @keyframes in{to{opacity:1}}
  @keyframes zoom{from{transform:scale(1)}to{transform:scale(1.12)}}
  @keyframes up{from{opacity:0;transform:translateY(2.5vh)}to{opacity:1;transform:none}}
  @keyframes slide{from{margin-left:-28%}to{margin-left:100%}}
</style></head><body>
<div id="bg"${backdrop ? ` style="background-image:url(${backdrop})"` : ''}></div><div id="shade"></div>
<div id="box">${icon ? `<img id="icon" src="${icon}" alt="">` : ''}<div id="txt">
<h1>${escapeHtml(title)}</h1><div id="s">Chargement…</div><div id="b" class="ind"><div id="f"></div></div></div></div>
<div id="h">Maintenir B : afficher le jeu maintenant · Ctrl+Alt+Q ou Back+Start (2 s) : quitter le jeu</div>
<script>
  function setProgress(text, ratio) {
    document.getElementById('s').textContent = text;
    document.getElementById('b').className = ratio === null ? 'ind' : '';
    document.getElementById('f').style.transform = ratio === null ? '' : 'scaleX(' + ratio + ')';
  }
</script></body></html>`
}

/**
 * Écran affiché par-dessus tout pendant le chargement d'un jeu : il cache la fenêtre de
 * l'émulateur et ses écrans de préparation. Il ne prend pas le focus, pour que le jeu le garde.
 */
export class LoadingOverlay {
  private win: BrowserWindow | null = null

  /** `near` : fenêtre du lanceur, pour couvrir le même écran. */
  show(title: string, art: OverlayArt, near: BrowserWindow | null): void {
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
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayPage(title, art))}`)
    win.showInactive()
  }

  /** Texte sous le titre, et barre d'avancement (ratio de 0 à 1, ou null : barre qui défile). */
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

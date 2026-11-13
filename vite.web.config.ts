import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Rendu seul dans un navigateur (sans Electron) : l'API système est remplacée par des valeurs factices.
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})

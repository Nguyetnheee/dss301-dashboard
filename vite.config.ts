import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // A URL is safe to expose; credentials must remain in the model service or a server-side proxy.
      'import.meta.env.MODEL_API_URL': JSON.stringify(env.MODEL_API_URL ?? ''),
    },
  }
})

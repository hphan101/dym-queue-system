import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, __dirname, 'VITE_')
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_REGISTRATION_API_URL']
      .filter((name) => !env[name]?.trim())
    if (missing.length) throw new Error(`Missing frontend build variables: ${missing.join(', ')}`)
  }
  return {
  plugins: [react()],
  server: {
    host: true, // Lắng nghe trên mạng LAN nội bộ khi chạy dev server
  },
  build: {
    // The lazy-loaded ward dataset and PDF libraries exceed the default limit.
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      '@astryxdesign/core/Layout',
      '@astryxdesign/core/Center',
      '@astryxdesign/core/Text',
      '@astryxdesign/core/TextInput',
      '@astryxdesign/core/Button',
      '@astryxdesign/core/Card',
      '@astryxdesign/core/Link',
      '@astryxdesign/core/Icon',
      '@astryxdesign/core/Avatar',
      '@astryxdesign/core/Badge',
      '@astryxdesign/core/Selector',
      '@astryxdesign/core/SideNav',
      '@astryxdesign/core/StatusDot',
      '@astryxdesign/core/theme',
      '@stylexjs/stylex',
      '@heroicons/react/24/outline',
      'lucide-react',
      'pdf-lib',
      '@pdf-lib/fontkit',
      '@supabase/supabase-js',
      '@tanstack/react-query',
    ],
  },
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Lắng nghe trên tất cả card mạng (0.0.0.0) để các máy trong mạng LAN truy cập được
    allowedHosts: true, // Cho phép truy cập qua domain tunnel bên ngoài (Cloudflare, ngrok, localtunnel)
  },
  build: {
    // The lazy-loaded ward dataset and PDF libraries exceed the default limit.
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
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
})

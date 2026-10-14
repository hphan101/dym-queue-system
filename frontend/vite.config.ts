import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The lazy-loaded ward dataset is 114 kB after compression.
    chunkSizeWarningLimit: 750,
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
    ],
  },
})

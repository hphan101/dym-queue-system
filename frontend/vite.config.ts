import path from 'node:path'
import { copyFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const cloudflarePreview = mode === 'cloudflare-preview';
  const cloudflarePages = mode === 'cloudflare-pages';
  const cloudflare = cloudflarePreview || cloudflarePages || mode === 'cloudflare';
  if (command === 'build' && !cloudflare) {
    const env = loadEnv(mode, __dirname, 'VITE_')
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_REGISTRATION_API_URL']
      .filter((name) => !env[name]?.trim())
    if (missing.length) throw new Error(`Missing frontend build variables: ${missing.join(', ')}`)
  }
  return {
  define: {
    __DYM_CLOUDFLARE_PREVIEW__: JSON.stringify(cloudflarePreview),
    __DYM_CLOUDFLARE__: JSON.stringify(cloudflare),
    ...(cloudflare ? {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
      'import.meta.env.VITE_REGISTRATION_API_URL': JSON.stringify('/functions/v1/register'),
    } : {}),
  },
  ...(cloudflare ? {
    envDir: false,
  } : {}),
  plugins: [react(), ...(cloudflarePages ? [{
    name: 'dym-cloudflare-pages',
    apply: 'build' as const,
    writeBundle({ dir }: { dir?: string }) {
      if (!dir) throw new Error('The Pages build requires a directory.');
      for (const file of ['_worker.js', '_routes.json']) {
        copyFileSync(path.resolve(__dirname, 'cloudflare-pages', file), path.join(dir, file));
      }
    },
  }] : [])],
  server: {
    host: true, // Lắng nghe trên mạng LAN nội bộ khi chạy dev server
  },
  build: {
    // The lazy-loaded ward dataset and PDF libraries exceed the default limit.
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: [
      ...(cloudflare ? [{
        find: /^(?:@\/|(?:\.\.\/)+)lib\/supabaseClient$/,
        replacement: path.resolve(__dirname, './src/lib/cloudflarePreviewClient.ts'),
      }] : []),
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
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

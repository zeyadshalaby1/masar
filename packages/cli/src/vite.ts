import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { InlineConfig } from 'vite'
import { masar } from './plugin'

interface Options {
  mode: 'development' | 'production'
  /** Attach Vite's HMR websocket to this HTTP server (dev). */
  hmrServer?: Server
  /** No HMR at all (one-off commands like `masar routes`). */
  noHmr?: boolean
}

/** Masar owns the Vite config. A vite.config.ts in the app root is merged on top. */
export function viteConfig(root: string, { mode, hmrServer, noHmr }: Options): InlineConfig {
  const userConfig = join(root, 'vite.config.ts')
  return {
    root,
    mode,
    configFile: existsSync(userConfig) ? userConfig : false,
    appType: 'custom',
    logLevel: mode === 'development' ? 'warn' : 'info',
    clearScreen: false,
    plugins: [masar(root), react(), tailwindcss()],
    resolve: {
      alias: { '@': join(root, 'src') },
      dedupe: ['react', 'react-dom', '@inertiajs/react'],
    },
    server: {
      middlewareMode: true,
      // Masar shows its own overlay (masar/dev-overlay) instead of Vite's.
      hmr: noHmr ? false : hmrServer ? { server: hmrServer, overlay: false } : { overlay: false },
      watch: { ignored: ['**/database/**', '**/dist/**', '**/.masar/routes.gen.ts'] },
    },
    optimizeDeps: {
      entries: ['.masar/client.tsx'],
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@inertiajs/react'],
    },
    ssr: {
      // Masar packages ship TypeScript, so Vite always compiles them. In builds,
      // everything is bundled except database drivers (installed in the app).
      noExternal: mode === 'production' ? true : [/^masar(?:\/|$)/],
      external: mode === 'production' ? ['postgres', 'mongodb'] : undefined,
    },
    build: { emptyOutDir: true },
    environments: {
      client: {
        build: {
          outDir: 'dist/client',
          manifest: true,
          rolldownOptions: { input: join(root, '.masar/client.tsx') },
        },
      },
      ssr: {
        build: {
          outDir: 'dist/server',
          rolldownOptions: { input: { server: join(root, '.masar/server.ts') } },
        },
      },
    },
  }
}

import { readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { loadDymSnapshot, sourceSnapshotQuery } from './dym-snapshot.mjs';

const [config, persist, file, directory] = process.argv.slice(2);
if (config === '--source-query') {
  process.stdout.write(sourceSnapshotQuery());
} else {
  if (!config || !persist || !file || !directory) {
    throw new Error('Usage: node rehearse-snapshot.mjs <wrangler-config> <local-state-directory> <snapshot-json> <source-objects-directory>');
  }
  const env = process.env;
  const require = createRequire(env.DYM_WRANGLER_PACKAGE ? resolve(env.DYM_WRANGLER_PACKAGE) : import.meta.url);
  const { getPlatformProxy } = require('wrangler');
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  const root = await realpath(directory);
  const local = await getPlatformProxy({ configPath: resolve(config), persist: { path: resolve(persist, 'v3') }, remoteBindings: false });
  try {
    const counts = await loadDymSnapshot(local.env, snapshot, async key => {
      if (key.includes('\\') || key.includes(':') || key.split('/').some(part => !part || part === '.' || part === '..')) return null;
      const path = await realpath(resolve(root, key)).catch(() => null);
      if (!path) return null;
      const fromRoot = relative(root, path);
      if (!fromRoot || isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep)) return null;
      const info = await stat(path);
      return info.isFile() && info.size <= 10 * 1024 * 1024 ? readFile(path) : null;
    }, { loginName: env.DYM_MIGRATION_ADMIN_LOGIN, password: env.DYM_MIGRATION_ADMIN_PASSWORD });
    console.log(JSON.stringify(counts));
  } finally {
    await local.dispose();
  }
}

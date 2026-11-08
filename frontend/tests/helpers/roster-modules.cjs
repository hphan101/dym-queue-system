const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../src/features/admin/roster');
const modules = new Map();
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else modules.set(entry.name, file);
  }
}
scan(root);

function rosterPath(name) {
  const direct = path.resolve(root, name);
  if (fs.existsSync(direct)) return direct;
  const file = modules.get(path.basename(name));
  if (!file) throw new Error(`Unknown roster test module: ${name}`);
  return file;
}

function rosterImport(specifier) {
  // Keep mock keys stable when a production module moves into a feature folder.
  if (specifier.startsWith('.') && specifier.includes('/utils/'))
    return '../utils/' + path.basename(specifier);
  if (specifier.startsWith('.') && specifier.includes('/lib/'))
    return '../../../lib/' + path.basename(specifier);
  const basename = path.basename(specifier);
  if (
    specifier.startsWith('.') &&
    ['.ts', '.tsx', '.css'].some((extension) =>
      modules.has(basename + extension),
    )
  ) {
    return './' + basename;
  }
  return specifier;
}

module.exports = { rosterPath, rosterImport };

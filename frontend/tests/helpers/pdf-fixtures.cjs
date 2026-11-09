const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

exports.loadPdfFixtures = function (entry = 'bulkPrintPdf') {
  const modules = new Map();
  function asset(url) {
    const bytes = fs.readFileSync(path.join(root, 'public', url.split('?')[0]));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const result = {};
    modules.set(file, result);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const dependencies = (name) => {
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(file), name);
      return name.endsWith('.json') ? require(target) : load(target + '.ts');
    };
    class LocalXHR {
      open(_method, url) { this.url = url; }
      send() { this.status = 200; this.response = asset(this.url); this.onload(); }
    }
    new Function('exports', 'require', 'fetch', 'XMLHttpRequest', code)(result, dependencies,
      async (url) => ({ ok: true, arrayBuffer: async () => asset(url) }), LocalXHR);
    return result;
  }
  if (entry === 'bulkPrintPdf') {
    const builder = load(path.join(root, 'src/features/registration/bulkPrintPdfDocument.ts'));
    return {
      generateBulkPrintPdf: async (...args) => URL.createObjectURL(new Blob(
        [await builder.generateBulkPrintPdfBytes(...args)], { type: 'application/pdf' },
      )),
    };
  }
  return load(path.join(root, `src/features/registration/${entry}.ts`));
};

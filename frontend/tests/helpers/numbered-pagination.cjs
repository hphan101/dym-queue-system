const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../src/components/numbered-pagination.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const dependencies = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': { ChevronLeft: 'svg', ChevronRight: 'svg' },
  '@/components/ui/button': { Button: 'button' },
  './numbered-pagination.css': {},
};
new Function('exports', 'require', code)(module.exports, (name) => {
  if (!(name in dependencies)) throw new Error(`Missing pagination dependency: ${name}`);
  return dependencies[name];
});

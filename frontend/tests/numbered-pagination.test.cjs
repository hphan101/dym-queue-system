const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NumberedPagination } = require('./helpers/numbered-pagination.cjs');
const getPaginationItems = (currentPage, totalPages) => NumberedPagination({
  currentPage, totalPages, onPageChange() {},
}).props.children.flat().slice(1, -1).map((node) => node.type === 'button' ? node.props.children : node.key);

test('rows per page offers the configured sizes and resets to the first page', () => {
  const changes = [];
  const tree = NumberedPagination({ currentPage: 8, totalPages: 10, pageSize: 10,
    onPageChange: (page) => changes.push(['page', page]),
    onPageSizeChange: (size) => changes.push(['size', size]),
  });
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const all = nodes(tree);
  assert.deepEqual(all.filter((node) => node.type === 'SelectItem').map((node) => node.props.value), ['10', '20', '30', '40', '50']);
  const select = all.find((node) => node.type === 'Select');
  assert.equal(select.props.value, '10');
  select.props.onValueChange('50');
  assert.deepEqual(changes, [['size', 50], ['page', 1]]);
});

test('all four tables slice by the selected size and keep the final page in range', () => {
  const rows = Array.from({ length: 95 }, (_, id) => ({ id, status: id % 2 ? 'called' : 'waiting' }));
  for (const [file, names, inputName, outputName] of [
    ['reception/AdminPage', ['rowsForStatus', 'totalPages', 'visiblePage', 'pageStartIndex', 'paginatedRows'], 'filteredRows', 'paginatedRows'],
    ['registrations/RegistrationsPage', ['totalPages', 'visiblePage', 'pageStartIndex', 'paginatedRows'], 'filteredRows', 'paginatedRows'],
    ['accounts/StaffPage', ['totalPages', 'visiblePage', 'pageStartIndex', 'paginatedStaff'], 'filteredStaff', 'paginatedStaff'],
    ['roster/personnel/RosterPersonnelPage', ['totalPages', 'visiblePage', 'pageStartIndex', 'paginatedPersonnel'], 'filteredPersonnel', 'paginatedPersonnel'],
  ]) {
    const source = fs.readFileSync(path.resolve(__dirname, `../src/features/admin/${file}.tsx`), 'utf8');
    const ast = ts.createSourceFile(file + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = new Map();
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.getText(ast));
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const code = ts.transpileModule(names.map((name) => `const ${declarations.get(name)};`).join('\n') + `\nreturn { totalPages, visiblePage, rows: ${outputName} };`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const paginate = new Function(inputName, 'pageSize', 'currentPage', 'statusFilter', 'useMemo', code);
    for (const size of [10, 20, 30, 40, 50]) {
      for (const status of file === 'AdminPage' ? ['all', 'waiting', 'called'] : ['all']) {
        const expected = status === 'all' ? rows : rows.filter((row) => row.status === status);
        for (const page of [1, 2, 999]) {
          const result = paginate(rows, size, page, status, (fn) => fn());
          const total = Math.ceil(expected.length / size);
          assert.equal(result.totalPages, total, file);
          assert.equal(result.visiblePage, Math.min(page, total), file);
          const start = (result.visiblePage - 1) * size;
          assert.deepEqual(result.rows, expected.slice(start, start + size), file);
        }
      }
    }
    assert.deepEqual(paginate([], 20, 999, 'all', (fn) => fn()), { totalPages: 1, visiblePage: 1, rows: [] });
  }
});

test('page numbers preserve boundaries and selection with bounded size for large lists', () => {
  assert.deepEqual(getPaginationItems(1, 8), [1, 2, 'gap-2', 8]);
  assert.deepEqual(getPaginationItems(3, 5), [1, 2, 3, 4, 5]);
  for (const total of [1, 2, 5, 6, 7, 8, 100, 10000]) {
    for (const current of new Set([1, Math.ceil(total / 2), total])) {
      const items = getPaginationItems(current, total);
      const pages = items.filter((item) => typeof item === 'number');
      assert.ok(pages.includes(current));
      assert.equal(pages[0], 1);
      assert.equal(pages.at(-1), total);
      assert.equal(new Set(items).size, items.length);
      assert.ok(items.length <= 7);
      assert.ok(pages.every((page) => page >= 1 && page <= total));
    }
  }
});

test('pagination supports direct selection, previous/next and disabled boundaries', () => {
  const changes = [];
  const render = (currentPage, totalPages = 8) => {
    const nav = NumberedPagination({ currentPage, totalPages, onPageChange: (page) => changes.push(page) });
    return nav.props.children.flat().filter((node) => node.type === 'button');
  };
  let buttons = render(1);
  assert.equal(buttons[0].props.disabled, true);
  assert.equal(buttons.find((button) => button.props['aria-current'] === 'page').props.children, 1);
  buttons.find((button) => button.props['aria-label'] === 'Trang 8').props.onClick();
  buttons.at(-1).props.onClick();
  buttons = render(8);
  assert.equal(buttons.at(-1).props.disabled, true);
  buttons[0].props.onClick();
  assert.deepEqual(changes, [8, 2, 7]);
  buttons = render(1, 1);
  assert.ok(buttons[0].props.disabled && buttons.at(-1).props.disabled);
});

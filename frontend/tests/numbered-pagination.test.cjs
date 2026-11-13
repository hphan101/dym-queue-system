const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NumberedPagination } = require('./helpers/numbered-pagination.cjs');
const getPaginationItems = (currentPage, totalPages) => NumberedPagination({
  currentPage, totalPages, onPageChange() {},
}).props.children.flat().slice(1, -1).map((node) => node.type === 'button' ? node.props.children : node.key);

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

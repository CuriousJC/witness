import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('library combines topic alternatives with month filters, handles no results, and clears selections', () => {
  const cards = [
    { dataset: { topics: '["Game marketing","Steam"]', month: '2026-11' } },
    { dataset: { topics: '["AI","Game industry"]', month: '2026-10' } },
    { dataset: { topics: '["Game marketing","Trailers"]', month: '2026-10' } },
    { dataset: { topics: '[]', month: '' } }, // Untagged older reading remains available.
  ];
  const selected = { topic: [], month: [] }, handlers = {};
  const form = {
    querySelectorAll: selector => selected[selector.includes('"topic"') ? 'topic' : 'month'].map(value => ({ value })),
    addEventListener: (event, handler) => { handlers[event] = handler; },
  };
  const count = {}, empty = {}, sidebar = { hidden: true };
  const document = {
    getElementById: id => ({ 'library-filters': form, 'edition-count': count, 'no-results': empty })[id],
    querySelectorAll: () => cards,
    querySelector: () => sidebar,
  };
  vm.runInNewContext(fs.readFileSync(new URL('../web/library.js', import.meta.url), 'utf8'), { document });
  const visible = () => cards.map(card => !card.hidden);
  assert.equal(sidebar.hidden, false);
  assert.deepEqual(visible(), [true, true, true, true]);
  selected.topic = ['Steam', 'Trailers']; handlers.change();
  assert.deepEqual(visible(), [true, false, true, false]);
  selected.month = ['2026-10']; handlers.change();
  assert.deepEqual(visible(), [false, false, true, false]);
  assert.equal(count.textContent, '1 of 4 editions');
  selected.topic = ['Steam']; handlers.change();
  assert.deepEqual(visible(), [false, false, false, false]);
  assert.equal(empty.hidden, false);
  selected.month = ['2026-10', '2026-11']; handlers.change();
  assert.deepEqual(visible(), [true, false, false, false]);
  handlers.reset();
  assert.deepEqual(visible(), [true, true, true, true]);
  assert.equal(empty.hidden, true);
});

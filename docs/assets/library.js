/* A classic script so the library also filters when opened directly from disk. */
(() => {
  const form = document.getElementById('library-filters');
  const cards = [...document.querySelectorAll('.edition')];
  const count = document.getElementById('edition-count');
  const empty = document.getElementById('no-results');
  function update(clear = false) {
    const selected = name => clear ? [] : [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
    const topics = selected('topic'), months = selected('month');
    let visible = 0;
    for (const card of cards) {
      const matches = (!topics.length || topics.some(topic => JSON.parse(card.dataset.topics).includes(topic))) &&
        (!months.length || months.includes(card.dataset.month));
      card.hidden = !matches;
      if (matches) visible++;
    }
    count.textContent = `${visible} of ${cards.length} ${cards.length === 1 ? 'edition' : 'editions'}`;
    empty.hidden = visible > 0 || cards.length === 0;
  }
  form.addEventListener('change', () => update());
  form.addEventListener('reset', () => update(true));
  document.querySelector('.library-filters').hidden = false;
  update();
})();

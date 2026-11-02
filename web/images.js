/* Keep figure links usable without JavaScript; enhance them locally when supported. */
(() => {
  if (typeof HTMLDialogElement === 'undefined') return;
  const dialog = document.createElement('dialog');
  dialog.className = 'image-dialog';
  dialog.setAttribute('aria-label', 'Enlarged image');
  dialog.innerHTML = '<button class="image-close" type="button" aria-label="Close enlarged image" autofocus>×</button><button class="image-dismiss" type="button" aria-label="Close enlarged image"><img alt=""></button><p class="image-caption"></p>';
  document.body.append(dialog);
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('.image-caption');
  let opener;
  dialog.querySelector('.image-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.image-dismiss').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('image-open');
    image.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('.prose figure > a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const thumbnail = link.querySelector('img');
    if (!thumbnail) return;
    event.preventDefault();
    opener = link;
    image.src = link.href;
    image.alt = thumbnail.alt;
    caption.textContent = link.closest('figure').querySelector('figcaption')?.textContent || '';
    dialog.showModal();
    document.body.classList.add('image-open');
  });
})();

export function initTermsModal(doc: Document): void {
  const dialog = doc.getElementById('tos');
  const openBtn = doc.getElementById('tos-open');
  const closeBtn = doc.getElementById('tos-close');
  if (!(dialog instanceof HTMLDialogElement) || !openBtn) return;

  openBtn.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });

  closeBtn?.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

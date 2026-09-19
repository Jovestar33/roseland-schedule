/** Re-measure when an initially hidden editor becomes visible or its width changes. */
export function observeTextareaSize(el: HTMLTextAreaElement): () => void {
  let disposed = false, width = -1;
  const resize = () => {
    if (disposed || el.clientWidth === 0) return;
    width = el.clientWidth;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (el.clientWidth !== width) resize();
  });
  observer?.observe(el);
  const fonts = el.ownerDocument?.fonts;
  void fonts?.ready.then(resize);
  fonts?.addEventListener('loadingdone', resize);
  return () => { disposed = true; observer?.disconnect(); fonts?.removeEventListener('loadingdone', resize); };
}

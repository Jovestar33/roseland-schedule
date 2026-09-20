interface CollapseOptions {
  rows: number;
  expanded: boolean;
  onOverflow: (overflow: boolean) => void;
}

/** Re-measure when an initially hidden editor becomes visible or its width changes. */
export function observeTextareaSize(el: HTMLTextAreaElement, collapse?: CollapseOptions): () => void {
  let disposed = false, width = -1;
  const resize = () => {
    if (disposed || el.clientWidth === 0) return;
    width = el.clientWidth;
    el.style.height = 'auto';
    const fullHeight = el.scrollHeight;
    if (!collapse) {
      el.style.height = `${fullHeight}px`;
      return;
    }
    const css = getComputedStyle(el);
    const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
    const border = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
    const lineHeight = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.45;
    const limit = lineHeight * collapse.rows + padding;
    const overflow = fullHeight > limit + 1;
    collapse.onOverflow(overflow);
    const height = collapse.expanded ? fullHeight : Math.min(fullHeight, limit);
    el.style.height = `${css.boxSizing === 'border-box' ? height + border : height - padding}px`;
    if (!collapse.expanded) el.scrollTop = 0;
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

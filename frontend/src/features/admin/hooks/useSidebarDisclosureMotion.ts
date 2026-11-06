import { useLayoutEffect, useRef } from 'react';

export function useSidebarDisclosureMotion(open: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ height: number; opacity: string } | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const from = start.current;
    start.current = null;
    const view = panel?.ownerDocument.defaultView;
    if (!panel || !from || !view || view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const easing = view.getComputedStyle(panel).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
    const animation = panel.animate?.([
      { height: `${from.height}px`, opacity: from.opacity },
      { height: open ? `${panel.scrollHeight}px` : '0px', opacity: open ? '1' : '0' },
    ], { duration: 200, easing });
    return () => animation?.cancel();
  }, [open]);

  const prepare = (clickDetail: number) => {
    const panel = panelRef.current;
    start.current = clickDetail > 0 && panel ? {
      height: panel.getBoundingClientRect().height,
      opacity: panel.ownerDocument.defaultView?.getComputedStyle(panel).opacity ?? '1',
    } : null;
  };

  return { panelRef, prepare };
}

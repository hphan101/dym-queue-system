import { useLayoutEffect, useRef } from 'react';

export function useSidebarDisclosureMotion(open: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const start = useRef(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const from = start.current;
    start.current = false;
    const view = panel?.ownerDocument.defaultView;
    if (!panel || !from || !open || !view || view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = panel.animate?.([
      { opacity: 0, transform: 'translateY(-4px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    return () => animation?.cancel();
  }, [open]);

  const prepare = (clickDetail: number) => {
    start.current = clickDetail > 0;
  };

  return { panelRef, prepare };
}

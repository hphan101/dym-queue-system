import { useEffect, useState } from 'react';

export const COMPACT_SIDEBAR_QUERY = '(max-width: 63.99rem)';

export function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(COMPACT_SIDEBAR_QUERY).matches;
}

export function useSidebarResponsive() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(getInitialSidebarCollapsed);

  useEffect(() => {
    const compactSidebar = window.matchMedia(COMPACT_SIDEBAR_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsSidebarCollapsed(event.matches);
    };

    setIsSidebarCollapsed(compactSidebar.matches);
    compactSidebar.addEventListener('change', handleViewportChange);
    return () => {
      compactSidebar.removeEventListener('change', handleViewportChange);
    };
  }, []);

  return { isSidebarCollapsed, setIsSidebarCollapsed };
}


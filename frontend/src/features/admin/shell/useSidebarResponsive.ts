import { useCallback, useEffect, useState, type SetStateAction } from 'react';

export const COMPACT_SIDEBAR_QUERY = '(max-width: 63.99rem)';

export function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(COMPACT_SIDEBAR_QUERY).matches;
}

let sharedSidebarCollapsed: boolean = getInitialSidebarCollapsed();
const sidebarListeners = new Set<(collapsed: boolean) => void>();

function updateSharedSidebarCollapsed(action: SetStateAction<boolean>) {
  const nextCollapsed =
    typeof action === 'function' ? action(sharedSidebarCollapsed) : action;
  if (nextCollapsed === sharedSidebarCollapsed) return;
  sharedSidebarCollapsed = nextCollapsed;
  sidebarListeners.forEach((listener) => listener(nextCollapsed));
}

export function useSidebarResponsive() {
  const [isSidebarCollapsed, setLocalSidebarCollapsed] = useState<boolean>(
    sharedSidebarCollapsed,
  );

  useEffect(() => {
    setLocalSidebarCollapsed(sharedSidebarCollapsed);
    sidebarListeners.add(setLocalSidebarCollapsed);

    const compactSidebar = window.matchMedia(COMPACT_SIDEBAR_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      updateSharedSidebarCollapsed(event.matches);
    };

    compactSidebar.addEventListener('change', handleViewportChange);
    return () => {
      sidebarListeners.delete(setLocalSidebarCollapsed);
      compactSidebar.removeEventListener('change', handleViewportChange);
    };
  }, []);

  const setIsSidebarCollapsed = useCallback(
    (action: SetStateAction<boolean>) => {
      updateSharedSidebarCollapsed(action);
    },
    [],
  );

  return { isSidebarCollapsed, setIsSidebarCollapsed };
}

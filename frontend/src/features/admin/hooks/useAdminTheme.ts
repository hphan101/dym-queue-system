import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import type { AdminThemeMode } from '../AdminSidebar';

export const THEME_STORAGE_KEY = 'dym-admin-theme';

export function getInitialThemeMode(): AdminThemeMode {
  try {
    const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedMode === 'light' || storedMode === 'dark' ? storedMode : 'dark';
  } catch {
    return 'dark';
  }
}

let sharedThemeMode: AdminThemeMode = getInitialThemeMode();
const themeListeners = new Set<(mode: AdminThemeMode) => void>();

function updateSharedThemeMode(action: SetStateAction<AdminThemeMode>) {
  const nextMode =
    typeof action === 'function' ? action(sharedThemeMode) : action;
  if (nextMode === sharedThemeMode) return;
  sharedThemeMode = nextMode;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
  } catch {
    // Theme preference remains active for current session
  }
  themeListeners.forEach((listener) => listener(nextMode));
}

export function useAdminTheme() {
  const [themeMode, setLocalThemeMode] = useState<AdminThemeMode>(sharedThemeMode);

  useEffect(() => {
    setLocalThemeMode(sharedThemeMode);
    themeListeners.add(setLocalThemeMode);
    return () => {
      themeListeners.delete(setLocalThemeMode);
    };
  }, []);

  const setThemeMode = useCallback((action: SetStateAction<AdminThemeMode>) => {
    updateSharedThemeMode(action);
  }, []);

  const toggleTheme = useCallback(() => {
    updateSharedThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { themeMode, setThemeMode, toggleTheme };
}

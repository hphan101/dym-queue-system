import { useEffect, useState } from 'react';
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

export function useAdminTheme() {
  const [themeMode, setThemeMode] = useState<AdminThemeMode>(getInitialThemeMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Theme preference remains active for current session
    }
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  return { themeMode, setThemeMode, toggleTheme };
}


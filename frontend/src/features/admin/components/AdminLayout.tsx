import type { ComponentProps, ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/astryx.css';
import { cn } from '@/lib/utils';
import { AdminSidebar } from '../AdminSidebar';
import { signOutAdminSession } from '../adminIdentity';
import { useAdminTheme } from '../hooks/useAdminTheme';
import { useSidebarResponsive } from '../hooks/useSidebarResponsive';
import { dymAdminTheme } from '../theme';
import '../admin.css';

type AdminLayoutProps = Pick<
  ComponentProps<typeof AdminSidebar>,
  'activePage' | 'branch' | 'date' | 'staffName' | 'isAdmin' | 'staffRole'
> & {
  className?: string;
  children: ReactNode;
  overlays?: ReactNode;
};

export function AdminLayout({
  children,
  overlays,
  className,
  ...sidebar
}: AdminLayoutProps) {
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div
        className={cn('dym-admin-shell', className)}
        data-color-mode={themeMode}
      >
        <AdminSidebar
          {...sidebar}
          themeMode={themeMode}
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={setIsSidebarCollapsed}
          onThemeToggle={() =>
            setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
          }
          onLogout={() => void signOutAdminSession()}
        />
        <div className="dym-admin-workspace">{children}</div>
        {overlays}
      </div>
    </Theme>
  );
}

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/astryx.css';

import { AdminSidebar, type AdminPageKey } from '../AdminSidebar';
import {
  getInitialStaffName,
  signOutAdminSession,
} from '../adminIdentity';
import { AdminHeader } from '../components/AdminHeader';
import { useAdminTheme } from '../hooks/useAdminTheme';
import { useSidebarResponsive } from '../hooks/useSidebarResponsive';
import { dymAdminTheme } from '../theme';
import { useRosterData } from './useRosterData';
import '../admin.css';
import '../staff.css';
import './roster.css';

export interface RosterShellProps {
  activePage: Extract<
    AdminPageKey,
    | 'roster-dashboard'
    | 'roster-settlement'
    | 'roster-insite'
    | 'roster-onsite'
    | 'roster-personnel'
  >;
  title: string;
  authorizedIsAdmin?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function RosterShell({
  activePage,
  title,
  authorizedIsAdmin = true,
  headerActions,
  children,
}: RosterShellProps) {
  const { themeMode, setThemeMode } = useAdminTheme();
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarResponsive();
  const [staffName] = useState(getInitialStaffName);
  const { selectedBranch, selectedDate, errorBanner, successBanner, clearBanners } = useRosterData();

  return (
    <Theme theme={dymAdminTheme} mode={themeMode}>
      <div className="dym-admin-shell" data-color-mode={themeMode}>
        <AdminSidebar
          activePage={activePage}
          branch={selectedBranch}
          date={selectedDate}
          staffName={staffName}
          isAdmin={authorizedIsAdmin}
          staffRole={authorizedIsAdmin ? 'admin' : 'operator'}
          themeMode={themeMode}
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={setIsSidebarCollapsed}
          onThemeToggle={() =>
            setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
          }
          onLogout={() => void signOutAdminSession()}
        />

        <div className="dym-admin-workspace">
          <AdminHeader title={title} actions={headerActions} />

          <main className="dym-admin-content">
            {errorBanner && (
              <div className="dym-data-error flex items-center justify-between gap-3" role="alert">
                <span>{errorBanner}</span>
                <button
                  type="button"
                  onClick={clearBanners}
                  aria-label="Đóng thông báo lỗi"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {successBanner && (
              <div className="dym-staff-success" role="status">
                <span>{successBanner}</span>
                <button
                  type="button"
                  onClick={clearBanners}
                  aria-label="Đóng thông báo"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </Theme>
  );
}
